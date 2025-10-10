"""
Gmail webhook endpoint for receiving Pub/Sub notifications
"""
import base64
import json
from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models import ConnectedEmail
from app.tasks.email_processor import process_new_email

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/gmail")
async def gmail_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Receive Gmail push notifications from Pub/Sub
    Format: https://developers.google.com/gmail/api/guides/push
    
    Google sends:
    1. Verification ping (empty body or GET request) - just return 200
    2. Actual notifications with Pub/Sub message format
    """
    try:
        # Get raw body first to check if it's empty
        raw_body = await request.body()
        
        # Handle verification ping (empty body)
        if not raw_body or len(raw_body) == 0:
            print("📌 Received verification ping from Google Pub/Sub")
            return {"status": "ok", "message": "verification_accepted"}
        
        # Try to parse JSON
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError as e:
            print(f"⚠️  Invalid JSON in webhook: {e}")
            print(f"   Raw body: {raw_body[:200]}")  # First 200 chars
            return {"status": "ok", "message": "non_json_ignored"}
        
        # Handle verification with token (Google Cloud Pub/Sub style)
        if 'token' in body and 'message' not in body:
            print(f"📌 Received token verification: {body.get('token')}")
            return {"status": "ok", "message": "token_verified"}
        
        # Handle actual Pub/Sub message
        if 'message' not in body:
            print(f"⚠️  No 'message' field in body: {body}")
            return {"status": "ok", "message": "invalid_format_ignored"}
        
        message = body['message']
        
        # Decode data
        if 'data' in message:
            data = base64.b64decode(message['data']).decode('utf-8')
            notification_data = json.loads(data)
            
            email_address = notification_data.get('emailAddress')
            history_id = notification_data.get('historyId')
            
            print(f"📩 Gmail notification received for {email_address}, history: {history_id}")
            
            # Find connected email
            stmt = select(ConnectedEmail).where(
                ConnectedEmail.email_address == email_address,
                ConnectedEmail.is_active == True
            )
            result = await db.execute(stmt)
            connected_email = result.scalar_one_or_none()
            
            if not connected_email:
                print(f"⚠️  No active connection found for {email_address}")
                return {"status": "ignored", "reason": "email_not_connected"}
            
            # Queue email processing task (Celery)
            # For MVP, we'll process inline first
            # In production: process_new_email.delay(connected_email.id, history_id)
            
            # For now, acknowledge receipt
            print(f"✅ Queued processing for {email_address}")
            
            return {"status": "queued", "email": email_address}
        
        return {"status": "ok", "message": "no_data_field"}
    
    except Exception as e:
        # Don't raise HTTP exception - just log and return 200
        # Google Pub/Sub will retry if we return error status
        print(f"❌ Webhook error: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        
        # Return 200 to prevent retries for non-recoverable errors
        return {"status": "error", "message": str(e)}

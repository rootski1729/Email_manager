"""
Celery task for processing new emails
"""
from datetime import datetime
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models import ConnectedEmail, User, EmailFilter
from app.services import GoogleOAuthService, FilterService
from app.services.whatsapp_service import whatsapp_service


@celery_app.task(name="process_new_email")
def process_new_email(connected_email_id: int, gmail_message_id: str):
    """
    Process a new email received via Gmail push notification
    
    Args:
        connected_email_id: ID of the ConnectedEmail record
        gmail_message_id: Gmail message ID from the notification
    """
    import asyncio
    
    # Run async task in sync context
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        _process_email_async(connected_email_id, gmail_message_id)
    )


async def _process_email_async(connected_email_id: int, gmail_message_id: str):
    """Async implementation of email processing"""
    async with AsyncSessionLocal() as db:
        try:
            # Get connected email
            stmt = select(ConnectedEmail).where(ConnectedEmail.id == connected_email_id)
            result = await db.execute(stmt)
            connected_email = result.scalar_one_or_none()
            
            if not connected_email or not connected_email.is_active:
                print(f"⚠️  Connected email {connected_email_id} not found or inactive")
                return {"status": "skipped", "reason": "inactive"}
            
            print(f"📧 Processing email {gmail_message_id} for {connected_email.email_address}")
            
            # Fetch email metadata from Gmail (with token validation)
            # First ensure we have a valid token
            valid_token = await GoogleOAuthService.get_valid_access_token(db, connected_email)
            
            email_data = await GoogleOAuthService.fetch_email_metadata(
                connected_email,
                gmail_message_id
            )
            
            if not email_data:
                print(f"❌ Failed to fetch email {gmail_message_id}")
                return {"status": "failed", "reason": "fetch_failed"}
            
            # Check if we need full body (for body filters)
            user_id = connected_email.user_id
            filters = await FilterService.get_user_filters(db, user_id)
            
            # Check if any filter needs body content
            needs_body = any(
                'body_contains' in f.conditions 
                for f in filters
            )
            
            if needs_body:
                body = await GoogleOAuthService.fetch_email_body(
                    connected_email,
                    gmail_message_id
                )
                email_data['body'] = body
            
            # Process email against filters
            filtered_email = await FilterService.process_email_against_filters(
                db=db,
                user_id=user_id,
                connected_email_id=connected_email_id,
                email_data=email_data
            )
            
            if filtered_email:
                print(f"✅ Email matched filter: {filtered_email.matched_filter_id}")
                
                # Get filter details for notifications
                filter_stmt = select(EmailFilter).where(EmailFilter.id == filtered_email.matched_filter_id)
                filter_result = await db.execute(filter_stmt)
                email_filter = filter_result.scalar_one_or_none()
                
                # Send WhatsApp notification if enabled
                if email_filter and await whatsapp_service.check_whatsapp_enabled(user_id, db):
                    # Get user's phone number
                    user_stmt = select(User).where(User.id == user_id)
                    user_result = await db.execute(user_stmt)
                    user = user_result.scalar_one_or_none()
                    
                    if user and user.phone_number and user.phone_verified:
                        success, error = await whatsapp_service.send_filter_notification(
                            phone_number=user.phone_number,
                            sender=email_data.get('from', 'Unknown'),
                            subject=email_data.get('subject', 'No Subject'),
                            filter_name=email_filter.name,
                            email_id=filtered_email.id
                        )
                        
                        if success:
                            print(f"📱 WhatsApp notification sent to {user.phone_number}")
                        else:
                            print(f"⚠️ WhatsApp notification failed: {error}")
                
                # TODO: Send other notifications based on action_type
                # - NOTIFY: In-app notification
                # - ARCHIVE: Auto-archive in Gmail
                
                return {
                    "status": "matched",
                    "filtered_email_id": filtered_email.id,
                    "filter_id": filtered_email.matched_filter_id
                }
            else:
                print(f"ℹ️  No filter matched for email {gmail_message_id}")
                return {"status": "no_match"}
        
        except Exception as e:
            print(f"❌ Error processing email: {str(e)}")
            return {"status": "error", "error": str(e)}


@celery_app.task(name="send_daily_digest")
def send_daily_digest():
    """Send daily email digest to users"""
    # TODO: Implement daily digest
    print("📨 Sending daily digest...")
    pass


@celery_app.task(name="refresh_expired_tokens")
def refresh_expired_tokens():
    """Refresh expired Google OAuth tokens"""
    # TODO: Implement token refresh
    print("🔄 Refreshing expired tokens...")
    pass

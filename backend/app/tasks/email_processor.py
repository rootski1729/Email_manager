import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.models import ConnectedEmail, User, EmailFilter, FilteredEmail
from app.services import GoogleOAuthService, FilterService
from app.services.whatsapp_service import whatsapp_service


@celery_app.task(name="process_new_email")
def process_new_email(connected_email_id: int, start_history_id: str, new_history_id: str):
    """
    Process a new email received via Gmail push notification
    
    Args:
        connected_email_id: ID of the ConnectedEmail record
        start_history_id: Gmail history ID to start fetching from (last known state)
        new_history_id: Gmail history ID from webhook (new current state)
    """
    # Run async task in sync context
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        _process_email_async(connected_email_id, start_history_id, new_history_id)
    )


async def _process_email_async(connected_email_id: int, start_history_id: str, new_history_id: str):
    """Async implementation of email processing - receives history_id range from webhook"""
    async with AsyncSessionLocal() as db:
        try:
            # Get connected email
            stmt = select(ConnectedEmail).where(ConnectedEmail.id == connected_email_id)
            result = await db.execute(stmt)
            connected_email = result.scalar_one_or_none()
            
            if not connected_email or not connected_email.is_active:
                print(f"⚠️  Connected email {connected_email_id} not found or inactive")
                return {"status": "skipped", "reason": "inactive"}
            
            print(f"📧 Processing history {start_history_id} → {new_history_id} for {connected_email.email_address}")
            
            # Fetch email metadata from Gmail (with token validation)
            # First ensure we have a valid token
            valid_token = await GoogleOAuthService.get_valid_access_token(db, connected_email)
            
            # Use Gmail History API to get actual message IDs that changed
            history_data = await GoogleOAuthService.get_history_changes(
                db=db,
                connected_email=connected_email,
                start_history_id=start_history_id
            )
            
            message_ids = history_data.get('message_ids', [])
            
            if not message_ids:
                # Check if history expired
                if history_data.get('error') == 'history_expired':
                    print(f"⚠️  History expired, falling back to latest unread message")
                    # Fallback: fetch latest unread message
                    inbox_data = await GoogleOAuthService.list_emails_from_inbox(
                        db=db,
                        connected_email=connected_email, 
                        max_results=1,
                        query="is:unread"
                    )
                    emails = inbox_data.get('emails', [])
                    if emails:
                        message_ids = [emails[0]['id']]
            
            if not message_ids:
                print(f"ℹ️  No new messages found in history {start_history_id}")
                return {"status": "skipped", "reason": "no_messages"}
            
            print(f"📧 Found {len(message_ids)} new message(s) to process")
            
            # Get user filters once (used for all messages)
            user_id = connected_email.user_id
            filters = await FilterService.get_user_filters(db, user_id)
            
            # Check if any filter needs body content
            needs_body = any(
                'body_contains' in f.conditions 
                for f in filters
            )
            
            # Process each new message
            processed_count = 0
            matched_count = 0
            
            for gmail_message_id in message_ids:
                try:
                    print(f"📧 Processing message {gmail_message_id}")
                    
                    email_data = await GoogleOAuthService.fetch_email_metadata(
                        connected_email,
                        gmail_message_id
                    )
                    
                    if not email_data:
                        print(f"❌ Failed to fetch email {gmail_message_id}, skipping")
                        continue
                    
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
                    
                    processed_count += 1
                    
                    if filtered_email:
                        matched_count += 1
                        print(f"✅ Email matched filter: {filtered_email.matched_filter_id}")
                        
                        # Get filter details for notifications
                        filter_stmt = select(EmailFilter).where(EmailFilter.id == filtered_email.matched_filter_id)
                        filter_result = await db.execute(filter_stmt)
                        email_filter = filter_result.scalar_one_or_none()
                        
                        # Queue WhatsApp notification if enabled (rate-limited)
                        if email_filter and await whatsapp_service.check_whatsapp_enabled(user_id, db):
                            # Get user's phone number
                            user_stmt = select(User).where(User.id == user_id)
                            user_result = await db.execute(user_stmt)
                            user = user_result.scalar_one_or_none()
                            
                            if user and user.phone_number and user.phone_verified:
                                # Queue WhatsApp notification (rate-limited: 30/min)
                                send_filter_whatsapp_notification.delay(
                                    phone_number=user.phone_number,
                                    sender=email_data.get('sender', 'Unknown'),
                                    subject=email_data.get('subject', 'No Subject'),
                                    snippet=email_data.get('snippet', ''),
                                    filter_name=email_filter.name,
                                    email_id=filtered_email.id
                                )
                                print(f"📱 WhatsApp notification queued for {user.phone_number}")
                
                except Exception as e:
                    print(f"⚠️  Error processing message {gmail_message_id}: {e}")
                    continue
            
            # Summary of processing
            print(f"✅ Processed {processed_count}/{len(message_ids)} messages, {matched_count} matched filters")
            
            # Update last_history_id to the new historyId from webhook
            # This ensures next webhook will only process changes after this point
            connected_email.last_history_id = new_history_id
            await db.commit()
            print(f"💾 Updated last_history_id to {new_history_id}")
            
            return {
                "status": "success",
                "processed": processed_count,
                "matched": matched_count,
                "total": len(message_ids),
                "history_id": new_history_id
            }
        
        except Exception as e:
            print(f"❌ Error processing email: {str(e)}")
            return {"status": "error", "error": str(e)}


@celery_app.task(name="send_daily_digest")
def send_daily_digest():
    """
    Send daily email digest to users who have digest enabled
    
    Should be scheduled to run daily via Celery Beat:
    
    Add to celery_app.py:
    app.conf.beat_schedule = {
        'send-daily-digest': {
            'task': 'send_daily_digest',
            'schedule': crontab(hour=8, minute=0),  # 8 AM daily
        }
    }
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_send_digest_async())


async def _send_digest_async():
    """Async implementation of daily digest"""
    async with AsyncSessionLocal() as db:
        try:
            print("📨 Starting daily digest generation...")
            
            from app.models import NotificationPreference, FilteredEmail
            from datetime import timedelta
            
            # Get users with daily digest enabled
            stmt = select(NotificationPreference).where(
                NotificationPreference.email_digest_frequency == 'DAILY',
                NotificationPreference.email_digest_enabled == True
            )
            result = await db.execute(stmt)
            digest_preferences = result.scalars().all()
            
            if not digest_preferences:
                print("ℹ️  No users have daily digest enabled")
                return {"status": "success", "sent": 0}
            
            print(f"👥 Found {len(digest_preferences)} users with digest enabled")
            
            sent_count = 0
            failed_count = 0
            
            # Get yesterday's date range
            yesterday = datetime.now(timezone.utc) - timedelta(days=1)
            today = datetime.now(timezone.utc)
            
            for pref in digest_preferences:
                try:
                    # Get filtered emails from last 24 hours
                    email_stmt = select(FilteredEmail).where(
                        FilteredEmail.user_id == pref.user_id,
                        FilteredEmail.received_at >= yesterday,
                        FilteredEmail.received_at < today
                    )
                    email_result = await db.execute(email_stmt)
                    filtered_emails = email_result.scalars().all()
                    
                    if not filtered_emails:
                        print(f"ℹ️  No emails for user {pref.user_id}, skipping")
                        continue
                    
                    # Get user details
                    user_stmt = select(User).where(User.id == pref.user_id)
                    user_result = await db.execute(user_stmt)
                    user = user_result.scalar_one_or_none()
                    
                    if not user or not user.phone_number or not user.phone_verified:
                        print(f"⚠️  User {pref.user_id} has no verified phone, skipping")
                        continue
                    
                    # Format digest message
                    digest_message = f"📧 *Daily Email Digest*\n\n"
                    digest_message += f"You received *{len(filtered_emails)}* filtered emails yesterday:\n\n"
                    
                    for idx, email in enumerate(filtered_emails[:10], 1):  # Limit to 10
                        digest_message += f"{idx}. From: {email.sender}\n"
                        digest_message += f"   Subject: {email.subject}\n\n"
                    
                    if len(filtered_emails) > 10:
                        digest_message += f"_...and {len(filtered_emails) - 10} more emails_"
                    
                    # Send via WhatsApp (direct, not queued - digest is low volume)
                    success, error = await whatsapp_service.send_text(
                        phone_number=user.phone_number,
                        message=digest_message
                    )
                    
                    if success:
                        sent_count += 1
                        print(f"✅ Digest sent to user {pref.user_id}")
                    else:
                        failed_count += 1
                        print(f"⚠️  Failed to send digest to user {pref.user_id}: {error}")
                    
                except Exception as e:
                    failed_count += 1
                    print(f"❌ Error sending digest to user {pref.user_id}: {str(e)}")
            
            print(f"✅ Daily digest complete: {sent_count} sent, {failed_count} failed")
            
            return {
                "status": "success",
                "sent": sent_count,
                "failed": failed_count
            }
            
        except Exception as e:
            print(f"❌ Error in daily digest task: {str(e)}")
            return {"status": "error", "error": str(e)}


@celery_app.task(name="refresh_expired_tokens")
def refresh_expired_tokens():
    """
    Refresh expired Google OAuth tokens for all connected emails
    
    Should be scheduled to run every hour via Celery Beat:
    celery -A app.tasks.celery_app beat --loglevel=info
    
    Add to celery_app.py:
    app.conf.beat_schedule = {
        'refresh-tokens-hourly': {
            'task': 'refresh_expired_tokens',
            'schedule': 3600.0,  # Every hour
        }
    }
    """
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(_refresh_tokens_async())


async def _refresh_tokens_async():
    """Async implementation of token refresh"""
    async with AsyncSessionLocal() as db:
        try:
            print("🔄 Starting token refresh check...")
            
            # Get all active connected emails with expiring tokens
            buffer = timedelta(minutes=30)  # Refresh 30 min before expiry
            expiry_threshold = datetime.now(timezone.utc) + buffer
            
            stmt = select(ConnectedEmail).where(
                ConnectedEmail.is_active == True,
                ConnectedEmail.token_expires_at <= expiry_threshold
            )
            result = await db.execute(stmt)
            expiring_emails = result.scalars().all()
            
            if not expiring_emails:
                print("✅ No tokens need refreshing")
                return {"status": "success", "refreshed": 0}
            
            print(f"📧 Found {len(expiring_emails)} tokens to refresh")
            
            refreshed_count = 0
            failed_count = 0
            
            for connected_email in expiring_emails:
                try:
                    # Use gmail_service to refresh token
                    new_token = await GoogleOAuthService.refresh_access_token(
                        db, connected_email
                    )
                    refreshed_count += 1
                    print(f"✅ Refreshed token for {connected_email.email_address}")
                    
                except Exception as e:
                    failed_count += 1
                    print(f"❌ Failed to refresh token for {connected_email.email_address}: {str(e)}")
                    # Mark as inactive if refresh fails (user needs to reconnect)
                    connected_email.is_active = False
                    await db.commit()
            
            print(f"✅ Token refresh complete: {refreshed_count} succeeded, {failed_count} failed")
            
            return {
                "status": "success",
                "refreshed": refreshed_count,
                "failed": failed_count
            }
            
        except Exception as e:
            print(f"❌ Error in token refresh task: {str(e)}")
            return {"status": "error", "error": str(e)}


@celery_app.task(
    name="send_filter_whatsapp_notification",
    rate_limit='30/m',  # 30 messages per minute (safe for WhatsApp)
    max_retries=3,
    default_retry_delay=60  # Retry after 60 seconds if failed
)
def send_filter_whatsapp_notification(
    phone_number: str,
    sender: str,
    subject: str,
    snippet: str,
    filter_name: str,
    email_id: int
):
    """
    Send WhatsApp notification for matched filter email
    
    Rate Limited: 30 messages per minute (0.5 msg/second)
    - Safe for WhatsApp limits (~40-50 msg/min max)
    - Prevents account bans
    - Queues messages during high load
    - Retries on failure
    
    Args:
        phone_number: User's phone number (E.164 format)
        sender: Email sender
        subject: Email subject
        snippet: Email body preview/snippet
        filter_name: Matched filter name
        email_id: Filtered email ID
    """
    # Run async function in sync Celery task
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        _send_whatsapp_async(phone_number, sender, subject, snippet, filter_name, email_id)
    )


async def _send_whatsapp_async(
    phone_number: str,
    sender: str,
    subject: str,
    snippet: str,
    filter_name: str,
    email_id: int
):
    """Async implementation of WhatsApp notification"""
    try:
        success, error = await whatsapp_service.send_filter_notification(
            phone_number=phone_number,
            sender=sender,
            subject=subject,
            snippet=snippet,
            filter_name=filter_name,
            email_id=email_id
        )
        
        if success:
            print(f"✅ [Queue] WhatsApp sent to {phone_number} - Filter: {filter_name}")
            return {"status": "sent", "phone": phone_number}
        else:
            print(f"⚠️ [Queue] WhatsApp failed for {phone_number}: {error}")
            # Retry task if failed
            raise Exception(f"WhatsApp send failed: {error}")
            
    except Exception as e:
        print(f"❌ [Queue] Error sending WhatsApp: {str(e)}")
        raise

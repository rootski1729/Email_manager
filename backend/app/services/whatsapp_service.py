"""
WhatsApp notification service using Twilio
"""
import logging
import random
from typing import Optional
from datetime import datetime, timedelta
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import phonenumbers
from phonenumbers import NumberParseException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.redis import redis_manager
from app.models.models import User, NotificationPreference

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for WhatsApp notifications via Twilio"""
    
    def __init__(self):
        """Initialize Twilio client"""
        self.client = None
        if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
            try:
                self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
                logger.info("✅ Twilio WhatsApp client initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Twilio client: {e}")
        else:
            logger.warning("⚠️ Twilio credentials not configured - WhatsApp disabled")
    
    def validate_phone_number(self, phone_number: str) -> tuple[bool, Optional[str]]:
        """
        Validate phone number format
        
        Args:
            phone_number: Phone number to validate
            
        Returns:
            Tuple of (is_valid, formatted_number)
        """
        try:
            parsed = phonenumbers.parse(phone_number, None)
            if phonenumbers.is_valid_number(parsed):
                formatted = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
                return True, formatted
            else:
                return False, None
        except NumberParseException:
            return False, None
    
    async def generate_phone_otp(self, phone_number: str) -> str:
        """
        Generate 6-digit OTP for phone verification (stored in Redis with 2-minute expiry)
        
        Args:
            phone_number: User's phone number in E.164 format
            
        Returns:
            6-digit OTP code
        """
        code = str(random.randint(100000, 999999))
        
        # Store in Redis with 2-minute expiry (120 seconds)
        redis_key = f"phone_otp:{phone_number}:{code}"
        await redis_manager.set(redis_key, "1", expire=120)  # 2 minutes
        
        logger.info(f"📱 Phone OTP generated for {phone_number}: {code}")
        return code
    
    async def verify_phone_otp(
        self, 
        phone_number: str, 
        code: str,
        db: AsyncSession
    ) -> tuple[bool, Optional[str]]:
        """
        Verify phone OTP and mark phone as verified
        
        Args:
            phone_number: User's phone number
            code: OTP code to verify
            db: Database session
            
        Returns:
            Tuple of (success, error_message)
        """
        redis_key = f"phone_otp:{phone_number}:{code}"
        
        # Check if OTP exists
        exists = await redis_manager.get(redis_key)
        if not exists:
            return False, "Invalid or expired OTP"
        
        # Delete OTP after verification
        await redis_manager.delete(redis_key)
        
        # Mark phone as verified in database
        result = await db.execute(
            select(User).where(User.phone_number == phone_number)
        )
        user = result.scalar_one_or_none()
        
        if user:
            user.phone_verified = True
            await db.commit()
            logger.info(f"✅ Phone verified for user {user.email}: {phone_number}")
            return True, None
        else:
            return False, "User not found"
    
    async def send_phone_otp(self, phone_number: str, code: str) -> tuple[bool, Optional[str]]:
        """
        Send OTP code via WhatsApp
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            code: OTP code to send
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.client:
            logger.error("❌ Twilio client not initialized")
            # Fallback: print to console for development
            logger.warning(f"📱 [Console Fallback] Phone OTP for {phone_number}: {code}")
            print(f"📱 [WhatsApp Not Configured] Phone OTP for {phone_number}: {code}")
            return False, "WhatsApp service not configured"
        
        try:
            message_body = f"""🔐 *EmailFilter Pro*

Your verification code is:

*{code}*

⏰ This code will expire in 2 minutes.

If you didn't request this code, please ignore this message."""

            message = self.client.messages.create(
                from_=settings.TWILIO_WHATSAPP_FROM,
                body=message_body,
                to=f"whatsapp:{phone_number}"
            )
            
            logger.info(f"📤 WhatsApp OTP sent to {phone_number}, SID: {message.sid}")
            return True, None
            
        except TwilioRestException as e:
            logger.error(f"❌ Twilio error sending WhatsApp: {e}")
            # Fallback: print to console
            print(f"📱 [Twilio Error - Console Fallback] Phone OTP for {phone_number}: {code}")
            return False, str(e)
        except Exception as e:
            logger.error(f"❌ Error sending WhatsApp: {e}")
            print(f"📱 [Error - Console Fallback] Phone OTP for {phone_number}: {code}")
            return False, "Failed to send WhatsApp message"
    
    async def send_filter_notification(
        self,
        phone_number: str,
        sender: str,
        subject: str,
        filter_name: str,
        email_id: int
    ) -> tuple[bool, Optional[str]]:
        """
        Send WhatsApp notification when email matches filter
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            sender: Email sender
            subject: Email subject
            filter_name: Name of matched filter
            email_id: Filtered email ID
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.client:
            logger.warning("⚠️ Twilio client not initialized - notification skipped")
            return False, "WhatsApp service not configured"
        
        try:
            # Truncate long subjects
            if len(subject) > 100:
                subject = subject[:97] + "..."
            
            message_body = f"""🔔 *New Filtered Email*

📧 From: {sender}
📝 Subject: {subject}
🏷️ Filter: {filter_name}

View in app: http://localhost:8000/emails/{email_id}"""
            
            message = self.client.messages.create(
                from_=settings.TWILIO_WHATSAPP_FROM,
                body=message_body,
                to=f"whatsapp:{phone_number}"
            )
            
            logger.info(f"📤 WhatsApp notification sent to {phone_number}, SID: {message.sid}")
            return True, None
            
        except TwilioRestException as e:
            logger.error(f"❌ Twilio error: {e}")
            return False, str(e)
        except Exception as e:
            logger.error(f"❌ Error sending notification: {e}")
            return False, "Failed to send notification"
    
    async def check_whatsapp_enabled(self, user_id: int, db: AsyncSession) -> bool:
        """
        Check if user has WhatsApp notifications enabled
        
        Args:
            user_id: User ID
            db: Database session
            
        Returns:
            True if WhatsApp enabled and phone verified
        """
        result = await db.execute(
            select(NotificationPreference, User)
            .join(User, NotificationPreference.user_id == User.id)
            .where(NotificationPreference.user_id == user_id)
        )
        row = result.first()
        
        if not row:
            return False
        
        preference, user = row
        
        # WhatsApp must be enabled AND phone must be verified
        return (
            preference.whatsapp_enabled 
            and user.phone_verified 
            and user.phone_number is not None
        )


# Global instance
whatsapp_service = WhatsAppService()

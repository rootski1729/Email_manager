"""
WhatsApp notification service using WAHA (WhatsApp HTTP API)
"""
import logging
import random
import httpx
from typing import Optional
from datetime import datetime, timedelta
import phonenumbers
from phonenumbers import NumberParseException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.redis import redis_manager
from app.models.models import User, NotificationPreference

logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service for WhatsApp notifications via WAHA (WhatsApp HTTP API)"""
    
    def __init__(self):
        """Initialize WAHA client"""
        self.base_url = settings.WAHA_API_URL
        self.api_key = settings.WAHA_API_KEY
        self.session_name = settings.WAHA_SESSION_NAME
        self.client_initialized = False
        
        if self.api_key:
            self.client_initialized = True
            logger.info(f"✅ WAHA client initialized - Base URL: {self.base_url}")
        else:
            logger.warning("⚠️ WAHA API key not configured - WhatsApp disabled")
    
    @property
    def headers(self) -> dict:
        """Get headers for WAHA API requests"""
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
    def format_phone_to_whatsapp(self, phone_number: str) -> Optional[str]:
        """
        Convert phone number to WhatsApp chat ID format
        E.164: +1 (213) 213-2130 -> WhatsApp: 12132132130@c.us
        
        Args:
            phone_number: Phone number in E.164 format
            
        Returns:
            WhatsApp chat ID or None if invalid
        """
        try:
            parsed = phonenumbers.parse(phone_number, None)
            if phonenumbers.is_valid_number(parsed):
                # Remove + and format as international
                number = phonenumbers.format_number(
                    parsed, 
                    phonenumbers.PhoneNumberFormat.E164
                )[1:]  # Remove leading +
                return f"{number}@c.us"
        except NumberParseException as e:
            logger.error(f"Error formatting phone {phone_number}: {e}")
        return None
    
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
    
    async def check_session_status(self) -> dict:
        """
        Check WAHA session status
        
        Returns:
            Session info dict with status
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/sessions/{self.session_name}",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Failed to get session status: {response.text}")
                    return {"status": "FAILED", "error": response.text}
                    
        except Exception as e:
            logger.error(f"Error checking session status: {e}")
            return {"status": "FAILED", "error": str(e)}
    
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
        
        logger.info(f"Phone OTP generated for {phone_number}: {code}")
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
            logger.info(f"Phone verified for user {user.email}: {phone_number}")
            return True, None
        else:
            return False, "User not found"
    
    async def send_text(
        self,
        phone_number: str,
        message: str
    ) -> tuple[bool, Optional[str]]:
        """
        Send text message via WAHA
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            message: Text message to send
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.client_initialized:
            logger.error("❌ WAHA client not initialized")
            # Fallback: print to console for development
            logger.warning(f"📱 [Console Fallback] Message to {phone_number}: {message}")
            print(f"📱 [WAHA Not Configured] Message to {phone_number}: {message}")
            return False, "WhatsApp service not configured"
        
        chat_id = self.format_phone_to_whatsapp(phone_number)
        if not chat_id:
            return False, "Invalid phone number format"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/sendText",
                    headers=self.headers,
                    json={
                        "session": self.session_name,
                        "chatId": chat_id,
                        "text": message
                    }
                )
                
                if response.status_code == 201 or response.status_code == 200:
                    logger.info(f"📤 WhatsApp message sent to {phone_number}")
                    return True, None
                else:
                    error = response.json().get("message", "Unknown error")
                    logger.error(f"❌ WAHA error: {error}")
                    # Fallback: print to console
                    print(f"📱 [WAHA Error - Console Fallback] Message to {phone_number}: {message}")
                    return False, error
                    
        except httpx.TimeoutException:
            logger.error(f"❌ Timeout sending message to {phone_number}")
            return False, "Request timeout"
        except Exception as e:
            logger.error(f"❌ Error sending message: {e}")
            print(f"📱 [Error - Console Fallback] Message to {phone_number}: {message}")
            return False, str(e)
    
    async def send_phone_otp(self, phone_number: str, code: str) -> tuple[bool, Optional[str]]:
        """
        Send OTP code via WhatsApp
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            code: OTP code to send
            
        Returns:
            Tuple of (success, error_message)
        """
        message_body = f"""*EmailFilter Pro*

Your verification code is:

*{code}*

This code will expire in 2 minutes.

If you didn't request this code, please ignore this message."""

        return await self.send_text(phone_number, message_body)
    
    async def send_image(
        self,
        phone_number: str,
        image_url: str,
        caption: Optional[str] = None,
        filename: str = "image.jpg"
    ) -> tuple[bool, Optional[str]]:
        """
        Send image via WAHA
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            image_url: URL to the image
            caption: Optional caption text
            filename: Image filename
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.client_initialized:
            logger.error("❌ WAHA client not initialized")
            return False, "WhatsApp service not configured"
        
        chat_id = self.format_phone_to_whatsapp(phone_number)
        if not chat_id:
            return False, "Invalid phone number format"
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                payload = {
                    "session": self.session_name,
                    "chatId": chat_id,
                    "file": {
                        "mimetype": "image/jpeg",
                        "url": image_url,
                        "filename": filename
                    }
                }
                
                if caption:
                    payload["caption"] = caption
                
                response = await client.post(
                    f"{self.base_url}/sendImage",
                    headers=self.headers,
                    json=payload
                )
                
                if response.status_code == 201 or response.status_code == 200:
                    logger.info(f"📤 WhatsApp image sent to {phone_number}")
                    return True, None
                else:
                    error = response.json().get("message", "Unknown error")
                    logger.error(f"❌ WAHA error sending image: {error}")
                    return False, error
                    
        except Exception as e:
            logger.error(f"❌ Error sending image: {e}")
            return False, str(e)
    
    async def send_file(
        self,
        phone_number: str,
        file_url: str,
        filename: str,
        mimetype: str = "application/pdf",
        caption: Optional[str] = None
    ) -> tuple[bool, Optional[str]]:
        """
        Send file/document via WAHA
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            file_url: URL to the file
            filename: File name with extension
            mimetype: MIME type of the file
            caption: Optional caption text
            
        Returns:
            Tuple of (success, error_message)
        """
        if not self.client_initialized:
            logger.error("❌ WAHA client not initialized")
            return False, "WhatsApp service not configured"
        
        chat_id = self.format_phone_to_whatsapp(phone_number)
        if not chat_id:
            return False, "Invalid phone number format"
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                payload = {
                    "session": self.session_name,
                    "chatId": chat_id,
                    "file": {
                        "mimetype": mimetype,
                        "url": file_url,
                        "filename": filename
                    }
                }
                
                if caption:
                    payload["caption"] = caption
                
                response = await client.post(
                    f"{self.base_url}/sendFile",
                    headers=self.headers,
                    json=payload
                )
                
                if response.status_code == 201 or response.status_code == 200:
                    logger.info(f"📤 WhatsApp file sent to {phone_number}")
                    return True, None
                else:
                    error = response.json().get("message", "Unknown error")
                    logger.error(f"❌ WAHA error sending file: {error}")
                    return False, error
                    
        except Exception as e:
            logger.error(f"❌ Error sending file: {e}")
            return False, str(e)
    
    async def send_filter_notification(
        self,
        phone_number: str,
        sender: str,
        subject: str,
        snippet: str,
        filter_name: str,
        email_id: int
    ) -> tuple[bool, Optional[str]]:
        """
        Send WhatsApp notification when email matches filter
        
        Args:
            phone_number: Recipient's phone number (E.164 format)
            sender: Email sender
            subject: Email subject
            snippet: Email body preview/snippet
            filter_name: Name of matched filter
            email_id: Filtered email ID
            
        Returns:
            Tuple of (success, error_message)
        """
        # Truncate long text
        if len(subject) > 80:
            subject = subject[:77] + "..."
        if len(snippet) > 150:
            snippet = snippet[:147] + "..."
        
        # Clean sender (remove angle brackets if present)
        # "John Doe <john@example.com>" -> "John Doe (john@example.com)"
        if '<' in sender and '>' in sender:
            import re
            match = re.match(r'(.+?)\s*<(.+?)>', sender)
            if match:
                name, email = match.groups()
                sender = f"{name.strip()} ({email.strip()})"
        
        message_body = f"""*New Email Alert*

*From:* {sender}

*Subject:* {subject}

*Preview:*
{snippet}

*Filter:* {filter_name}

View full email: http://localhost:8000/emails/{email_id}"""
        
        return await self.send_text(phone_number, message_body)
    
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

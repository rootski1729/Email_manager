"""
Authentication service - WhatsApp OTP for login/signup
"""
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models import User, Plan, UserPlan, NotificationPreference, PlanType
from app.core.redis import redis_manager
from app.core.security import create_access_token, create_refresh_token
from app.core.config import settings
from app.services.whatsapp_service import whatsapp_service
import logging

logger = logging.getLogger(__name__)


class AuthService:
    """Handle WhatsApp OTP authentication"""
    
    @staticmethod
    def generate_otp() -> str:
        """Generate 6-digit OTP"""
        return ''.join(random.choices(string.digits, k=6))
    
    @staticmethod
    async def create_otp(db: AsyncSession, phone_number: str) -> str:
        """
        Create and send WhatsApp OTP (stored in Redis with 2-minute expiry)
        
        Args:
            db: Database session
            phone_number: User's phone number (E.164 format)
            
        Returns:
            6-digit OTP code
            
        Raises:
            ValueError: If phone number invalid or rate limited
        """
        # Validate phone number format
        is_valid, formatted_number = whatsapp_service.validate_phone_number(phone_number)
        if not is_valid:
            raise ValueError("Invalid phone number format. Use E.164 format (e.g., +1234567890)")
        
        redis_client = await redis_manager.get_cache_client()
        
        # Check rate limiting - max 3 OTPs per 15 minutes
        rate_limit_key = f"auth_otp_rate_limit:{formatted_number}"
        count = await redis_client.get(rate_limit_key)
        
        if count and int(count) >= 3:
            raise ValueError("Too many OTP requests. Please try again in 15 minutes.")
        
        # Generate 6-digit OTP
        otp_code = AuthService.generate_otp()
        
        # Store in Redis with 2-minute expiry (120 seconds)
        redis_key = f"auth_otp:{formatted_number}:{otp_code}"
        await redis_client.setex(redis_key, 120, "1")  # 2 minutes expiry
        
        # Increment rate limit counter
        if count:
            await redis_client.incr(rate_limit_key)
        else:
            await redis_client.setex(rate_limit_key, 900, 1)  # 15 minutes expiry
        
        # Send OTP via WhatsApp
        success, error = await whatsapp_service.send_phone_otp(formatted_number, otp_code)
        
        if not success:
            logger.error(f"❌ Failed to send WhatsApp OTP to {formatted_number}: {error}")
            # Still return code for console fallback
            print(f"📱 [WhatsApp OTP] Code for {formatted_number}: {otp_code}")
        else:
            logger.info(f"✅ WhatsApp OTP sent to {formatted_number}")
        
        return otp_code
    
    @staticmethod
    async def verify_otp(db: AsyncSession, phone_number: str, code: str) -> Optional[User]:
        """
        Verify WhatsApp OTP and return user (create if new, auto-verify phone)
        
        Args:
            db: Database session
            phone_number: User's phone number (E.164 format)
            code: 6-digit OTP code
            
        Returns:
            User object if OTP is valid, None otherwise
        """
        # Validate phone number format
        is_valid, formatted_number = whatsapp_service.validate_phone_number(phone_number)
        if not is_valid:
            return None
        
        redis_client = await redis_manager.get_cache_client()
        redis_key = f"auth_otp:{formatted_number}:{code}"
        
        # Check if OTP exists in Redis
        otp_exists = await redis_client.get(redis_key)
        
        if not otp_exists:
            # OTP is either invalid or expired (2 minutes)
            logger.warning(f"❌ Invalid or expired OTP for {formatted_number}")
            return None
        
        # Delete OTP from Redis (one-time use)
        await redis_client.delete(redis_key)
        
        # Get or create user by phone number
        stmt = select(User).where(User.phone_number == formatted_number)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user with WhatsApp-only signup
            # Generate a unique email placeholder since we removed email requirement
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
            placeholder_email = f"user_{formatted_number.replace('+', '')}_{timestamp}@whatsapp.local"
            
            user = User(
                phone_number=formatted_number,
                phone_verified=True,  # Auto-verify on successful OTP
                email=placeholder_email,  # Placeholder email
                is_verified=True
            )
            db.add(user)
            await db.flush()
            
            # Assign FREE plan
            stmt = select(Plan).where(Plan.name == PlanType.FREE)
            result = await db.execute(stmt)
            free_plan = result.scalar_one_or_none()
            
            if free_plan:
                user_plan = UserPlan(
                    user_id=user.id,
                    plan_id=free_plan.id,
                    is_active=True
                )
                db.add(user_plan)
            
            # Create notification preferences with WhatsApp enabled by default
            notif_pref = NotificationPreference(
                user_id=user.id,
                whatsapp_enabled=True  # Enable WhatsApp by default since they signed up with it
            )
            db.add(notif_pref)
            
            await db.commit()
            await db.refresh(user)
            
            logger.info(f"✅ New user created via WhatsApp: {formatted_number}")
        else:
            # Existing user - verify phone if not already verified
            if not user.phone_verified:
                user.phone_verified = True
                await db.commit()
                logger.info(f"✅ Phone verified for existing user: {formatted_number}")
        
        return user
    
    @staticmethod
    def create_user_tokens(user_id: int, phone_number: str) -> dict:
        """Create access and refresh tokens"""
        token_data = {"sub": str(user_id), "phone": phone_number}
        
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
    
    @staticmethod
    async def store_user_session(user_id: int, access_token: str):
        """Store user session in Redis (5 min cache for webhook optimization)"""
        redis_client = await redis_manager.get_session_client()
        session_key = f"user_session:{user_id}"
        
        # Store user data for 5 minutes
        await redis_client.setex(
            session_key,
            300,  # 5 minutes
            access_token
        )
    
    @staticmethod
    async def get_cached_user_session(user_id: int) -> Optional[str]:
        """Get cached user session"""
        redis_client = await redis_manager.get_session_client()
        session_key = f"user_session:{user_id}"
        return await redis_client.get(session_key)

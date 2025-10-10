"""
Authentication service - OTP generation and verification
"""
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models import User, Plan, UserPlan, NotificationPreference, PlanType
from app.core.redis import redis_manager
from app.core.security import create_access_token, create_refresh_token
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class AuthService:
    """Handle authentication logic"""
    
    @staticmethod
    def generate_otp() -> str:
        """Generate 6-digit OTP"""
        return ''.join(random.choices(string.digits, k=6))
    
    @staticmethod
    async def send_otp_email(email: str, otp: str):
        """
        Send OTP via email using SMTP
        
        Args:
            email: Recipient email address
            otp: 6-digit OTP code
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f'Your EmailFilter Pro Verification Code: {otp}'
            msg['From'] = settings.EMAILS_FROM_EMAIL
            msg['To'] = email
            
            # Create HTML email body
            html_body = f"""
            <html>
            <head></head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 10px;">
                    <h2 style="color: #4A90E2; text-align: center;">EmailFilter Pro</h2>
                    <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h3 style="color: #333; margin-top: 0;">Your Verification Code</h3>
                        <p>Hello,</p>
                        <p>Your one-time password (OTP) for EmailFilter Pro is:</p>
                        <div style="background-color: #f0f7ff; border-left: 4px solid #4A90E2; padding: 15px; margin: 20px 0;">
                            <h1 style="color: #4A90E2; margin: 0; font-size: 32px; letter-spacing: 8px; text-align: center;">
                                {otp}
                            </h1>
                        </div>
                        <p style="color: #666; font-size: 14px;">
                            <strong>⏰ This code will expire in 2 minutes.</strong>
                        </p>
                        <p style="color: #666; font-size: 14px;">
                            If you didn't request this code, please ignore this email.
                        </p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="color: #999; font-size: 12px; text-align: center;">
                            This is an automated message from EmailFilter Pro. Please do not reply to this email.
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            # Create plain text version (fallback)
            text_body = f"""
            EmailFilter Pro - Verification Code
            
            Your one-time password (OTP) is: {otp}
            
            This code will expire in 2 minutes.
            
            If you didn't request this code, please ignore this email.
            
            ---
            This is an automated message from EmailFilter Pro.
            """
            
            # Attach both versions
            part1 = MIMEText(text_body, 'plain')
            part2 = MIMEText(html_body, 'html')
            msg.attach(part1)
            msg.attach(part2)
            
            # Send email via SMTP
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()  # Enable TLS
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
            
            logger.info(f"✅ OTP email sent successfully to {email}")
            print(f"📧 OTP sent to {email}: {otp}")
            
        except Exception as e:
            logger.error(f"❌ Failed to send OTP email to {email}: {str(e)}")
            # Fallback: print to console for development
            print(f"📧 [EMAIL FAILED - Console Fallback] OTP for {email}: {otp}")
            print(f"   Error: {str(e)}")
            # Don't raise exception - allow authentication to continue with console OTP
    
    @staticmethod
    async def create_otp(db: AsyncSession, email: str) -> str:
        """
        Create and send OTP (stored only in Redis with 2-minute expiry)
        
        Args:
            db: Database session (not used for OTP, only for user operations)
            email: User's email address
            
        Returns:
            6-digit OTP code
        """
        redis_client = await redis_manager.get_cache_client()
        
        # Check rate limiting - max 3 OTPs per 15 minutes
        rate_limit_key = f"otp_rate_limit:{email}"
        count = await redis_client.get(rate_limit_key)
        
        if count and int(count) >= 3:
            raise ValueError("Too many OTP requests. Please try again in 15 minutes.")
        
        # Generate 6-digit OTP
        otp_code = AuthService.generate_otp()
        
        # Store in Redis with 2-minute expiry (120 seconds)
        redis_key = f"otp:{email}:{otp_code}"
        await redis_client.setex(redis_key, 120, "1")  # 2 minutes expiry
        
        # Increment rate limit counter
        if count:
            await redis_client.incr(rate_limit_key)
        else:
            await redis_client.setex(rate_limit_key, 900, 1)  # 15 minutes expiry
        
        # Send OTP via email
        await AuthService.send_otp_email(email, otp_code)
        
        return otp_code
    
    @staticmethod
    async def verify_otp(db: AsyncSession, email: str, code: str) -> Optional[User]:
        """
        Verify OTP from Redis and return user (create if new)
        
        Args:
            db: Database session
            email: User's email address
            code: 6-digit OTP code
            
        Returns:
            User object if OTP is valid, None otherwise
        """
        redis_client = await redis_manager.get_cache_client()
        redis_key = f"otp:{email}:{code}"
        
        # Check if OTP exists in Redis
        otp_exists = await redis_client.get(redis_key)
        
        if not otp_exists:
            # OTP is either invalid or expired (2 minutes)
            return None
        
        # Delete OTP from Redis (one-time use)
        await redis_client.delete(redis_key)
        
        # Get or create user
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            # Create new user with FREE plan
            user = User(
                email=email,
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
            
            # Create notification preferences
            notif_pref = NotificationPreference(
                user_id=user.id
            )
            db.add(notif_pref)
            
            await db.commit()
            await db.refresh(user)
        
        return user
    
    @staticmethod
    def create_user_tokens(user_id: int, email: str) -> dict:
        """Create access and refresh tokens"""
        token_data = {"sub": str(user_id), "email": email}
        
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

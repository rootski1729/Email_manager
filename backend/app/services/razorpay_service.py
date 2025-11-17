import razorpay
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models import User, Plan, UserPlan, PlanType
from decimal import Decimal

logger = logging.getLogger(__name__)

# Initialize Razorpay client
razorpay_client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


class RazorpayService:
    
    @staticmethod
    async def create_order(
        user_id: int,
        plan_type: PlanType,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Create a Razorpay order for plan purchase
        
        Args:
            user_id: User ID
            plan_type: Type of plan (free, basic, pro)
            db: Database session
            
        Returns:
            Order details with order_id, amount, currency
        """
        try:
            # Get plan details
            stmt = select(Plan).where(Plan.name == plan_type)
            result = await db.execute(stmt)
            plan = result.scalar_one_or_none()
            
            if not plan:
                raise ValueError(f"Plan {plan_type} not found")
            
            # Get user
            stmt = select(User).where(User.id == user_id)
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user:
                raise ValueError(f"User {user_id} not found")
            
            # Amount in cents, Razorpay expects amount in paise for INR
            # For dollars, we convert: 1 USD = 100 cents
            amount_in_paise = plan.price_monthly * 100  # price_monthly is already in cents
            
            # Create order
            order_data = {
                "amount": amount_in_paise,  # Amount in paise
                "currency": "USD",  # or "INR"
                "receipt": f"user_{user_id}_plan_{plan_type}_{datetime.now(timezone.utc).timestamp()}",
                "payment_capture": 1,  # Auto capture
                "notes": {
                    "user_id": str(user_id),
                    "plan_type": plan_type,
                    "user_email": user.email or user.phone_number,
                    "plan_name": plan.name,
                }
            }
            
            order = razorpay_client.order.create(data=order_data)
            
            logger.info(f"✅ Created Razorpay order {order['id']} for user {user_id}, plan {plan_type}")
            
            return {
                "order_id": order["id"],
                "amount": plan.price_monthly / 100,  # Convert back to dollars
                "currency": "USD",
                "plan_type": plan_type,
                "plan_name": plan.name,
                "user_email": user.email or user.phone_number,
            }
            
        except Exception as e:
            logger.error(f"❌ Error creating Razorpay order: {e}")
            raise
    
    @staticmethod
    async def verify_payment(
        razorpay_payment_id: str,
        razorpay_order_id: str,
        razorpay_signature: str,
        user_id: int,
        plan_type: PlanType,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Verify Razorpay payment signature and activate plan
        
        Args:
            razorpay_payment_id: Payment ID from Razorpay
            razorpay_order_id: Order ID from Razorpay
            razorpay_signature: Signature from Razorpay webhook
            user_id: User ID
            plan_type: Type of plan
            db: Database session
            
        Returns:
            Payment verification result with status
        """
        try:
            # Verify signature
            generated_signature = razorpay_client.utility.verify_payment_signature(
                {
                    "order_id": razorpay_order_id,
                    "payment_id": razorpay_payment_id,
                    "signature": razorpay_signature,
                }
            )
            
            # If signature is valid, activate the plan
            await RazorpayService.activate_plan(
                user_id=user_id,
                plan_type=plan_type,
                db=db,
                payment_id=razorpay_payment_id
            )
            
            logger.info(f"✅ Payment verified for user {user_id}, plan {plan_type}")
            
            return {
                "status": "success",
                "message": "Payment verified and plan activated",
                "payment_id": razorpay_payment_id,
            }
            
        except razorpay.BadRequestsError as e:
            logger.error(f"❌ Invalid payment signature: {e}")
            return {
                "status": "failed",
                "message": "Invalid payment signature",
                "error": str(e),
            }
        except Exception as e:
            logger.error(f"❌ Error verifying payment: {e}")
            raise
    
    @staticmethod
    async def activate_plan(
        user_id: int,
        plan_type: PlanType,
        db: AsyncSession,
        payment_id: Optional[str] = None
    ) -> UserPlan:
        """
        Activate a plan for a user after successful payment
        
        Args:
            user_id: User ID
            plan_type: Type of plan to activate
            db: Database session
            payment_id: Razorpay payment ID (optional)
            
        Returns:
            Activated UserPlan object
        """
        try:
            # Get plan
            stmt = select(Plan).where(Plan.name == plan_type)
            result = await db.execute(stmt)
            plan = result.scalar_one_or_none()
            
            if not plan:
                raise ValueError(f"Plan {plan_type} not found")
            
            # Check if user already has an active plan
            stmt = select(UserPlan).where(
                UserPlan.user_id == user_id,
                UserPlan.is_active == True
            )
            result = await db.execute(stmt)
            existing_plan = result.scalar_one_or_none()
            
            # Deactivate old plan if exists
            if existing_plan:
                existing_plan.is_active = False
                await db.commit()
            
            # Create new user plan (monthly subscription)
            from datetime import timedelta
            
            user_plan = UserPlan(
                user_id=user_id,
                plan_id=plan.id,
                started_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=30),  # 30-day subscription
                is_active=True,
                auto_renew=True,
            )
            
            db.add(user_plan)
            await db.commit()
            await db.refresh(user_plan)
            
            logger.info(f"✅ Activated {plan_type} plan for user {user_id}" + (f" (Payment: {payment_id})" if payment_id else ""))
            
            return user_plan
            
        except Exception as e:
            logger.error(f"❌ Error activating plan: {e}")
            await db.rollback()
            raise
    
    @staticmethod
    async def get_payment_details(
        razorpay_payment_id: str
    ) -> Dict[str, Any]:
        """
        Get payment details from Razorpay
        
        Args:
            razorpay_payment_id: Payment ID from Razorpay
            
        Returns:
            Payment details
        """
        try:
            payment = razorpay_client.payment.fetch(razorpay_payment_id)
            
            return {
                "payment_id": payment["id"],
                "amount": payment["amount"] / 100,  # Convert from paise to dollars
                "currency": payment["currency"],
                "status": payment["status"],
                "method": payment.get("method"),
                "email": payment.get("email"),
                "contact": payment.get("contact"),
                "created_at": payment.get("created_at"),
            }
            
        except Exception as e:
            logger.error(f"❌ Error fetching payment details: {e}")
            raise
    
    @staticmethod
    def get_razorpay_key_id() -> str:
        return settings.RAZORPAY_KEY_ID

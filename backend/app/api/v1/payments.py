from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models import User, PlanType
from app.schemas import (
    RazorpayOrderCreate, RazorpayOrderResponse, 
    RazorpayPaymentVerify, RazorpayPaymentResponse,
    PaymentStatusResponse, RazorpayKeyResponse, MessageResponse
)
from app.services.razorpay_service import RazorpayService
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.get("/razorpay-key", response_model=RazorpayKeyResponse)
async def get_razorpay_key():
    try:
        key_id = RazorpayService.get_razorpay_key_id()
        if not key_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Razorpay not configured"
            )
        return RazorpayKeyResponse(key_id=key_id)
    except Exception as e:
        logger.error(f"❌ Error getting Razorpay key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get Razorpay configuration"
        )


@router.post("/create-order", response_model=RazorpayOrderResponse)
async def create_payment_order(
    order_data: RazorpayOrderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a Razorpay payment order for a plan purchase
    
    Plan prices:
    - FREE: $0/month
    - BASIC: $4.99/month
    - PRO: $9.99/month
    """
    try:
        # Skip order creation for FREE plan
        if order_data.plan_type == PlanType.FREE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Free plan does not require payment"
            )
        
        order = await RazorpayService.create_order(
            user_id=current_user.id,
            plan_type=order_data.plan_type,
            db=db
        )
        
        return RazorpayOrderResponse(**order)
        
    except ValueError as e:
        logger.error(f"❌ Invalid request: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"❌ Error creating payment order: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create payment order"
        )


@router.post("/verify-payment", response_model=RazorpayPaymentResponse)
async def verify_payment(
    payment_data: RazorpayPaymentVerify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await RazorpayService.verify_payment(
            razorpay_payment_id=payment_data.razorpay_payment_id,
            razorpay_order_id=payment_data.razorpay_order_id,
            razorpay_signature=payment_data.razorpay_signature,
            user_id=current_user.id,
            plan_type=payment_data.plan_type,
            db=db
        )
        
        if result["status"] == "success":
            return RazorpayPaymentResponse(
                status="success",
                message=result["message"],
                payment_id=result["payment_id"]
            )
        else:
            return RazorpayPaymentResponse(
                status="failed",
                message=result["message"],
                error=result.get("error")
            )
            
    except Exception as e:
        logger.error(f"❌ Error verifying payment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify payment"
        )


@router.get("/payment-details/{payment_id}", response_model=PaymentStatusResponse)
async def get_payment_details(
    payment_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get payment details from Razorpay
    """
    try:
        details = await RazorpayService.get_payment_details(payment_id)
        return PaymentStatusResponse(**details)
        
    except Exception as e:
        logger.error(f"❌ Error fetching payment details: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch payment details"
        )


@router.post("/activate-plan-free", response_model=MessageResponse)
async def activate_free_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Directly activate FREE plan for a user (no payment needed)
    """
    try:
        await RazorpayService.activate_plan(
            user_id=current_user.id,
            plan_type=PlanType.FREE,
            db=db
        )
        
        return MessageResponse(
            message="Free plan activated successfully",
            success=True
        )
        
    except Exception as e:
        logger.error(f"❌ Error activating free plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate free plan"
        )

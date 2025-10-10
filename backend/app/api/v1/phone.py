"""
Phone verification endpoints for WhatsApp setup
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.api.dependencies import get_db, get_current_user
from app.models import User, NotificationPreference
from app.schemas import (
    PhoneVerificationRequest,
    PhoneVerificationVerify,
    MessageResponse
)
from app.services.whatsapp_service import whatsapp_service

router = APIRouter(prefix="/phone", tags=["Phone Verification"])


@router.post("/request-verification", response_model=MessageResponse)
async def request_phone_verification(
    request: PhoneVerificationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Request OTP for phone verification
    
    - Validates phone number format
    - Generates 6-digit OTP
    - Sends OTP via WhatsApp
    - Rate limited to 3 requests per 15 minutes
    """
    # Validate phone number format
    is_valid, formatted_number = whatsapp_service.validate_phone_number(request.phone_number)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid phone number format. Use E.164 format (e.g., +1234567890)"
        )
    
    # Check if phone already in use by another user
    result = await db.execute(
        select(User).where(
            User.phone_number == formatted_number,
            User.id != current_user.id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number already registered to another account"
        )
    
    # Update user's phone number
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(phone_number=formatted_number, phone_verified=False)
    )
    await db.commit()
    
    # Generate OTP
    code = await whatsapp_service.generate_phone_otp(formatted_number)
    
    # Send OTP via WhatsApp
    success, error = await whatsapp_service.send_phone_otp(formatted_number, code)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send verification code: {error}"
        )
    
    return MessageResponse(
        message=f"Verification code sent to {formatted_number}",
        success=True
    )


@router.post("/verify", response_model=MessageResponse)
async def verify_phone(
    request: PhoneVerificationVerify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Verify phone OTP and mark phone as verified
    
    - Validates OTP code
    - Marks phone as verified in database
    - Enables WhatsApp notifications
    """
    # Validate phone number format
    is_valid, formatted_number = whatsapp_service.validate_phone_number(request.phone_number)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid phone number format"
        )
    
    # Check if this is the user's phone number
    if current_user.phone_number != formatted_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number does not match your account"
        )
    
    # Verify OTP
    success, error = await whatsapp_service.verify_phone_otp(
        formatted_number,
        request.code,
        db
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error or "Invalid or expired OTP"
        )
    
    # Enable WhatsApp notifications
    await db.execute(
        update(NotificationPreference)
        .where(NotificationPreference.user_id == current_user.id)
        .values(whatsapp_enabled=True)
    )
    await db.commit()
    
    return MessageResponse(
        message="Phone number verified successfully! WhatsApp notifications enabled.",
        success=True
    )


@router.delete("/remove", response_model=MessageResponse)
async def remove_phone(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Remove phone number from account
    
    - Removes phone number
    - Marks as unverified
    - Disables WhatsApp notifications
    """
    # Remove phone number
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(phone_number=None, phone_verified=False)
    )
    
    # Disable WhatsApp notifications
    await db.execute(
        update(NotificationPreference)
        .where(NotificationPreference.user_id == current_user.id)
        .values(whatsapp_enabled=False)
    )
    
    await db.commit()
    
    return MessageResponse(
        message="Phone number removed and WhatsApp notifications disabled",
        success=True
    )

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import decode_token, create_access_token, create_refresh_token
from app.services import AuthService
from app.schemas import (
    OTPRequest, OTPVerify, TokenResponse, TokenRefresh, MessageResponse
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/otp/request", response_model=MessageResponse)
async def request_otp(
    request: OTPRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request WhatsApp OTP for login/signup
    
    - Verifies Cloudflare Turnstile CAPTCHA token
    - Validates phone number format (E.164: +1234567890)
    - Generates 6-digit OTP
    - Sends OTP via WhatsApp
    - Rate limited to 3 requests per 15 minutes per phone number
    - OTP expires in 2 minutes
    - Works for both new signups and existing user logins
    """
    try:
        # Verify Turnstile CAPTCHA first
        is_valid_captcha = await AuthService.verify_turnstile(request.captcha_token)
        if not is_valid_captcha:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA verification failed. Please try again."
            )
        
        await AuthService.create_otp(db, request.phone_number)
        return MessageResponse(
            message=f"OTP sent to {request.phone_number} via WhatsApp. Valid for 2 minutes.",
            success=True
        )
    except ValueError as e:
        # Invalid phone or rate limited
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in str(e) else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(
    request: OTPVerify,
    db: AsyncSession = Depends(get_db)
):
    """
    Verify WhatsApp OTP and get access tokens
    
    - Validates OTP code (6 digits)
    - Creates new user account on first login (signup)
    - Auto-verifies phone number
    - Assigns FREE plan to new users
    - Enables WhatsApp notifications by default
    - Returns JWT access and refresh tokens
    """
    user = await AuthService.verify_otp(db, request.phone_number, request.code)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP"
        )
    
    # Create tokens
    tokens = AuthService.create_user_tokens(user.id, user.phone_number)
    
    # Store session in Redis
    await AuthService.store_user_session(user.id, tokens['access_token'])
    
    return TokenResponse(**tokens)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: TokenRefresh,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token"""
    payload = decode_token(request.refresh_token)
    
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id = payload.get("sub")
    phone_number = payload.get("phone")
    
    if not user_id or not phone_number:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Create new tokens
    tokens = AuthService.create_user_tokens(int(user_id), phone_number)
    
    return TokenResponse(**tokens)

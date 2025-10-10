"""
Authentication API endpoints
"""
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
    """Request OTP for login/signup"""
    try:
        await AuthService.create_otp(db, request.email)
        return MessageResponse(
            message=f"OTP sent to {request.email}. Valid for 10 minutes.",
            success=True
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(
    request: OTPVerify,
    db: AsyncSession = Depends(get_db)
):
    """Verify OTP and get access tokens"""
    user = await AuthService.verify_otp(db, request.email, request.code)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP"
        )
    
    # Create tokens
    tokens = AuthService.create_user_tokens(user.id, user.email)
    
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
    email = payload.get("email")
    
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Create new tokens
    tokens = AuthService.create_user_tokens(int(user_id), email)
    
    return TokenResponse(**tokens)

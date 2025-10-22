"""
Google OAuth API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models import User, UserPlan, ConnectedEmail
from app.services import GoogleOAuthService
from app.schemas import GoogleAuthURL, GoogleAuthCallback, ConnectedEmailResponse, MessageResponse

router = APIRouter(prefix="/google", tags=["Google OAuth"])


@router.get("/auth-url", response_model=GoogleAuthURL)
async def get_google_auth_url(
    current_user: User = Depends(get_current_user)
):
    """Get Google OAuth authorization URL"""
    # Use user ID as state for security
    state = f"user_{current_user.id}"
    auth_url = GoogleOAuthService.get_auth_url(state=state)
    
    return GoogleAuthURL(auth_url=auth_url)


@router.get("/callback", response_model=GoogleAuthCallback)
async def google_oauth_callback(
    code: str = Query(...),
    state: str = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Google OAuth callback
    
    Note: This endpoint does NOT require authentication because Google redirects here
    after user authorization. We use the 'state' parameter to identify the user.
    """
    try:
        # Verify state parameter and extract user ID
        if not state or not state.startswith("user_"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid state parameter"
            )
        
        try:
            user_id = int(state.replace("user_", ""))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid user ID in state"
            )
        
        # Get user from database
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        current_user = result.scalar_one_or_none()
        
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Exchange code for tokens
        token_data = GoogleOAuthService.exchange_code_for_tokens(code)
        
        # Get user's email address from Google
        email_address = GoogleOAuthService.get_user_email_address(
            token_data['access_token']
        )
        
        # Check plan limits
        stmt = select(UserPlan).where(
            UserPlan.user_id == current_user.id,
            UserPlan.is_active == True
        ).join(UserPlan.plan)
        result = await db.execute(stmt)
        user_plan = result.scalar_one_or_none()
        
        if user_plan:
            # Count current connected emails
            stmt = select(ConnectedEmail).where(
                ConnectedEmail.user_id == current_user.id,
                ConnectedEmail.is_active == True
            )
            result = await db.execute(stmt)
            connected_count = len(result.scalars().all())
            
            if connected_count >= user_plan.plan.max_emails:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Plan limit reached. Maximum {user_plan.plan.max_emails} emails allowed."
                )
        
        # Save connected email
        connected_email = await GoogleOAuthService.save_connected_email(
            db=db,
            user_id=current_user.id,
            email_address=email_address,
            access_token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            expires_in=3600  # Default 1 hour
        )

        return GoogleAuthCallback(
            message=f"Successfully connected {email_address}",
        ) 
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to connect Gmail account: {str(e)}"
        )


@router.get("/connected-emails", response_model=list[ConnectedEmailResponse])
async def get_connected_emails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all connected Gmail accounts"""
    stmt = select(ConnectedEmail).where(
        ConnectedEmail.user_id == current_user.id
    ).order_by(ConnectedEmail.created_at.desc())
    
    result = await db.execute(stmt)
    connected_emails = result.scalars().all()
    
    return connected_emails


@router.delete("/connected-emails/{email_id}", response_model=MessageResponse)
async def disconnect_email(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Disconnect a Gmail account"""
    stmt = select(ConnectedEmail).where(
        ConnectedEmail.id == email_id,
        ConnectedEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    connected_email = result.scalar_one_or_none()
    
    if not connected_email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Connected email not found"
        )
    
    connected_email.is_active = False
    await db.commit()
    
    return MessageResponse(
        message=f"Successfully disconnected {connected_email.email_address}",
        success=True
    )

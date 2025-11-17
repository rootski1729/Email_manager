from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models import User, UserPlan, Plan, ConnectedEmail, EmailFilter, FilteredEmail
from app.schemas import UserResponse, UserWithPlan, UserUpdate, MessageResponse
from datetime import datetime, timezone

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserWithPlan)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user information with plan details"""
    # Get plan info with eager loading
    stmt = select(UserPlan).options(
        selectinload(UserPlan.plan)
    ).where(
        UserPlan.user_id == current_user.id,
        UserPlan.is_active == True
    )
    result = await db.execute(stmt)
    user_plan = result.scalar_one_or_none()
    
    # Count connected emails
    stmt = select(func.count()).select_from(ConnectedEmail).where(
        ConnectedEmail.user_id == current_user.id,
        ConnectedEmail.is_active == True
    )
    result = await db.execute(stmt)
    connected_count = result.scalar()
    
    # Count filters
    stmt = select(func.count()).select_from(EmailFilter).where(
        EmailFilter.user_id == current_user.id,
        EmailFilter.is_active == True
    )
    result = await db.execute(stmt)
    filters_count = result.scalar()
    
    user_data = {
        "id": current_user.id,
        "email": current_user.email,
        "phone_number": current_user.phone_number,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "phone_verified": current_user.phone_verified,
        "is_active": current_user.is_active,
        "is_verified": current_user.is_verified,
        "created_at": current_user.created_at,
        "connected_emails_count": connected_count,
        "filters_count": filters_count,
    }
    
    if user_plan:
        user_data.update({
            "plan_name": user_plan.plan.name,
            "plan_max_emails": user_plan.plan.max_emails,
            "plan_max_filters": user_plan.plan.max_filters,
        })
    
    return UserWithPlan(**user_data)


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user information (email, phone, etc.)"""
    update_data = user_data.dict(exclude_unset=True)
    
    # Validate email uniqueness if updating email
    if "email" in update_data and update_data["email"]:
        # Check if email is already taken by another user
        stmt = select(User).where(
            User.email == update_data["email"],
            User.id != current_user.id
        )
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered by another user"
            )
        
        # Mark email as unverified if changed
        if update_data["email"] != current_user.email:
            current_user.is_verified = False
    
    # Update user fields
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    
    return current_user


@router.delete("/me", response_model=MessageResponse)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deactivate current user account"""
    current_user.is_active = False
    await db.commit()
    
    return MessageResponse(
        message="Account deactivated successfully",
        success=True
    )


@router.get("/me/stats")
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user statistics"""
    # Total filtered emails
    stmt = select(func.count()).select_from(FilteredEmail).where(
        FilteredEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    total_emails = result.scalar()
    
    # Unread emails
    stmt = select(func.count()).select_from(FilteredEmail).where(
        FilteredEmail.user_id == current_user.id,
        FilteredEmail.is_read == False
    )
    result = await db.execute(stmt)
    unread_emails = result.scalar()
    
    # Emails today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = select(func.count()).select_from(FilteredEmail).where(
        FilteredEmail.user_id == current_user.id,
        FilteredEmail.received_at >= today_start
    )
    result = await db.execute(stmt)
    emails_today = result.scalar()
    
    # Active filters
    stmt = select(func.count()).select_from(EmailFilter).where(
        EmailFilter.user_id == current_user.id,
        EmailFilter.is_active == True
    )
    result = await db.execute(stmt)
    active_filters = result.scalar()
    
    # Connected emails
    stmt = select(func.count()).select_from(ConnectedEmail).where(
        ConnectedEmail.user_id == current_user.id,
        ConnectedEmail.is_active == True
    )
    result = await db.execute(stmt)
    connected_emails = result.scalar()
    
    return {
        "total_filtered_emails": total_emails,
        "unread_emails": unread_emails,
        "emails_today": emails_today,
        "active_filters": active_filters,
        "connected_emails": connected_emails,
    }

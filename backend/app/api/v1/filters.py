"""
Email filters API endpoints
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models import User, EmailFilter, UserPlan
from app.services import FilterService
from app.schemas import (
    EmailFilterCreate, EmailFilterUpdate, EmailFilterResponse, MessageResponse
)

router = APIRouter(prefix="/filters", tags=["Email Filters"])


@router.post("", response_model=EmailFilterResponse, status_code=status.HTTP_201_CREATED)
async def create_filter(
    filter_data: EmailFilterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new email filter"""
    # Check plan limits
    stmt = select(UserPlan).where(
        UserPlan.user_id == current_user.id,
        UserPlan.is_active == True
    ).options(selectinload(UserPlan.plan))
    result = await db.execute(stmt)
    user_plan = result.scalar_one_or_none()
    
    if user_plan:
        # Count existing filters
        stmt = select(EmailFilter).where(
            EmailFilter.user_id == current_user.id,
            EmailFilter.is_active == True
        )
        result = await db.execute(stmt)
        filter_count = len(result.scalars().all())
        
        if filter_count >= user_plan.plan.max_filters:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plan limit reached. Maximum {user_plan.plan.max_filters} filters allowed."
            )
    
    # Create filter
    new_filter = EmailFilter(
        user_id=current_user.id,
        name=filter_data.name,
        filter_type=filter_data.filter_type,
        conditions=filter_data.conditions.dict(exclude_none=True),
        action_type=filter_data.action_type,
        priority=filter_data.priority
    )
    
    db.add(new_filter)
    
    try:
        await db.commit()
        await db.refresh(new_filter)
    except Exception as e:
        await db.rollback()
        # Check if it's a unique constraint violation for priority
        if "uq_user_priority" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Priority {filter_data.priority} is already used by another filter. Please choose a different priority."
            )
        raise
    
    # Invalidate cache
    await FilterService.invalidate_user_filters_cache(current_user.id)
    
    return new_filter


@router.get("", response_model=List[EmailFilterResponse])
async def list_filters(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = False
):
    """Get all filters for current user"""
    if include_inactive:
        stmt = select(EmailFilter).where(
            EmailFilter.user_id == current_user.id
        ).order_by(EmailFilter.priority.desc(), EmailFilter.created_at.desc())
    else:
        stmt = select(EmailFilter).where(
            and_(
                EmailFilter.user_id == current_user.id,
                EmailFilter.is_active == True
            )
        ).order_by(EmailFilter.priority.desc(), EmailFilter.created_at.desc())
    
    result = await db.execute(stmt)
    filters = result.scalars().all()
    
    return filters


@router.get("/{filter_id}", response_model=EmailFilterResponse)
async def get_filter(
    filter_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific filter"""
    stmt = select(EmailFilter).where(
        EmailFilter.id == filter_id,
        EmailFilter.user_id == current_user.id
    )
    result = await db.execute(stmt)
    filter_obj = result.scalar_one_or_none()
    
    if not filter_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found"
        )
    
    return filter_obj


@router.patch("/{filter_id}", response_model=EmailFilterResponse)
async def update_filter(
    filter_id: int,
    filter_data: EmailFilterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an email filter"""
    stmt = select(EmailFilter).where(
        EmailFilter.id == filter_id,
        EmailFilter.user_id == current_user.id
    )
    result = await db.execute(stmt)
    filter_obj = result.scalar_one_or_none()
    
    if not filter_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found"
        )
    
    # Update fields
    update_data = filter_data.dict(exclude_unset=True)
    
    if 'conditions' in update_data:
        update_data['conditions'] = update_data['conditions'].dict(exclude_none=True)
    
    for field, value in update_data.items():
        setattr(filter_obj, field, value)
    
    try:
        await db.commit()
        await db.refresh(filter_obj)
    except Exception as e:
        await db.rollback()
        # Check if it's a unique constraint violation for priority
        if "uq_user_priority" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Priority {update_data.get('priority')} is already used by another filter. Please choose a different priority."
            )
        raise
    
    # Invalidate cache
    await FilterService.invalidate_user_filters_cache(current_user.id)
    
    return filter_obj


@router.delete("/{filter_id}", response_model=MessageResponse)
async def delete_filter(
    filter_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an email filter"""
    stmt = select(EmailFilter).where(
        EmailFilter.id == filter_id,
        EmailFilter.user_id == current_user.id
    )
    result = await db.execute(stmt)
    filter_obj = result.scalar_one_or_none()
    
    if not filter_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found"
        )
    
    # Soft delete
    filter_obj.is_active = False
    await db.commit()
    
    # Invalidate cache
    await FilterService.invalidate_user_filters_cache(current_user.id)
    
    return MessageResponse(
        message=f"Filter '{filter_obj.name}' deleted successfully",
        success=True
    )

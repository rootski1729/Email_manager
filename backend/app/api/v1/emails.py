"""
Filtered emails API endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, desc
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.models import User, FilteredEmail, EmailFilter, ConnectedEmail
from app.schemas import (
    FilteredEmailResponse, FilteredEmailUpdate, EmailListResponse, MessageResponse
)

router = APIRouter(prefix="/emails", tags=["Filtered Emails"])


@router.get("", response_model=EmailListResponse)
async def list_filtered_emails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    filter_id: Optional[int] = None,
    is_read: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    connected_email_id: Optional[int] = None
):
    """Get filtered emails for current user (paginated). Only returns emails from active connected accounts."""
    # Build query - only from active connected emails
    conditions = [FilteredEmail.user_id == current_user.id]
    
    if filter_id:
        conditions.append(FilteredEmail.matched_filter_id == filter_id)
    
    if is_read is not None:
        conditions.append(FilteredEmail.is_read == is_read)
    
    if is_archived is not None:
        conditions.append(FilteredEmail.is_archived == is_archived)
    
    # Get total count
    count_stmt = select(func.count()).select_from(FilteredEmail).where(and_(*conditions))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar()
    
    # Get paginated results
    offset = (page - 1) * page_size
    stmt = select(FilteredEmail).where(
        and_(*conditions)
    ).order_by(
        desc(FilteredEmail.received_at)
    ).offset(offset).limit(page_size)
    
    result = await db.execute(stmt)
    emails = result.scalars().all()
    
    # Enrich with filter names and email addresses
    email_responses = []
    for email in emails:
        email_dict = {
            "id": email.id,
            "user_id": email.user_id,
            "connected_email_id": email.connected_email_id,
            "gmail_message_id": email.gmail_message_id,
            "sender": email.sender,
            "subject": email.subject,
            "snippet": email.snippet,
            "body_preview": email.body_preview,
            "received_at": email.received_at,
            "matched_filter_id": email.matched_filter_id,
            "is_read": email.is_read,
            "is_archived": email.is_archived,
            "notified_at": email.notified_at,
            "created_at": email.created_at,
        }
        
        # Get filter name
        filter_stmt = select(EmailFilter).where(EmailFilter.id == email.matched_filter_id)
        filter_result = await db.execute(filter_stmt)
        filter_obj = filter_result.scalar_one_or_none()
        if filter_obj:
            email_dict["filter_name"] = filter_obj.name
        
        # Get connected email address
        conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
        conn_result = await db.execute(conn_stmt)
        conn_email = conn_result.scalar_one_or_none()
        if conn_email:
            email_dict["connected_email_address"] = conn_email.email_address
        
        email_responses.append(FilteredEmailResponse(**email_dict))
    
    return EmailListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=email_responses
    )


@router.get("/{email_id}", response_model=FilteredEmailResponse)
async def get_filtered_email(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific filtered email. Only accessible if connected email is active."""
    stmt = select(FilteredEmail).where(
        FilteredEmail.id == email_id,
        FilteredEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    email = result.scalar_one_or_none()
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )
    
    # Verify connected email is active
    conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
    conn_result = await db.execute(conn_stmt)
    conn_email = conn_result.scalar_one_or_none()
    
    if not conn_email or not conn_email.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access email from an inactive connected account"
        )
    
    # Enrich response
    email_dict = {
        "id": email.id,
        "user_id": email.user_id,
        "connected_email_id": email.connected_email_id,
        "gmail_message_id": email.gmail_message_id,
        "sender": email.sender,
        "subject": email.subject,
        "snippet": email.snippet,
        "body_preview": email.body_preview,
        "received_at": email.received_at,
        "matched_filter_id": email.matched_filter_id,
        "is_read": email.is_read,
        "is_archived": email.is_archived,
        "notified_at": email.notified_at,
        "created_at": email.created_at,
    }
    
    # Get filter name
    filter_stmt = select(EmailFilter).where(EmailFilter.id == email.matched_filter_id)
    filter_result = await db.execute(filter_stmt)
    filter_obj = filter_result.scalar_one_or_none()
    if filter_obj:
        email_dict["filter_name"] = filter_obj.name
    
    # Get connected email
    conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
    conn_result = await db.execute(conn_stmt)
    conn_email = conn_result.scalar_one_or_none()
    if conn_email:
        email_dict["connected_email_address"] = conn_email.email_address
    
    return FilteredEmailResponse(**email_dict)


@router.patch("/{email_id}", response_model=FilteredEmailResponse)
async def update_filtered_email(
    email_id: int,
    email_data: FilteredEmailUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a filtered email (mark as read/archived). Only accessible if connected email is active."""
    stmt = select(FilteredEmail).where(
        FilteredEmail.id == email_id,
        FilteredEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    email = result.scalar_one_or_none()
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )
    
    # Verify connected email is active
    conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
    conn_result = await db.execute(conn_stmt)
    conn_email = conn_result.scalar_one_or_none()
    
    if not conn_email or not conn_email.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify email from an inactive connected account"
        )
    
    # Update fields
    update_data = email_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(email, field, value)
    
    await db.commit()
    await db.refresh(email)
    
    return email


@router.post("/{email_id}/mark-read", response_model=MessageResponse)
async def mark_email_read(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark email as read"""
    stmt = select(FilteredEmail).where(
        FilteredEmail.id == email_id,
        FilteredEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    email = result.scalar_one_or_none()
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )
    
    # Verify connected email is active
    conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
    conn_result = await db.execute(conn_stmt)
    conn_email = conn_result.scalar_one_or_none()
    
    if not conn_email or not conn_email.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify email from an inactive connected account"
        )
    
    email.is_read = True
    await db.commit()
    
    return MessageResponse(message="Email marked as read", success=True)


@router.post("/{email_id}/archive", response_model=MessageResponse)
async def archive_email(
    email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive email"""
    stmt = select(FilteredEmail).where(
        FilteredEmail.id == email_id,
        FilteredEmail.user_id == current_user.id
    )
    result = await db.execute(stmt)
    email = result.scalar_one_or_none()
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )
    
    # Verify connected email is active
    conn_stmt = select(ConnectedEmail).where(ConnectedEmail.id == email.connected_email_id)
    conn_result = await db.execute(conn_stmt)
    conn_email = conn_result.scalar_one_or_none()
    
    if not conn_email or not conn_email.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify email from an inactive connected account"
        )
    
    email.is_archived = True
    await db.commit()
    
    return MessageResponse(message="Email archived", success=True)

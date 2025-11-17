"""
Gmail emails API endpoints - Fetch emails directly from Gmail
"""
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.core.redis import get_redis
from app.api.dependencies import get_current_user
from app.models import User, ConnectedEmail
from app.services.gmail_service import GoogleOAuthService
from redis.asyncio import Redis

router = APIRouter(prefix="/gmail/emails", tags=["Gmail Emails"])


@router.get("/all")
async def get_all_inbox_emails(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    max_results: int = Query(20, ge=1, le=100, description="Max emails per inbox per page"),
    query: Optional[str] = Query(None, description="Gmail search query (e.g., 'is:unread')"),
    use_cache: bool = Query(True, description="Use Redis cache")
):
    """
    Get emails from ALL connected inboxes with pagination
    
    - Fetches emails from every connected Gmail account
    - Pagination: Each page fetches max_results emails per inbox
    - Emails are sorted by date (newest first) across all inboxes
    - Auto-refreshes expired access tokens
    - Caches results in Redis for 5 minutes (page 1 only)
    - Returns combined list with inbox identifier
    
    Example:
    - page=1, max_results=20: First 20 emails from each inbox
    - page=2, max_results=20: Next 20 emails from each inbox
    """
    try:
        # Check Redis cache first (only for page 1)
        cache_key = f"gmail:all_emails:user_{current_user.id}:page_{page}:max_{max_results}:q_{query or 'none'}"
        
        if use_cache and redis and page == 1:
            try:
                cached_data = await redis.get(cache_key)
                if cached_data:
                    print(f"✅ Cache hit for all emails page {page}")
                    return json.loads(cached_data)
            except Exception as e:
                print(f"⚠️  Redis cache read failed: {e}")
        
        # Get all active connected emails for user
        stmt = select(ConnectedEmail).where(
            and_(
                ConnectedEmail.user_id == current_user.id,
                ConnectedEmail.is_active == True
            )
        )
        result = await db.execute(stmt)
        connected_emails = result.scalars().all()
        
        if not connected_emails:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No connected Gmail accounts found"
            )
        
        # Store page tokens in Redis for pagination across requests
        page_tokens_key = f"gmail:page_tokens:user_{current_user.id}:q_{query or 'none'}"
        
        # Get stored page tokens for each inbox (if page > 1)
        page_tokens = {}
        if page > 1 and redis:
            try:
                stored_tokens = await redis.get(page_tokens_key)
                if stored_tokens:
                    page_tokens = json.loads(stored_tokens)
            except Exception as e:
                print(f"⚠️  Failed to get page tokens: {e}")
        
        # Fetch emails from each inbox
        all_emails = []
        new_page_tokens = {}
        
        for connected_email in connected_emails:
            try:
                # Get the page token for this inbox (if page > 1)
                inbox_page_token = None
                if page > 1:
                    inbox_page_token = page_tokens.get(str(connected_email.id))
                
                inbox_data = await GoogleOAuthService.list_emails_from_inbox(
                    db=db,
                    connected_email=connected_email,
                    max_results=max_results,
                    page_token=inbox_page_token,
                    query=query
                )
                
                # Store next page token for this inbox
                if inbox_data.get('nextPageToken'):
                    new_page_tokens[str(connected_email.id)] = inbox_data['nextPageToken']
                
                # Add inbox identifier to each email
                for email in inbox_data['emails']:
                    email['inbox_email_address'] = connected_email.email_address
                    email['connected_email_id'] = connected_email.id
                
                all_emails.extend(inbox_data['emails'])
                
            except Exception as e:
                print(f"⚠️  Failed to fetch from {connected_email.email_address}: {e}")
                # Continue with other inboxes
                continue
        
        # Store page tokens for next page (expires in 1 hour)
        if new_page_tokens and redis:
            try:
                await redis.setex(
                    page_tokens_key,
                    3600,  # 1 hour
                    json.dumps(new_page_tokens)
                )
            except Exception as e:
                print(f"⚠️  Failed to store page tokens: {e}")
        
        # Sort by date (newest first) - internalDate is a timestamp string
        all_emails.sort(key=lambda x: int(x.get('internalDate', '0')), reverse=True)
        
        response_data = {
            'total_inboxes': len(connected_emails),
            'total_emails': len(all_emails),
            'page': page,
            'max_results_per_inbox': max_results,
            'has_next_page': len(new_page_tokens) > 0,  # True if any inbox has more emails
            'emails': all_emails
        }
        
        # Cache in Redis for 5 minutes (page 1 only)
        if use_cache and redis and page == 1:
            try:
                await redis.setex(
                    cache_key,
                    300,  # 5 minutes
                    json.dumps(response_data, default=str)
                )
                print(f"✅ Cached all emails page {page} in Redis")
            except Exception as e:
                print(f"⚠️  Redis cache write failed: {e}")
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch emails: {str(e)}"
        )


@router.get("/inbox/{connected_email_id}")
async def get_specific_inbox_emails(
    connected_email_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    max_results: int = Query(20, ge=1, le=100),
    page_token: Optional[str] = Query(None, description="Pagination token from previous response"),
    query: Optional[str] = Query(None, description="Gmail search query"),
    use_cache: bool = Query(True, description="Use Redis cache")
):
    """
    Get emails from a SPECIFIC connected inbox
    
    - Fetches from single Gmail account
    - Supports pagination with page_token
    - Auto-refreshes expired tokens
    - Caches results for 5 minutes
    """
    try:
        # Check cache
        cache_key = f"gmail:inbox_{connected_email_id}:max_{max_results}:page_{page_token or 'first'}:q_{query or 'none'}"
        
        if use_cache and redis and not page_token:  # Don't cache paginated requests
            try:
                cached_data = await redis.get(cache_key)
                if cached_data:
                    print(f"✅ Cache hit for inbox {connected_email_id}")
                    return json.loads(cached_data)
            except Exception as e:
                print(f"⚠️  Redis cache read failed: {e}")
        
        # Get connected email
        stmt = select(ConnectedEmail).where(
            and_(
                ConnectedEmail.id == connected_email_id,
                ConnectedEmail.user_id == current_user.id,
                ConnectedEmail.is_active == True
            )
        )
        result = await db.execute(stmt)
        connected_email = result.scalar_one_or_none()
        
        if not connected_email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Connected email {connected_email_id} not found or not authorized"
            )
        
        # Fetch emails
        inbox_data = await GoogleOAuthService.list_emails_from_inbox(
            db=db,
            connected_email=connected_email,
            max_results=max_results,
            page_token=page_token,
            query=query
        )
        
        response_data = {
            'inbox_email_address': connected_email.email_address,
            'connected_email_id': connected_email.id,
            'total_emails': len(inbox_data['emails']),
            'next_page_token': inbox_data.get('nextPageToken'),
            'result_size_estimate': inbox_data.get('resultSizeEstimate', 0),
            'emails': inbox_data['emails']
        }
        
        # Cache first page only
        if use_cache and redis and not page_token:
            try:
                await redis.setex(
                    cache_key,
                    300,
                    json.dumps(response_data, default=str)
                )
                print(f"✅ Cached inbox {connected_email_id} emails")
            except Exception as e:
                print(f"⚠️  Redis cache write failed: {e}")
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch inbox emails: {str(e)}"
        )


@router.get("/inbox/{connected_email_id}/message/{message_id}")
async def get_specific_email_by_id(
    connected_email_id: int,
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    format: str = Query('full', regex='^(minimal|full|raw|metadata)$', description="Email format"),
    use_cache: bool = Query(True, description="Use Redis cache")
):
    """
    Get a SPECIFIC email by Gmail message ID from a SPECIFIC inbox
    
    - Fetches single email with full details
    - Supports multiple formats: minimal, full, raw, metadata
    - Auto-refreshes expired tokens
    - Caches for 10 minutes (emails don't change often)
    """
    try:
        # Check cache
        cache_key = f"gmail:email:{connected_email_id}:{message_id}:{format}"
        
        if use_cache and redis:
            try:
                cached_data = await redis.get(cache_key)
                if cached_data:
                    print(f"✅ Cache hit for email {message_id}")
                    return json.loads(cached_data)
            except Exception as e:
                print(f"⚠️  Redis cache read failed: {e}")
        
        # Get connected email
        stmt = select(ConnectedEmail).where(
            and_(
                ConnectedEmail.id == connected_email_id,
                ConnectedEmail.user_id == current_user.id,
                ConnectedEmail.is_active == True
            )
        )
        result = await db.execute(stmt)
        connected_email = result.scalar_one_or_none()
        
        if not connected_email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Connected email {connected_email_id} not found or not authorized"
            )
        
        # Fetch specific email
        email_data = await GoogleOAuthService.get_email_by_id(
            db=db,
            connected_email=connected_email,
            message_id=message_id,
            format=format
        )
        
        response_data = {
            'inbox_email_address': connected_email.email_address,
            'connected_email_id': connected_email.id,
            'email': email_data
        }
        
        # Cache for 10 minutes
        if use_cache and redis:
            try:
                await redis.setex(
                    cache_key,
                    600,  # 10 minutes
                    json.dumps(response_data, default=str)
                )
                print(f"✅ Cached email {message_id}")
            except Exception as e:
                print(f"⚠️  Redis cache write failed: {e}")
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch email: {str(e)}"
        )


@router.post("/cache/clear")
async def clear_email_cache(
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
    connected_email_id: Optional[int] = Query(None, description="Clear specific inbox cache only")
):
    """
    Clear email cache for current user
    
    - Without connected_email_id: Clears ALL email caches for user
    - With connected_email_id: Clears cache for specific inbox only
    """
    if not redis:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis is not available"
        )
    
    try:
        if connected_email_id:
            # Clear specific inbox cache
            pattern = f"gmail:inbox_{connected_email_id}:*"
        else:
            # Clear all user email caches
            pattern = f"gmail:*user_{current_user.id}*"
        
        # Find and delete matching keys
        deleted_count = 0
        cursor = 0
        
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            if keys:
                await redis.delete(*keys)
                deleted_count += len(keys)
            
            if cursor == 0:
                break
        
        return {
            "message": f"Cache cleared successfully",
            "deleted_keys": deleted_count,
            "pattern": pattern
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear cache: {str(e)}"
        )

"""
Email filtering service - match emails against user-defined filters
"""
import re
from typing import List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models import EmailFilter, FilteredEmail, ConnectedEmail, FilterType
from app.core.redis import redis_manager
import json


class FilterService:
    """Handle email filtering logic"""
    
    @staticmethod
    async def get_user_filters(db: AsyncSession, user_id: int, use_cache: bool = True) -> List[EmailFilter]:
        """Get all active filters for a user (with caching)"""
        if use_cache:
            # Try cache first
            redis_client = await redis_manager.get_cache_client()
            cache_key = f"user_filters:{user_id}"
            cached = await redis_client.get(cache_key)
            
            if cached:
                # Parse cached filters
                filters_data = json.loads(cached)
                # Note: In production, reconstruct EmailFilter objects properly
                # For now, we'll use database as source of truth
        
        # Get from database
        stmt = select(EmailFilter).where(
            and_(
                EmailFilter.user_id == user_id,
                EmailFilter.is_active == True
            )
        ).order_by(EmailFilter.priority.desc())
        
        result = await db.execute(stmt)
        filters = result.scalars().all()
        
        # Cache for 5 minutes
        if use_cache and filters:
            redis_client = await redis_manager.get_cache_client()
            cache_key = f"user_filters:{user_id}"
            # Simple caching (in production, serialize properly)
            await redis_client.setex(cache_key, 300, "1")
        
        return filters
    
    @staticmethod
    def check_filter_match(
        email_data: dict,
        filter_obj: EmailFilter
    ) -> bool:
        """Check if email matches a filter"""
        conditions = filter_obj.conditions
        
        # Extract email data
        sender = email_data.get('sender', '').lower()
        subject = email_data.get('subject', '').lower()
        body = email_data.get('body', '').lower()
        
        # Helper function to check if any value in list matches (OR logic)
        def matches_any(value_list, target_text):
            """Check if any value in the list is contained in the target text"""
            if not value_list:
                return False
            # Ensure value_list is always a list
            if not isinstance(value_list, list):
                value_list = [value_list]
            return any(val.lower() in target_text for val in value_list if val)
        
        # Check based on filter type
        if filter_obj.filter_type == FilterType.SENDER:
            if 'sender' in conditions:
                if matches_any(conditions['sender'], sender):
                    return True
            
            if 'sender_domain' in conditions:
                if matches_any(conditions['sender_domain'], sender):
                    return True
        
        elif filter_obj.filter_type == FilterType.SUBJECT:
            if 'subject_contains' in conditions:
                if matches_any(conditions['subject_contains'], subject):
                    return True
        
        elif filter_obj.filter_type == FilterType.BODY:
            if 'body_contains' in conditions:
                if matches_any(conditions['body_contains'], body):
                    return True
        
        elif filter_obj.filter_type == FilterType.CUSTOM:
            # Combined filters - all specified conditions must match (AND logic)
            # But within each condition, any value can match (OR logic)
            matched = True
            
            if 'sender' in conditions:
                if not matches_any(conditions['sender'], sender):
                    matched = False
            
            if 'subject_contains' in conditions and matched:
                if not matches_any(conditions['subject_contains'], subject):
                    matched = False
            
            if 'body_contains' in conditions and matched:
                if not matches_any(conditions['body_contains'], body):
                    matched = False
            
            if 'sender_domain' in conditions and matched:
                if not matches_any(conditions['sender_domain'], sender):
                    matched = False
            
            return matched
        
        return False
    
    @staticmethod
    async def process_email_against_filters(
        db: AsyncSession,
        user_id: int,
        connected_email_id: int,
        email_data: dict
    ) -> Optional[FilteredEmail]:
        """Process an email against all user filters"""
        # Get user's active filters
        filters = await FilterService.get_user_filters(db, user_id)
        
        if not filters:
            return None
        
        # Check each filter (ordered by priority)
        for filter_obj in filters:
            if FilterService.check_filter_match(email_data, filter_obj):
                # Email matches this filter
                print(f"✅ Email matched filter: {filter_obj.name}")
                
                # Store filtered email
                filtered_email = FilteredEmail(
                    user_id=user_id,
                    connected_email_id=connected_email_id,
                    gmail_message_id=email_data['message_id'],
                    gmail_thread_id=email_data.get('thread_id'),
                    sender=email_data['sender'],
                    subject=email_data['subject'],
                    snippet=email_data.get('snippet'),
                    body_preview=email_data.get('body', '')[:500] if email_data.get('body') else None,
                    received_at=datetime.fromtimestamp(int(email_data.get('internal_date', 0)) / 1000),
                    matched_filter_id=filter_obj.id
                )
                
                db.add(filtered_email)
                
                # Increment filter match count
                filter_obj.match_count += 1
                
                await db.commit()
                await db.refresh(filtered_email)
                
                return filtered_email
        
        return None
    
    @staticmethod
    async def invalidate_user_filters_cache(user_id: int):
        """Invalidate cached filters when user updates them"""
        redis_client = await redis_manager.get_cache_client()
        cache_key = f"user_filters:{user_id}"
        await redis_client.delete(cache_key)

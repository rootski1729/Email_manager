"""
Redis connection manager
"""
import redis.asyncio as aioredis
from typing import Optional
from app.core.config import settings


class RedisManager:
    """Manage Redis connections for different purposes"""
    
    def __init__(self):
        self._cache_client: Optional[aioredis.Redis] = None
        self._session_client: Optional[aioredis.Redis] = None
    
    async def get_cache_client(self) -> aioredis.Redis:
        """Get Redis client for caching"""
        if self._cache_client is None:
            self._cache_client = await aioredis.from_url(
                settings.REDIS_URL,
                db=settings.REDIS_CACHE_DB,
                encoding="utf-8",
                decode_responses=True
            )
        return self._cache_client
    
    async def get_session_client(self) -> aioredis.Redis:
        """Get Redis client for session management"""
        if self._session_client is None:
            self._session_client = await aioredis.from_url(
                settings.REDIS_URL,
                db=settings.REDIS_SESSION_DB,
                encoding="utf-8",
                decode_responses=True
            )
        return self._session_client
    
    async def close(self):
        """Close all Redis connections"""
        if self._cache_client:
            await self._cache_client.close()
        if self._session_client:
            await self._session_client.close()


redis_manager = RedisManager()

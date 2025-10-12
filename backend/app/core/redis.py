import redis.asyncio as aioredis
from typing import Optional
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


class RedisManager:
    def __init__(self):
        self._cache_client: Optional[aioredis.Redis] = None
        self._session_client: Optional[aioredis.Redis] = None
    
    async def get_cache_client(self) -> aioredis.Redis:
        if self._cache_client is None:
            try:
                self._cache_client = await aioredis.from_url(
                    settings.REDIS_URL,
                    db=settings.REDIS_CACHE_DB,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,  # 5 second timeout
                    socket_timeout=5
                )
                # Test connection
                await self._cache_client.ping()
                logger.info("Redis cache client connected successfully")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {str(e)}")
                logger.warning("Application will continue without Redis caching")
                raise
        return self._cache_client
    
    async def get_session_client(self) -> aioredis.Redis:
        if self._session_client is None:
            try:
                self._session_client = await aioredis.from_url(
                    settings.REDIS_URL,
                    db=settings.REDIS_SESSION_DB,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # Test connection
                await self._session_client.ping()
                logger.info("Redis session client connected successfully")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {str(e)}")
                logger.warning("Application will continue without Redis sessions")
                raise
        return self._session_client
    
    async def close(self):
        if self._cache_client:
            await self._cache_client.close()
        if self._session_client:
            await self._session_client.close()


redis_manager = RedisManager()


async def get_redis() -> Optional[aioredis.Redis]:
    try:
        return await redis_manager.get_cache_client()
    except Exception as e:
        logger.warning(f"Redis unavailable, returning None: {e}")
        return None

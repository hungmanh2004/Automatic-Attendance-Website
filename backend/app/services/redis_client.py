import logging

import redis

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def init_redis(url: str) -> redis.Redis:
    global _client
    _client = redis.Redis.from_url(url, decode_responses=False)
    _client.ping()
    logger.info("Redis connected: %s", url)
    return _client


def get_redis() -> redis.Redis:
    if _client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _client

from .redis_client import get_redis

_RATE_LIMIT_PREFIX = "rl:"


class RateLimiter:
    """Redis fixed-window rate limiter (per key, typically IP)."""

    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def is_limited(self, key: str) -> bool:
        r = get_redis()
        redis_key = f"{_RATE_LIMIT_PREFIX}{key}"
        count = r.incr(redis_key)
        if count == 1:
            r.expire(redis_key, self.window_seconds)
        return count > self.max_requests

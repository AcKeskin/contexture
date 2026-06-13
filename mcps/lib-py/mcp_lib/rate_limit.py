"""Token-bucket rate limiter for async contexts."""

import asyncio
import time


class RateLimiter:
    """Async token-bucket rate limiter.

    Awaiting acquire() blocks until a token is available.
    """

    def __init__(self, requests_per_second: float) -> None:
        self._max_tokens = requests_per_second
        self._tokens = requests_per_second
        self._refill_rate = requests_per_second / 1000  # tokens per ms
        self._last_refill = time.monotonic() * 1000

    def _refill(self) -> None:
        now = time.monotonic() * 1000
        elapsed = now - self._last_refill
        self._tokens = min(self._max_tokens, self._tokens + elapsed * self._refill_rate)
        self._last_refill = now

    async def acquire(self) -> None:
        self._refill()
        if self._tokens >= 1:
            self._tokens -= 1
            return
        wait_ms = (1 - self._tokens) / self._refill_rate
        await asyncio.sleep(wait_ms / 1000)
        self._refill()
        self._tokens -= 1

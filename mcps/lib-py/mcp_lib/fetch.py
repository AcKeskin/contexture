"""Async HTTP client with auth and rate limiting for MCP API-wrapper servers."""

import os
from typing import Any

import httpx

from .rate_limit import RateLimiter


class ApiFetcher:
    """Typed HTTP client with auth header injection and rate limiting."""

    def __init__(
        self,
        base_url: str,
        auth_type: str = "none",
        auth_env_var: str = "",
        rate_limit: float = 10,
        header_name: str = "",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._limiter = RateLimiter(rate_limit)
        self._auth_headers = self._build_auth_headers(auth_type, auth_env_var, header_name)
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers={**self._auth_headers, "Accept": "application/json"},
            timeout=30.0,
        )

    @staticmethod
    def _build_auth_headers(auth_type: str, env_var: str, header_name: str) -> dict[str, str]:
        if auth_type == "none":
            return {}
        key = os.environ.get(env_var, "") if env_var else ""
        if not key:
            import sys
            print(f"Warning: {env_var} not set, requests will be unauthenticated", file=sys.stderr)
            return {}
        if auth_type == "bearer":
            return {"Authorization": f"Bearer {key}"}
        if auth_type == "api-key":
            return {header_name or "X-Api-Key": key}
        if auth_type == "custom":
            return {header_name or "X-Custom-Auth": key}
        return {}

    async def get(self, path: str, params: dict[str, str] | None = None) -> Any:
        await self._limiter.acquire()
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, json: Any = None) -> Any:
        await self._limiter.acquire()
        resp = await self._client.post(path, json=json)
        resp.raise_for_status()
        return resp.json()

    async def put(self, path: str, json: Any = None) -> Any:
        await self._limiter.acquire()
        resp = await self._client.put(path, json=json)
        resp.raise_for_status()
        return resp.json()

    async def delete(self, path: str) -> Any:
        await self._limiter.acquire()
        resp = await self._client.delete(path)
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()


def create_api_fetcher(
    base_url: str,
    auth_type: str = "none",
    auth_env_var: str = "",
    rate_limit: float = 10,
    header_name: str = "",
) -> ApiFetcher:
    """Create an ApiFetcher with the given configuration."""
    return ApiFetcher(
        base_url=base_url,
        auth_type=auth_type,
        auth_env_var=auth_env_var,
        rate_limit=rate_limit,
        header_name=header_name,
    )

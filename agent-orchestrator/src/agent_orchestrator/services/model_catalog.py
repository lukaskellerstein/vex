"""Model catalog — lists the models supported by the Claude Agent SDK / CLI.

The Claude Code CLI reports its supported models in the `initialize`
handshake (the same data the TypeScript SDK exposes as `supportedModels()`).
We read it via `ClaudeSDKClient.get_server_info()["models"]` and cache it
in-process, since fetching spawns a CLI subprocess (~2-5s).
"""

import asyncio
import logging
import time

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

logger = logging.getLogger(__name__)

_FALLBACK_MODELS = [
    {"value": "default", "displayName": "Default", "description": "Claude Code default model"},
    {"value": "sonnet", "displayName": "Sonnet", "description": "Latest Sonnet"},
    {"value": "opus", "displayName": "Opus", "description": "Latest Opus"},
    {"value": "haiku", "displayName": "Haiku", "description": "Latest Haiku"},
]

_FETCH_TIMEOUT_S = 20
_TTL_S = 3600

_cache: list[dict] | None = None
_cache_at: float = 0.0
_lock = asyncio.Lock()


async def _fetch_from_sdk() -> list[dict]:
    """Connect a short-lived SDK client and read the CLI's model list."""
    client = ClaudeSDKClient(options=ClaudeAgentOptions(max_turns=1))
    await client.connect()
    try:
        info = await client.get_server_info()
    finally:
        await client.disconnect()
    models = (info or {}).get("models")
    if not models:
        raise RuntimeError("Claude Agent SDK returned no models in server info")
    return [
        {
            "value": m["value"],
            "displayName": m.get("displayName", m["value"]),
            "description": m.get("description", ""),
        }
        for m in models
        if m.get("value")
    ]


def _ensure_default_first(models: list[dict]) -> list[dict]:
    default = [m for m in models if m["value"] == "default"]
    rest = [m for m in models if m["value"] != "default"]
    if not default:
        default = [_FALLBACK_MODELS[0]]
    return default + rest


async def list_models() -> dict:
    """Return the available models, cached for _TTL_S seconds.

    Falls back to a static alias list if the SDK/CLI is unavailable;
    failures are not cached so the next request retries.
    """
    global _cache, _cache_at
    async with _lock:
        if _cache is not None and time.monotonic() - _cache_at < _TTL_S:
            return {"models": _cache, "source": "sdk"}
        try:
            models = await asyncio.wait_for(_fetch_from_sdk(), timeout=_FETCH_TIMEOUT_S)
        except Exception:
            logger.exception("Failed to fetch models from Claude Agent SDK, using fallback")
            return {"models": _FALLBACK_MODELS, "source": "fallback"}
        _cache = _ensure_default_first(models)
        _cache_at = time.monotonic()
        return {"models": _cache, "source": "sdk"}

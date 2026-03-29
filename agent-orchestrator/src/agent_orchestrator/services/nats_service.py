"""NATS pub/sub service for real-time event communication."""

import json
import logging
from typing import Any, Callable, Coroutine

import nats
from nats.aio.client import Client as NatsClient

logger = logging.getLogger(__name__)

_nc: NatsClient | None = None
_subscriptions: dict[str, Any] = {}


async def connect(url: str = "nats://localhost:4222") -> None:
    """Connect to NATS server."""
    global _nc
    if _nc is not None and _nc.is_connected:
        return
    _nc = await nats.connect(url)
    logger.info("Connected to NATS at %s", url)


async def disconnect() -> None:
    """Disconnect from NATS server."""
    global _nc
    if _nc is not None and _nc.is_connected:
        await _nc.drain()
        _nc = None
        _subscriptions.clear()
        logger.info("Disconnected from NATS")


async def publish(subject: str, data: dict) -> None:
    """Publish a JSON message to a NATS subject."""
    if _nc is None or not _nc.is_connected:
        logger.warning("NATS not connected, cannot publish to %s", subject)
        return
    payload = json.dumps(data).encode()
    await _nc.publish(subject, payload)


async def subscribe(
    subject: str,
    handler: Callable[[dict], Coroutine],
) -> None:
    """Subscribe to a NATS subject with a JSON message handler."""
    if _nc is None or not _nc.is_connected:
        logger.warning("NATS not connected, cannot subscribe to %s", subject)
        return

    async def _msg_handler(msg):
        try:
            data = json.loads(msg.data.decode())
            await handler(data)
        except Exception:
            logger.exception("Error handling message on %s", subject)

    sub = await _nc.subscribe(subject, cb=_msg_handler)
    _subscriptions[subject] = sub
    logger.info("Subscribed to %s", subject)


async def unsubscribe(subject: str) -> None:
    """Unsubscribe from a NATS subject."""
    sub = _subscriptions.pop(subject, None)
    if sub is not None:
        await sub.unsubscribe()


def is_connected() -> bool:
    """Check if NATS client is connected."""
    return _nc is not None and _nc.is_connected

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

from app.core.config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
KEEPALIVE_INTERVAL_S = 5.0

# Marks the end of the Deepgram stream so events() terminates deterministically
# instead of polling and racing trailing results.
_SENTINEL = object()


def build_deepgram_url() -> str:
    params = {
        "model": settings.deepgram_model,
        "encoding": "linear16",
        "sample_rate": "16000",
        "channels": "2",
        "multichannel": "true",
        "interim_results": "true",
        "smart_format": "true",
        "punctuate": "true",
        "endpointing": "400",
        "utterance_end_ms": "1500",
        "vad_events": "true",
    }
    return f"{DEEPGRAM_WS_URL}?" + "&".join(f"{k}={v}" for k, v in params.items())


class DeepgramMultichannelSession:
    """Bridge to Deepgram streaming with mic on channel 0 and tab audio on channel 1."""

    def __init__(self) -> None:
        self._ws: ClientConnection | None = None
        self._incoming: asyncio.Queue[Any] = asyncio.Queue()
        self._reader_task: asyncio.Task[None] | None = None
        self._keepalive_task: asyncio.Task[None] | None = None
        self._sending = False

    async def connect(self) -> None:
        headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
        self._ws = await websockets.connect(
            build_deepgram_url(), additional_headers=headers, max_size=2**23
        )
        self._sending = True
        self._reader_task = asyncio.create_task(self._read_loop())
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info("Deepgram stream opened (model=%s)", settings.deepgram_model)

    async def _read_loop(self) -> None:
        assert self._ws is not None
        try:
            async for message in self._ws:
                if isinstance(message, bytes):
                    continue
                await self._incoming.put(json.loads(message))
        except Exception as exc:
            logger.warning("Deepgram read loop ended: %s", exc)
            await self._incoming.put({"type": "Error", "message": str(exc)})
        finally:
            self._sending = False
            await self._incoming.put(_SENTINEL)

    async def _keepalive_loop(self) -> None:
        """Deepgram closes the socket after 10s without a frame (NET-0001)."""
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL_S)
            if not self._sending:
                return
            await self.send_keepalive()

    async def send_audio(self, data: bytes) -> None:
        if self._ws is None or not self._sending:
            return
        with contextlib.suppress(Exception):
            await self._ws.send(data)

    async def send_keepalive(self) -> None:
        if self._ws is None or not self._sending:
            return
        # Must be a text frame; binary KeepAlive is mishandled.
        with contextlib.suppress(Exception):
            await self._ws.send(json.dumps({"type": "KeepAlive"}))

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        while True:
            item = await self._incoming.get()
            if item is _SENTINEL:
                return
            yield item

    async def finish(self, timeout: float = 6.0) -> None:
        """Send CloseStream and let Deepgram flush trailing transcripts.

        Without this the tail of the final utterance is lost, because cancelling
        the reader discards results still in flight.
        """
        self._sending = False
        if self._keepalive_task is not None:
            self._keepalive_task.cancel()
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.send(json.dumps({"type": "CloseStream"}))
        if self._reader_task is not None:
            with contextlib.suppress(asyncio.TimeoutError, Exception):
                await asyncio.wait_for(asyncio.shield(self._reader_task), timeout)

    async def close(self) -> None:
        """Hard teardown; safe to call repeatedly and after finish()."""
        self._sending = False
        for task in (self._keepalive_task, self._reader_task):
            if task is not None:
                task.cancel()
        if self._ws is not None:
            with contextlib.suppress(Exception):
                await self._ws.close()
        for task in (self._keepalive_task, self._reader_task):
            if task is not None:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
        self._keepalive_task = None
        self._reader_task = None

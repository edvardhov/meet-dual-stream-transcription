from __future__ import annotations

import asyncio
import contextlib
import logging
import random
import time
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.models import SessionEventKind, SessionEventSource
from app.db.repository import QueuedWriter, SessionRepository
from app.db.session import SessionLocal
from app.schemas import ControlMessage, TranscriptEvent
from app.services.stt.deepgram_multichannel import DeepgramMultichannelSession
from app.services.transcript_assembler import TranscriptAssembler

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stream"])

MAX_STT_ATTEMPTS = 5


class ClientGone(Exception):
    """The extension side of the socket went away; never retry STT for this."""


async def _persist_final(session_id: UUID, event: TranscriptEvent) -> None:
    if not event.text:
        return
    async with SessionLocal() as db:
        repo = SessionRepository(db)
        await repo.add_utterance(
            session_id=session_id,
            channel=event.channel or 0,
            speaker=event.speaker or "Unknown",
            start_ms=event.start_ms or 0,
            end_ms=event.end_ms or 0,
            text=event.text,
            confidence=event.confidence,
        )


async def _persist_event(session_id: UUID, event: TranscriptEvent) -> None:
    async with SessionLocal() as db:
        repo = SessionRepository(db)
        await repo.add_event(
            session_id=session_id,
            at_ms=event.start_ms or 0,
            kind=event.event_kind or "unknown",
            source=event.event_source or SessionEventSource.SYSTEM.value,
        )


@router.websocket("/api/sessions/{session_id}/stream")
async def stream_session(session_id: UUID, websocket: WebSocket) -> None:
    await websocket.accept()

    assembler = TranscriptAssembler()
    writer = QueuedWriter()
    await writer.start()

    session_start = time.monotonic()
    timeline_offset_ms = 0
    client_connected = True

    def elapsed_ms() -> int:
        return int((time.monotonic() - session_start) * 1000) + timeline_offset_ms

    async def emit(event: TranscriptEvent) -> None:
        """Send to the client, tolerating a socket that has already closed."""
        nonlocal client_connected
        if not client_connected:
            return
        try:
            await websocket.send_json(event.model_dump(mode="json"))
        except Exception:
            client_connected = False

    async def dispatch(event: TranscriptEvent) -> None:
        await emit(event)
        if event.type == "final":
            await writer.enqueue(_persist_final, session_id, event)
        elif event.type == "session_event":
            await writer.enqueue(_persist_event, session_id, event)

    async def pump_deepgram(stt: DeepgramMultichannelSession) -> None:
        async for payload in stt.events():
            if payload.get("type") == "Error":
                await emit(TranscriptEvent(type="error", message=payload.get("message")))
                continue
            for event in assembler.handle_deepgram_message(payload):
                await dispatch(event)

    async def pump_client(stt: DeepgramMultichannelSession) -> None:
        """Forward audio and control frames until the client stops or vanishes."""
        while True:
            try:
                message = await websocket.receive()
            except (WebSocketDisconnect, RuntimeError) as exc:
                raise ClientGone from exc

            if message.get("type") == "websocket.disconnect":
                raise ClientGone

            data = message.get("bytes")
            if data is not None:
                await stt.send_audio(data)
                continue

            text = message.get("text")
            if text is None:
                continue

            control = ControlMessage.model_validate_json(text)
            if control.action in {"stop", "finalize"}:
                return
            at_ms = control.at_ms if control.at_ms is not None else elapsed_ms()
            for event in assembler.handle_control(control.action, at_ms):
                await dispatch(event)

    try:
        await emit(TranscriptEvent(type="connected"))
        attempts = 0

        while client_connected:
            stt = DeepgramMultichannelSession()
            try:
                await stt.connect()
                attempts = 0
                deepgram_task = asyncio.create_task(pump_deepgram(stt))
                try:
                    await pump_client(stt)
                except BaseException:
                    deepgram_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await deepgram_task
                    raise
                # Clean stop: flush trailing transcripts before tearing down,
                # otherwise the tail of the last utterance is lost.
                await stt.finish()
                with contextlib.suppress(asyncio.TimeoutError, Exception):
                    await asyncio.wait_for(deepgram_task, timeout=8.0)
                deepgram_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await deepgram_task
                break
            except ClientGone:
                client_connected = False
                break
            except Exception as exc:
                attempts += 1
                logger.warning("STT connection failed (attempt %s): %s", attempts, exc)
                if attempts >= MAX_STT_ATTEMPTS:
                    await emit(
                        TranscriptEvent(
                            type="error",
                            message=f"Speech-to-text unavailable after {attempts} attempts: {exc}",
                        )
                    )
                    break
                timeline_offset_ms = elapsed_ms()
                assembler.set_timeline_offset(timeline_offset_ms)
                await dispatch(
                    TranscriptEvent(
                        type="session_event",
                        event_kind=SessionEventKind.STT_RECONNECT.value,
                        event_source=SessionEventSource.SYSTEM.value,
                        start_ms=timeline_offset_ms,
                        end_ms=timeline_offset_ms,
                    )
                )
                await asyncio.sleep(random.uniform(0.5, 2.0) * attempts)
            finally:
                with contextlib.suppress(Exception):
                    await stt.close()
    finally:
        for event in assembler.flush_all():
            await dispatch(event)
        await emit(TranscriptEvent(type="disconnected"))
        await writer.drain()
        await writer.stop()
        if client_connected:
            with contextlib.suppress(Exception):
                await websocket.close()

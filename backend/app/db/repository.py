import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Session, SessionEvent, SessionStatus, Summary, Utterance

logger = logging.getLogger(__name__)


class SessionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_session(self, tab_title: str | None = None) -> Session:
        session = Session(tab_title=tab_title, status=SessionStatus.ACTIVE.value)
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_session(self, session_id: uuid.UUID) -> Session | None:
        return await self.db.get(Session, session_id)

    async def stop_session(self, session_id: uuid.UUID) -> None:
        session = await self.get_session(session_id)
        if session is None:
            return
        session.status = SessionStatus.STOPPED.value
        session.ended_at = datetime.now(UTC)
        await self.db.commit()

    async def add_utterance(
        self,
        session_id: uuid.UUID,
        channel: int,
        speaker: str,
        start_ms: int,
        end_ms: int,
        text: str,
        confidence: float | None,
    ) -> Utterance:
        utterance = Utterance(
            session_id=session_id,
            channel=channel,
            speaker=speaker,
            start_ms=start_ms,
            end_ms=end_ms,
            text=text,
            confidence=confidence,
        )
        self.db.add(utterance)
        await self.db.commit()
        await self.db.refresh(utterance)
        return utterance

    async def list_utterances(self, session_id: uuid.UUID) -> list[Utterance]:
        result = await self.db.execute(
            select(Utterance).where(Utterance.session_id == session_id).order_by(Utterance.start_ms)
        )
        return list(result.scalars().all())

    async def add_event(
        self,
        session_id: uuid.UUID,
        at_ms: int,
        kind: str,
        source: str,
    ) -> SessionEvent:
        event = SessionEvent(session_id=session_id, at_ms=at_ms, kind=kind, source=source)
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def list_events(self, session_id: uuid.UUID) -> list[SessionEvent]:
        result = await self.db.execute(
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.at_ms)
        )
        return list(result.scalars().all())

    async def get_summary_by_hash(
        self, session_id: uuid.UUID, transcript_hash: str
    ) -> Summary | None:
        result = await self.db.execute(
            select(Summary).where(
                Summary.session_id == session_id,
                Summary.transcript_hash == transcript_hash,
            )
        )
        return result.scalar_one_or_none()

    async def get_latest_summary(self, session_id: uuid.UUID) -> Summary | None:
        result = await self.db.execute(
            select(Summary)
            .where(Summary.session_id == session_id)
            .order_by(Summary.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def save_summary(
        self,
        session_id: uuid.UUID,
        transcript_hash: str,
        payload: dict[str, Any],
        model: str,
    ) -> Summary:
        summary = Summary(
            session_id=session_id,
            transcript_hash=transcript_hash,
            payload=payload,
            model=model,
        )
        self.db.add(summary)
        await self.db.commit()
        await self.db.refresh(summary)
        return summary


class QueuedWriter:
    """Drain DB writes from a background task so audio pump never stalls."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[
            tuple[Callable[..., Awaitable[None]], tuple[Any, ...], dict[str, Any]]
        ] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def drain(self) -> None:
        """Wait for queued writes to complete so nothing is lost on shutdown."""
        if self._task is None:
            return
        await self._queue.join()

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def enqueue(
        self, fn: Callable[..., Awaitable[None]], *args: Any, **kwargs: Any
    ) -> None:
        await self._queue.put((fn, args, kwargs))

    async def _run(self) -> None:
        while True:
            fn, args, kwargs = await self._queue.get()
            try:
                await fn(*args, **kwargs)
            except Exception:
                logger.exception("Queued DB write failed; transcript data may be lost")
            finally:
                self._queue.task_done()

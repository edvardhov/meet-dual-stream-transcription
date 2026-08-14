import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SessionStatus(StrEnum):
    ACTIVE = "active"
    STOPPED = "stopped"
    ERROR = "error"


class SessionEventKind(StrEnum):
    MIC_MUTED = "mic_muted"
    MIC_UNMUTED = "mic_unmuted"
    MEET_MUTED = "meet_muted"
    MEET_UNMUTED = "meet_unmuted"
    STT_RECONNECT = "stt_reconnect"


class SessionEventSource(StrEnum):
    EXTENSION = "extension"
    MEET_DOM = "meet_dom"
    SYSTEM = "system"


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tab_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SessionStatus.ACTIVE.value)

    utterances: Mapped[list["Utterance"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    summaries: Mapped[list["Summary"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    events: Mapped[list["SessionEvent"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class Utterance(Base):
    __tablename__ = "utterances"
    __table_args__ = (Index("ix_utterances_session_start", "session_id", "start_ms"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE")
    )
    channel: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String(64))
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[Session] = relationship(back_populates="utterances")


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE")
    )
    transcript_hash: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    model: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped[Session] = relationship(back_populates="summaries")


class SessionEvent(Base):
    __tablename__ = "session_events"
    __table_args__ = (Index("ix_session_events_session_at", "session_id", "at_ms"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE")
    )
    at_ms: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32))

    session: Mapped[Session] = relationship(back_populates="events")

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrmModel(BaseModel):
    """Base for responses built directly from SQLAlchemy instances."""

    model_config = ConfigDict(from_attributes=True)


class SessionCreate(BaseModel):
    tab_title: str | None = None


class SessionResponse(OrmModel):
    id: UUID
    tab_title: str | None
    started_at: datetime
    ended_at: datetime | None
    status: str


class UtteranceResponse(OrmModel):
    id: UUID
    channel: int
    speaker: str
    start_ms: int
    end_ms: int
    text: str
    confidence: float | None


class SessionEventResponse(OrmModel):
    id: UUID
    at_ms: int
    kind: str
    source: str


class TranscriptEvent(BaseModel):
    type: Literal[
        "interim",
        "final",
        "session_event",
        "error",
        "connected",
        "disconnected",
    ]
    channel: int | None = None
    speaker: str | None = None
    start_ms: int | None = None
    end_ms: int | None = None
    text: str | None = None
    confidence: float | None = None
    utterance_id: UUID | None = None
    event_kind: str | None = None
    event_source: str | None = None
    message: str | None = None


class ControlMessage(BaseModel):
    action: Literal["stop", "finalize", "mic_muted", "mic_unmuted", "meet_muted", "meet_unmuted"]
    at_ms: int | None = None


class ActionItem(BaseModel):
    owner: str
    task: str
    due: str | None = None


class SpeakerSummary(BaseModel):
    you: str
    others: str


class MeetingSummary(BaseModel):
    tldr: str
    key_points: list[str]
    decisions: list[str]
    action_items: list[ActionItem]
    open_questions: list[str]
    per_speaker_summary: SpeakerSummary


class SummaryResponse(BaseModel):
    id: UUID
    session_id: UUID
    transcript_hash: str
    payload: MeetingSummary
    model: str
    created_at: datetime


class SessionSnapshot(BaseModel):
    session: SessionResponse
    utterances: list[UtteranceResponse]
    events: list[SessionEventResponse]
    summary: SummaryResponse | None = None

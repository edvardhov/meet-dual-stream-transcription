from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Summary
from app.db.repository import SessionRepository
from app.db.session import get_db
from app.schemas import (
    MeetingSummary,
    SessionCreate,
    SessionEventResponse,
    SessionResponse,
    SessionSnapshot,
    SummaryResponse,
    UtteranceResponse,
)
from app.services.summarizer import SummarizationError, Summarizer

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def get_repo(db: Annotated[AsyncSession, Depends(get_db)]) -> SessionRepository:
    return SessionRepository(db)


Repo = Annotated[SessionRepository, Depends(get_repo)]


def _summary_response(session_id: UUID, saved: Summary) -> SummaryResponse:
    return SummaryResponse(
        id=saved.id,
        session_id=session_id,
        transcript_hash=saved.transcript_hash,
        payload=MeetingSummary.model_validate(saved.payload),
        model=saved.model,
        created_at=saved.created_at,
    )


async def _require_session(repo: SessionRepository, session_id: UUID) -> None:
    if await repo.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")


@router.post("", response_model=SessionResponse)
async def create_session(body: SessionCreate, repo: Repo) -> SessionResponse:
    session = await repo.create_session(tab_title=body.tab_title)
    return SessionResponse.model_validate(session)


@router.get("/{session_id}", response_model=SessionSnapshot)
async def get_session_snapshot(session_id: UUID, repo: Repo) -> SessionSnapshot:
    session = await repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    utterances = await repo.list_utterances(session_id)
    events = await repo.list_events(session_id)
    latest = await repo.get_latest_summary(session_id)
    return SessionSnapshot(
        session=SessionResponse.model_validate(session),
        utterances=[UtteranceResponse.model_validate(u) for u in utterances],
        events=[SessionEventResponse.model_validate(e) for e in events],
        summary=_summary_response(session_id, latest) if latest is not None else None,
    )


@router.post("/{session_id}/stop", response_model=SessionResponse)
async def stop_session(session_id: UUID, repo: Repo) -> SessionResponse:
    await _require_session(repo, session_id)
    await repo.stop_session(session_id)
    session = await repo.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse.model_validate(session)


@router.post("/{session_id}/summarize", response_model=SummaryResponse)
async def summarize_session(session_id: UUID, repo: Repo) -> SummaryResponse:
    await _require_session(repo, session_id)
    try:
        saved = await Summarizer().summarize(repo, session_id)
    except SummarizationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _summary_response(session_id, saved)

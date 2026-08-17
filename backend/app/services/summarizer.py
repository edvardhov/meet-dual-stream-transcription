from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from uuid import UUID

from google import genai
from google.genai import types

from app.core.config import settings
from app.db.models import SessionEvent, Summary, Utterance
from app.db.repository import SessionRepository
from app.schemas import MeetingSummary, SpeakerSummary

logger = logging.getLogger(__name__)

MAX_CHARS_PER_CHUNK = 12_000
MAX_LLM_ATTEMPTS = 4
MUTE_KINDS = {"mic_muted", "meet_muted"}
UNMUTE_KINDS = {"mic_unmuted", "meet_unmuted"}


class SummarizationError(RuntimeError):
    """The LLM could not produce a summary; surfaced to the caller as 503."""


def _format_ms(ms: int) -> str:
    seconds = max(0, ms // 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def build_transcript_text(utterances: list[Utterance], events: list[SessionEvent]) -> str:
    """Render speaker-labelled turns in timestamp order, with muted spans marked.

    Muted spans are explicit so the model does not read a gap in your channel as
    you having nothing to say.
    """
    timeline: list[tuple[int, str]] = [(u.start_ms, f"{u.speaker}: {u.text}") for u in utterances]

    muted_start: int | None = None
    for event in events:
        if event.kind in MUTE_KINDS and muted_start is None:
            muted_start = event.at_ms
        elif event.kind in UNMUTE_KINDS and muted_start is not None:
            timeline.append(
                (
                    muted_start,
                    f"[your microphone was muted from {_format_ms(muted_start)}"
                    f" to {_format_ms(event.at_ms)}]",
                )
            )
            muted_start = None
    if muted_start is not None:
        timeline.append(
            (muted_start, f"[your microphone was muted from {_format_ms(muted_start)} onwards]")
        )

    timeline.sort(key=lambda item: item[0])
    return "\n".join(line for _, line in timeline)


def transcript_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_transcript(text: str, max_chars: int = MAX_CHARS_PER_CHUNK) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for line in text.splitlines():
        if size + len(line) + 1 > max_chars and current:
            chunks.append("\n".join(current))
            current, size = [line], len(line)
        else:
            current.append(line)
            size += len(line) + 1
    if current:
        chunks.append("\n".join(current))
    return chunks


def _empty_summary() -> MeetingSummary:
    return MeetingSummary(
        tldr="No speech was captured in this session.",
        key_points=[],
        decisions=[],
        action_items=[],
        open_questions=[],
        per_speaker_summary=SpeakerSummary(you="No speech captured.", others="No speech captured."),
    )


class Summarizer:
    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def summarize(self, repo: SessionRepository, session_id: UUID) -> Summary:
        """Return the persisted summary row, reusing a cached one when unchanged."""
        utterances = await repo.list_utterances(session_id)
        events = await repo.list_events(session_id)
        transcript = build_transcript_text(utterances, events)
        digest = transcript_hash(transcript)

        cached = await repo.get_summary_by_hash(session_id, digest)
        if cached is not None:
            logger.info("Reusing cached summary for session %s", session_id)
            return cached

        if not transcript.strip():
            summary = _empty_summary()
        else:
            chunks = chunk_transcript(transcript)
            partials = [await self._generate(self._prompt(chunk)) for chunk in chunks]
            if len(partials) == 1:
                summary = partials[0]
            else:
                merged = json.dumps([p.model_dump() for p in partials], indent=2)
                summary = await self._generate(
                    "Merge these partial meeting summaries into a single coherent summary. "
                    "Preserve speaker attribution and do not invent content.\n\n" + merged
                )

        return await repo.save_summary(session_id, digest, summary.model_dump(), settings.llm_model)

    @staticmethod
    def _prompt(transcript: str) -> str:
        return (
            "Summarize this meeting transcript. Turns are labelled: 'You' is the local "
            "user's microphone, 'Meeting' is the other participants. Keep attribution "
            "accurate. If a span is marked as microphone muted, treat the local user's "
            "contribution there as unknown rather than absent.\n\n"
            f"{transcript}"
        )

    async def _generate(self, prompt: str) -> MeetingSummary:
        """Call Gemini with structured output, retrying transient overload errors."""
        last_error: Exception | None = None
        attempt = 0
        for attempt in range(1, MAX_LLM_ATTEMPTS + 1):
            try:
                response = await self.client.aio.models.generate_content(
                    model=settings.llm_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=MeetingSummary,
                        temperature=0.2,
                    ),
                )
            except Exception as exc:
                last_error = exc
                if not _is_transient(exc) or attempt == MAX_LLM_ATTEMPTS:
                    break
                delay = 1.5 * attempt
                logger.warning(
                    "Gemini transient error (attempt %s/%s), retrying in %.1fs: %s",
                    attempt,
                    MAX_LLM_ATTEMPTS,
                    delay,
                    str(exc)[:160],
                )
                await asyncio.sleep(delay)
                continue

            if response.parsed is not None:
                return MeetingSummary.model_validate(response.parsed)
            if response.text:
                return MeetingSummary.model_validate_json(response.text)
            last_error = SummarizationError("Gemini returned an empty response")
            break

        plural = "attempt" if attempt == 1 else "attempts"
        raise SummarizationError(
            f"Gemini ({settings.llm_model}) failed after {attempt} {plural}: {last_error}"
        ) from last_error


def _is_transient(exc: Exception) -> bool:
    text = str(exc)
    return any(
        marker in text for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500")
    )

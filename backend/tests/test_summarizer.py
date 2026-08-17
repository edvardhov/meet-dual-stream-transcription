import uuid

from app.db.models import SessionEvent, Utterance
from app.services.summarizer import (
    _is_transient,
    build_transcript_text,
    chunk_transcript,
    transcript_hash,
)


def test_transcript_hash_stable() -> None:
    assert transcript_hash("abc") == transcript_hash("abc")
    assert transcript_hash("abc") != transcript_hash("abcd")


def test_build_transcript_includes_mute_span() -> None:
    session_id = uuid.uuid4()
    utterances = [
        Utterance(
            id=uuid.uuid4(),
            session_id=session_id,
            channel=0,
            speaker="You",
            start_ms=0,
            end_ms=1000,
            text="Hello",
            confidence=0.9,
        )
    ]
    events = [
        SessionEvent(
            id=uuid.uuid4(), session_id=session_id, at_ms=2000, kind="mic_muted", source="extension"
        ),
        SessionEvent(
            id=uuid.uuid4(),
            session_id=session_id,
            at_ms=5000,
            kind="mic_unmuted",
            source="extension",
        ),
    ]
    text = build_transcript_text(utterances, events)
    assert "Hello" in text
    assert "microphone was muted" in text
    assert "00:02" in text and "00:05" in text


def test_unclosed_mute_span_marked_onwards() -> None:
    session_id = uuid.uuid4()
    events = [
        SessionEvent(
            id=uuid.uuid4(), session_id=session_id, at_ms=3000, kind="mic_muted", source="extension"
        )
    ]
    assert "onwards" in build_transcript_text([], events)


def test_transcript_ordered_across_channels() -> None:
    session_id = uuid.uuid4()

    def utterance(channel: int, speaker: str, start: int, text: str) -> Utterance:
        return Utterance(
            id=uuid.uuid4(),
            session_id=session_id,
            channel=channel,
            speaker=speaker,
            start_ms=start,
            end_ms=start + 500,
            text=text,
            confidence=1.0,
        )

    lines = build_transcript_text(
        [
            utterance(1, "Meeting", 2000, "second"),
            utterance(0, "You", 0, "first"),
            utterance(1, "Meeting", 4000, "third"),
        ],
        [],
    ).splitlines()
    assert lines == ["You: first", "Meeting: second", "Meeting: third"]


def test_chunk_transcript_splits_on_line_boundaries() -> None:
    text = "\n".join(f"Speaker: line {i}" for i in range(400))
    chunks = chunk_transcript(text, max_chars=500)
    assert len(chunks) > 1
    assert all(len(chunk) <= 500 for chunk in chunks)
    assert "\n".join(chunks) == text


def test_transient_error_classification() -> None:
    assert _is_transient(RuntimeError("503 UNAVAILABLE overloaded"))
    assert _is_transient(RuntimeError("429 RESOURCE_EXHAUSTED"))
    assert not _is_transient(RuntimeError("404 NOT_FOUND model retired"))
    assert not _is_transient(RuntimeError("400 INVALID_ARGUMENT"))

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from app.schemas import TranscriptEvent

SPEAKER_BY_CHANNEL = {0: "You", 1: "Meeting"}


@dataclass
class SealedUtterance:
    channel: int
    speaker: str
    start_ms: int
    end_ms: int
    text: str
    confidence: float | None
    utterance_id: UUID = field(default_factory=uuid4)


@dataclass
class ChannelAssembler:
    channel: int
    timeline_offset_ms: int = 0
    utterance_buffer: str = ""
    buffer_start_ms: int | None = None
    buffer_end_ms: int | None = None
    buffer_confidence: float | None = None
    interim_text: str = ""
    interim_start_ms: int | None = None
    interim_end_ms: int | None = None
    dormant: bool = False

    @property
    def speaker(self) -> str:
        return SPEAKER_BY_CHANNEL.get(self.channel, f"Channel {self.channel}")

    def _to_ms(self, seconds: float | int) -> int:
        """Deepgram word timings are seconds relative to the audio stream."""
        return int(float(seconds) * 1000) + self.timeline_offset_ms

    def handle_results(self, payload: dict[str, Any]) -> list[TranscriptEvent]:
        events: list[TranscriptEvent] = []
        if self.dormant:
            return events

        channel_data = payload.get("channel", {})
        alternatives = channel_data.get("alternatives", [])
        if not alternatives:
            return events

        alt = alternatives[0]
        transcript = (alt.get("transcript") or "").strip()
        confidence = alt.get("confidence")
        words = alt.get("words") or []
        start_ms = self._to_ms(words[0]["start"]) if words else self._to_ms(payload.get("start", 0))
        end_ms = self._to_ms(words[-1]["end"]) if words else start_ms

        is_final = payload.get("is_final", False)
        speech_final = payload.get("speech_final", False)

        if not transcript and not is_final:
            return events

        if not is_final:
            self.interim_text = transcript
            self.interim_start_ms = start_ms
            self.interim_end_ms = end_ms
            events.append(
                TranscriptEvent(
                    type="interim",
                    channel=self.channel,
                    speaker=self.speaker,
                    start_ms=start_ms,
                    end_ms=end_ms,
                    text=transcript,
                    confidence=confidence,
                )
            )
            return events

        if transcript:
            if not self.utterance_buffer:
                self.buffer_start_ms = start_ms
            self.utterance_buffer = (
                f"{self.utterance_buffer} {transcript}".strip()
                if self.utterance_buffer
                else transcript
            )
            self.buffer_end_ms = end_ms
            if confidence is not None:
                self.buffer_confidence = confidence

        self.interim_text = ""
        self.interim_start_ms = None
        self.interim_end_ms = None

        if speech_final and self.utterance_buffer:
            events.extend(self._seal())
        return events

    def handle_utterance_end(self, payload: dict[str, Any]) -> list[TranscriptEvent]:
        if self.dormant or not self.utterance_buffer:
            return []
        return self._seal()

    def handle_mic_muted(self, at_ms: int) -> list[TranscriptEvent]:
        self.dormant = True
        events = self._seal(force=True)
        events.append(
            TranscriptEvent(
                type="session_event",
                channel=self.channel,
                speaker=self.speaker,
                start_ms=at_ms,
                end_ms=at_ms,
                event_kind="mic_muted",
                event_source="extension",
            )
        )
        self.interim_text = ""
        return events

    def handle_mic_unmuted(self, at_ms: int) -> list[TranscriptEvent]:
        self.dormant = False
        return [
            TranscriptEvent(
                type="session_event",
                channel=self.channel,
                speaker=self.speaker,
                start_ms=at_ms,
                end_ms=at_ms,
                event_kind="mic_unmuted",
                event_source="extension",
            )
        ]

    def _seal(self, force: bool = False) -> list[TranscriptEvent]:
        if not self.utterance_buffer:
            return []
        utterance_id = uuid4()
        sealed = SealedUtterance(
            channel=self.channel,
            speaker=self.speaker,
            start_ms=self.buffer_start_ms or 0,
            end_ms=self.buffer_end_ms or self.buffer_start_ms or 0,
            text=self.utterance_buffer,
            confidence=self.buffer_confidence,
            utterance_id=utterance_id,
        )
        self.utterance_buffer = ""
        self.buffer_start_ms = None
        self.buffer_end_ms = None
        self.buffer_confidence = None
        return [
            TranscriptEvent(
                type="final",
                channel=sealed.channel,
                speaker=sealed.speaker,
                start_ms=sealed.start_ms,
                end_ms=sealed.end_ms,
                text=sealed.text,
                confidence=sealed.confidence,
                utterance_id=sealed.utterance_id,
            )
        ]


class TranscriptAssembler:
    def __init__(self) -> None:
        self.channels: dict[int, ChannelAssembler] = {
            0: ChannelAssembler(channel=0),
            1: ChannelAssembler(channel=1),
        }

    def set_timeline_offset(self, offset_ms: int) -> None:
        for assembler in self.channels.values():
            assembler.timeline_offset_ms = offset_ms

    def handle_deepgram_message(self, payload: dict[str, Any]) -> list[TranscriptEvent]:
        msg_type = payload.get("type")
        if msg_type == "Results":
            channel_index = payload.get("channel_index", [0, 2])
            channel = int(channel_index[0])
            assembler = self.channels.setdefault(channel, ChannelAssembler(channel=channel))
            return assembler.handle_results(payload)
        if msg_type == "UtteranceEnd":
            channel_index = payload.get("channel_index", [0, 2])
            channel = int(channel_index[0]) if isinstance(channel_index, list) else 0
            assembler = self.channels.setdefault(channel, ChannelAssembler(channel=channel))
            return assembler.handle_utterance_end(payload)
        return []

    def handle_control(self, action: str, at_ms: int) -> list[TranscriptEvent]:
        if action == "mic_muted":
            return self.channels[0].handle_mic_muted(at_ms)
        if action == "mic_unmuted":
            return self.channels[0].handle_mic_unmuted(at_ms)
        if action in {"meet_muted", "meet_unmuted"}:
            return [
                TranscriptEvent(
                    type="session_event",
                    channel=0,
                    speaker="You",
                    start_ms=at_ms,
                    end_ms=at_ms,
                    event_kind=action,
                    event_source="meet_dom",
                )
            ]
        return []

    def flush_all(self) -> list[TranscriptEvent]:
        events: list[TranscriptEvent] = []
        for assembler in self.channels.values():
            events.extend(assembler._seal(force=True))
        return events

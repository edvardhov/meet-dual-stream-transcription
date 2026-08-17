from app.services.transcript_assembler import TranscriptAssembler


def _results(
    channel: int, transcript: str, is_final: bool, speech_final: bool, start: float = 0.0
) -> dict:
    return {
        "type": "Results",
        "channel_index": [channel, 2],
        "start": start,
        "is_final": is_final,
        "speech_final": speech_final,
        "channel": {
            "alternatives": [
                {
                    "transcript": transcript,
                    "confidence": 0.95,
                    "words": [
                        {"word": "hello", "start": start, "end": start + 0.5, "confidence": 0.95},
                    ],
                }
            ]
        },
    }


def test_multiple_is_final_before_speech_final() -> None:
    assembler = TranscriptAssembler()
    events = assembler.handle_deepgram_message(_results(0, "thank you", True, False, 0.0))
    assert not any(e.type == "final" for e in events)
    events = assembler.handle_deepgram_message(_results(0, "for calling", True, True, 0.6))
    finals = [e for e in events if e.type == "final"]
    assert len(finals) == 1
    assert "thank you for calling" in finals[0].text


def test_mic_muted_seals_channel_zero_only() -> None:
    assembler = TranscriptAssembler()
    assembler.handle_deepgram_message(_results(0, "partial thought", False, False))
    assembler.handle_deepgram_message(_results(1, "remote speaking", False, False, 1.0))
    muted_events = assembler.handle_control("mic_muted", 1500)
    assert any(e.event_kind == "mic_muted" for e in muted_events)
    channel_one = assembler.handle_deepgram_message(_results(1, "still going", True, True, 2.0))
    assert any(e.type == "final" and e.channel == 1 for e in channel_one)


def test_reconnect_offset_applied() -> None:
    assembler = TranscriptAssembler()
    assembler.set_timeline_offset(5000)
    events = assembler.handle_deepgram_message(_results(0, "after reconnect", True, True, 1.0))
    assert events[0].start_ms == 6000


def test_seconds_converted_to_ms_for_long_meetings() -> None:
    """Deepgram timings are always seconds; a >10000s meeting must not collapse."""
    assembler = TranscriptAssembler()
    events = assembler.handle_deepgram_message(
        _results(1, "late in the call", True, True, 12_000.0)
    )
    assert events[0].start_ms == 12_000_000


def test_interim_then_final_replaces_not_appends() -> None:
    assembler = TranscriptAssembler()
    interim = assembler.handle_deepgram_message(_results(0, "partial", False, False))
    assert [e.type for e in interim] == ["interim"]
    final = assembler.handle_deepgram_message(_results(0, "partial complete", True, True))
    assert [e.type for e in final] == ["final"]


def test_utterance_end_seals_buffer() -> None:
    assembler = TranscriptAssembler()
    assembler.handle_deepgram_message(_results(1, "unclosed thought", True, False))
    events = assembler.handle_deepgram_message({"type": "UtteranceEnd", "channel_index": [1, 2]})
    assert [e.type for e in events] == ["final"]
    assert events[0].text == "unclosed thought"

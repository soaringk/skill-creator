from __future__ import annotations

from skill_creator_service.opencode import opencode_stream_event, parse_sse_event


def test_parse_sse_event_reads_json_data() -> None:
    event = parse_sse_event(['event: message.part.delta', 'data: {"type":"session.idle","properties":{"sessionID":"s1"}}'])

    assert event == {"type": "session.idle", "properties": {"sessionID": "s1"}}


def test_stream_event_forwards_delta_for_matching_session() -> None:
    forwarded = opencode_stream_event(
        {
            "type": "message.part.delta",
            "properties": {"sessionID": "s1", "delta": "hello"},
        },
        "s1",
        {},
    )

    assert forwarded == {"type": "delta", "text": "hello"}


def test_stream_event_ignores_other_sessions() -> None:
    forwarded = opencode_stream_event(
        {
            "type": "message.part.delta",
            "properties": {"sessionID": "other", "delta": "hello"},
        },
        "s1",
        {},
    )

    assert forwarded is None


def test_stream_event_deduplicates_full_part_updates() -> None:
    part_text: dict[str, str] = {}
    first = opencode_stream_event(
        {
            "type": "message.part.updated",
            "properties": {"part": {"id": "p1", "sessionID": "s1", "type": "text", "text": "hello"}},
        },
        "s1",
        part_text,
    )
    second = opencode_stream_event(
        {
            "type": "message.part.updated",
            "properties": {"part": {"id": "p1", "sessionID": "s1", "type": "text", "text": "hello world"}},
        },
        "s1",
        part_text,
    )

    assert first == {"type": "delta", "text": "hello"}
    assert second == {"type": "delta", "text": " world"}

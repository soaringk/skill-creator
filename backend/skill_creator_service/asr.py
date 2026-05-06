from __future__ import annotations

import queue
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    request_id: str | None = None


TranscriptEvent = dict[str, str | bool | None]


def _run(command: list[str], description: str) -> None:
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"{description} failed: missing executable {command[0]!r}") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() or "no stderr"
        raise RuntimeError(f"{description} failed: {stderr[-2000:]}") from exc


def normalize_to_wav(audio_path: Path, work_dir: Path) -> Path:
    output = work_dir / f"{audio_path.stem}_realtime_asr.wav"
    _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(audio_path),
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            str(output),
        ],
        "ffmpeg audio normalization",
    )
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError("ffmpeg produced an empty normalized audio file")
    return output


def transcribe_with_dashscope_realtime(
    audio_path: Path,
    *,
    api_key: str,
    model: str,
    websocket_url: str,
    chunk_size: int = 3200,
    chunk_delay_seconds: float = 0.1,
) -> TranscriptResult:
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is required for realtime ASR")

    try:
        import dashscope
        from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult
    except ImportError as exc:
        raise RuntimeError("dashscope package is required for realtime ASR") from exc

    final_sentences: list[str] = []
    latest_text = ""
    request_id: str | None = None

    class Callback(RecognitionCallback):
        def on_error(self, result: RecognitionResult) -> None:  # type: ignore[override]
            message = getattr(result, "message", "unknown DashScope ASR error")
            raise RuntimeError(str(message))

        def on_event(self, result: RecognitionResult) -> None:  # type: ignore[override]
            nonlocal latest_text, request_id
            request_id = result.get_request_id()
            sentence = result.get_sentence()
            text = sentence.get("text") if isinstance(sentence, dict) else None
            if not isinstance(text, str) or not text.strip():
                return
            latest_text = text.strip()
            if RecognitionResult.is_sentence_end(sentence):
                final_sentences.append(text.strip())

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = websocket_url

    with tempfile.TemporaryDirectory(prefix="skill_creator_asr_") as temp_dir:
        normalized = normalize_to_wav(audio_path, Path(temp_dir))
        recognition = Recognition(
            model=model,
            format="wav",
            sample_rate=16000,
            semantic_punctuation_enabled=False,
            callback=Callback(),
        )
        recognition.start()
        try:
            data = normalized.read_bytes()
            offset = 0
            while offset < len(data):
                chunk = data[offset : offset + chunk_size]
                recognition.send_audio_frame(chunk)
                offset += len(chunk)
                time.sleep(chunk_delay_seconds)
            recognition.stop()
        finally:
            duplex = getattr(recognition, "get_duplex_api", lambda: None)()
            if duplex is not None:
                duplex.close(1000, "bye")

    text = "\n".join(final_sentences).strip() or latest_text.strip()
    if not text:
        text = "[no speech detected]"
    return TranscriptResult(text=text, request_id=request_id)


def stream_transcribe_with_dashscope_realtime(
    audio_path: Path,
    *,
    api_key: str,
    model: str,
    websocket_url: str,
    chunk_size: int = 3200,
    chunk_delay_seconds: float = 0.1,
) -> Iterator[TranscriptEvent]:
    with tempfile.TemporaryDirectory(prefix="skill_creator_asr_") as temp_dir:
        normalized = normalize_to_wav(audio_path, Path(temp_dir))
        yield from stream_dashscope_pcm(
            normalized.read_bytes(),
            api_key=api_key,
            model=model,
            websocket_url=websocket_url,
            chunk_size=chunk_size,
            chunk_delay_seconds=chunk_delay_seconds,
        )


def stream_dashscope_pcm(
    audio: bytes,
    *,
    api_key: str,
    model: str,
    websocket_url: str,
    chunk_size: int = 3200,
    chunk_delay_seconds: float = 0.1,
) -> Iterator[TranscriptEvent]:
    events: queue.Queue[TranscriptEvent] = queue.Queue()
    recognition, close = start_dashscope_realtime(
        api_key=api_key,
        model=model,
        websocket_url=websocket_url,
        emit=events.put,
    )
    try:
        offset = 0
        while offset < len(audio):
            chunk = audio[offset : offset + chunk_size]
            recognition.send_audio_frame(chunk)
            offset += len(chunk)
            yield from drain_events(events)
            time.sleep(chunk_delay_seconds)
        recognition.stop()
        yield from drain_events(events, wait_seconds=1.0)
        yield {"type": "done"}
    finally:
        close()


def start_dashscope_realtime(
    *,
    api_key: str,
    model: str,
    websocket_url: str,
    emit: Callable[[TranscriptEvent], None],
    sample_rate: int = 16000,
    audio_format: str = "pcm",
):
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is required for realtime ASR")

    try:
        import dashscope
        from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult
    except ImportError as exc:
        raise RuntimeError("dashscope package is required for realtime ASR") from exc

    class Callback(RecognitionCallback):
        def on_error(self, result: RecognitionResult) -> None:  # type: ignore[override]
            message = getattr(result, "message", "unknown DashScope ASR error")
            emit({"type": "error", "message": str(message)})

        def on_event(self, result: RecognitionResult) -> None:  # type: ignore[override]
            sentence = result.get_sentence()
            text = sentence.get("text") if isinstance(sentence, dict) else None
            if not isinstance(text, str) or not text.strip():
                return
            emit(
                {
                    "type": "text",
                    "text": text.strip(),
                    "final": RecognitionResult.is_sentence_end(sentence),
                    "request_id": result.get_request_id(),
                }
            )

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = websocket_url
    recognition = Recognition(
        model=model,
        format=audio_format,
        sample_rate=sample_rate,
        semantic_punctuation_enabled=False,
        callback=Callback(),
    )
    recognition.start()

    def close() -> None:
        duplex = getattr(recognition, "get_duplex_api", lambda: None)()
        if duplex is not None:
            duplex.close(1000, "bye")

    return recognition, close


def drain_events(events: "queue.Queue[TranscriptEvent]", wait_seconds: float = 0) -> Iterator[TranscriptEvent]:
    if wait_seconds:
        deadline = time.monotonic() + wait_seconds
        while time.monotonic() < deadline:
            try:
                yield events.get(timeout=0.05)
            except queue.Empty:
                continue
    while True:
        try:
            yield events.get_nowait()
        except queue.Empty:
            break


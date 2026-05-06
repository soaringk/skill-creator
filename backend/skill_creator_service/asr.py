from __future__ import annotations

import os
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    request_id: str | None = None


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


def transcribe_with_dashscope_offline(
    audio_path: Path,
    *,
    api_key: str,
    model: str = "fun-asr",
) -> TranscriptResult:
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is required for ASR")

    try:
        import dashscope
        from dashscope.audio.asr import Transcription
    except ImportError as exc:
        raise RuntimeError("dashscope package is required for ASR") from exc

    import json
    import urllib.request
    from http import HTTPStatus

    dashscope.api_key = api_key

    # For local files, dashscope Python SDK transparently uploads to OSS if URI is file://
    file_url = f"file://{audio_path.absolute()}"

    task_response = Transcription.async_call(
        model=model,
        file_urls=[file_url],
    )

    if task_response.status_code != HTTPStatus.OK:
        msg = getattr(task_response, "message", "Unknown error")
        raise RuntimeError(f"Failed to submit transcription task: {msg}")

    task_id = task_response.output.task_id
    transcribe_response = Transcription.wait(task=task_id)

    if transcribe_response.status_code != HTTPStatus.OK:
        msg = getattr(transcribe_response, "message", "Unknown error")
        raise RuntimeError(f"Transcription task failed: {msg}")

    output = transcribe_response.output
    if output.task_status != "SUCCEEDED":
        raise RuntimeError(f"Transcription task ended with status {output.task_status}")

    results = output.results
    if not results:
        raise RuntimeError("No results returned from transcription task")

    result = results[0]
    if result.get("subtask_status") != "SUCCEEDED":
        msg = result.get("message", "Unknown subtask error")
        raise RuntimeError(f"Transcription subtask failed: {msg}")

    transcription_url = result.get("transcription_url")
    if not transcription_url:
        raise RuntimeError("Missing transcription_url in results")

    try:
        req = urllib.request.Request(transcription_url)
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Failed to download or parse transcription result: {exc}") from exc

    transcripts = data.get("transcripts", [])
    texts = []
    for t in transcripts:
        if "text" in t and t["text"].strip():
            texts.append(t["text"].strip())

    text = "\n".join(texts).strip()
    if not text:
        text = "[no speech detected]"

    return TranscriptResult(text=text, request_id=task_id)


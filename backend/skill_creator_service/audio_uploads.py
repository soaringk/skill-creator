from __future__ import annotations

import json
import subprocess
from pathlib import Path


ALLOWED_AUDIO_SUFFIXES = {
    ".aac",
    ".amr",
    ".flac",
    ".m4a",
    ".mp3",
    ".oga",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
}
MAX_AUDIO_BYTES = 100 * 1024 * 1024


class AudioUploadError(ValueError):
    pass


def validated_audio_suffix(filename: str | None, content_type: str | None, content: bytes) -> str:
    suffix = Path(filename or "").suffix.lower()
    media_type = (content_type or "").split(";", 1)[0].strip().lower()

    if not content:
        raise AudioUploadError("Audio file is empty.")
    if len(content) > MAX_AUDIO_BYTES:
        raise AudioUploadError("Audio file is too large.")
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise AudioUploadError("Only common audio file types are supported.")
    if not media_type.startswith("audio/"):
        raise AudioUploadError("Only audio uploads are allowed.")
    if not _looks_like_audio(content):
        raise AudioUploadError("Audio file is malformed or unsupported.")

    return suffix


def validate_audio_container(path: Path) -> None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise AudioUploadError("Audio validation requires ffprobe.") from exc
    except subprocess.CalledProcessError as exc:
        message = exc.stderr.strip() or "Audio file is malformed or unsupported."
        raise AudioUploadError(message[-500:]) from exc

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise AudioUploadError("Audio file metadata could not be read.") from exc

    streams = payload.get("streams")
    if not isinstance(streams, list) or not streams:
        raise AudioUploadError("Audio file has no readable streams.")
    stream_types = {stream.get("codec_type") for stream in streams if isinstance(stream, dict)}
    if "audio" not in stream_types:
        raise AudioUploadError("Audio file has no audio stream.")
    if stream_types != {"audio"}:
        raise AudioUploadError("Only audio-only files are allowed.")


def _looks_like_audio(content: bytes) -> bool:
    head = content[:64]
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return True
    if head.startswith(b"ID3"):
        return True
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return True
    if head.startswith(b"fLaC"):
        return True
    if head.startswith(b"OggS"):
        return True
    if head.startswith(b"\x1A\x45\xDF\xA3"):
        return True
    if head.startswith(b"#!AMR"):
        return True
    if len(head) >= 2 and head[0] == 0xFF and (head[1] in {0xF1, 0xF9}):
        return True
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return True
    return False

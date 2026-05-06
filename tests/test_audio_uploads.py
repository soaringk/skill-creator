from __future__ import annotations

import pytest

from skill_creator_service.audio_uploads import AudioUploadError, validate_audio_container, validated_audio_suffix


def test_accepts_audio_upload_with_audio_signature() -> None:
    content = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"fmt "

    suffix = validated_audio_suffix("sample.wav", "audio/wav", content)

    assert suffix == ".wav"


def test_rejects_video_upload_even_with_media_file_extension() -> None:
    content = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 16

    with pytest.raises(AudioUploadError):
        validated_audio_suffix("sample.mp4", "video/mp4", content)


def test_rejects_malformed_audio_upload() -> None:
    with pytest.raises(AudioUploadError):
        validated_audio_suffix("sample.mp3", "audio/mpeg", b"<script>alert(1)</script>")


def test_rejects_containers_with_video_streams(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    class Result:
        stdout = '{"streams":[{"codec_type":"audio"},{"codec_type":"video"}]}'

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: Result())

    with pytest.raises(AudioUploadError):
        validate_audio_container(tmp_path / "sample.m4a")


def test_accepts_audio_only_containers(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    class Result:
        stdout = '{"streams":[{"codec_type":"audio"}]}'

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: Result())

    validate_audio_container(tmp_path / "sample.wav")

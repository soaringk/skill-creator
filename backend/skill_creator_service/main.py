from __future__ import annotations

import json
import queue
import tempfile
from pathlib import Path
from typing import Any, Iterator

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .asr import drain_events, start_dashscope_realtime, stream_transcribe_with_dashscope_realtime
from .audio_uploads import AudioUploadError, validate_audio_container, validated_audio_suffix
from .config import load_settings
from .jobs import JobRunner, JobStore
from .models import CreateSkillRequest, JobRecord, TextMaterialRequest, UseSkillRequest
from .opencode import OpenCodeClient, OpenCodeConfig, draft_prompt
from .promotion import promote_skill, publishable_body
from .store import SkillStore, StoreError

settings = load_settings()
store = SkillStore(settings.context_root, settings.rules_root)
job_store = JobStore(settings.job_store_path)
job_runner = JobRunner(job_store)
opencode = OpenCodeClient(
    OpenCodeConfig(
        base_url=settings.opencode_base_url,
        username=settings.opencode_username,
        password=settings.opencode_password,
        directory=settings.opencode_directory,
        provider=settings.opencode_provider,
        model=settings.opencode_model,
    )
)

app = FastAPI(title="Skill Creator Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="SKILL_CREATOR_ADMIN_TOKEN is not configured")
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


def handle_store_error(exc: StoreError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def read_valid_audio_upload(file: UploadFile, content: bytes) -> tuple[bytes, str]:
    try:
        suffix = validated_audio_suffix(file.filename, file.content_type, content)
    except AudioUploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return content, suffix


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/skills")
def list_skills():
    return store.list_skills()


@app.post("/api/skills")
def create_skill(request: CreateSkillRequest):
    try:
        return store.create_skill(
            slug=request.slug,
            title=request.title,
            target_category=request.target_category,
            goal=request.goal,
            trigger_draft=request.trigger_draft,
            notes=request.notes,
        )
    except StoreError as exc:
        raise handle_store_error(exc) from exc


@app.get("/api/skills/{slug}")
def get_skill(slug: str):
    try:
        return store.get_skill(slug)
    except StoreError as exc:
        raise handle_store_error(exc) from exc


@app.post("/api/skills/{slug}/materials/text")
def add_text_material(slug: str, request: TextMaterialRequest):
    try:
        result = store.add_text_material(
            slug,
            text=request.text,
            confidence=request.confidence,
        )
        draft(slug)
        return result
    except StoreError as exc:
        raise handle_store_error(exc) from exc


@app.post("/api/asr/text-draft/stream")
async def transcribe_text_draft_stream(file: UploadFile = File(...)):
    content = await file.read()

    def events() -> Iterator[str]:
        try:
            yield from stream_uploaded_audio(file, content, prefix="skill_creator_text_stream_")
        except HTTPException as exc:
            yield json_line({"type": "error", "message": str(exc.detail)})

    return StreamingResponse(events(), media_type="application/x-ndjson")


@app.websocket("/api/asr/realtime")
async def transcribe_realtime_socket(websocket: WebSocket):
    await websocket.accept()
    try:
        events: queue.Queue[dict[str, str | bool | None]] = queue.Queue()
        recognition, close = start_dashscope_realtime(
            api_key=settings.dashscope_api_key,
            model=settings.dashscope_model,
            websocket_url=settings.dashscope_websocket_url,
            emit=events.put,
        )
        await websocket.send_json({"type": "status", "message": "正在识别"})
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    disconnected = False
    try:
        while True:
            message = await websocket.receive()
            if message.get("bytes") is not None:
                recognition.send_audio_frame(message["bytes"])
                for event in drain_events(events):
                    await websocket.send_json(event)
                continue
            if message.get("text") == "stop":
                break
    except WebSocketDisconnect:
        disconnected = True
        return
    finally:
        try:
            recognition.stop()
            if not disconnected:
                for event in drain_events(events, wait_seconds=1.0):
                    await websocket.send_json(event)
                await websocket.send_json({"type": "done"})
                await websocket.close()
        finally:
            close()


def stream_uploaded_audio(file: UploadFile, content: bytes, *, prefix: str) -> Iterator[str]:
    content, suffix = read_valid_audio_upload(file, content)
    with tempfile.NamedTemporaryFile(prefix=prefix, suffix=suffix, delete=True) as temp_file:
        temp_file.write(content)
        temp_file.flush()
        try:
            validate_audio_container(Path(temp_file.name))
            yield json_line({"type": "status", "message": "正在解析音频"})
            for event in stream_transcribe_with_dashscope_realtime(
                Path(temp_file.name),
                api_key=settings.dashscope_api_key,
                model=settings.dashscope_model,
                websocket_url=settings.dashscope_websocket_url,
            ):
                yield json_line(event)
        except AudioUploadError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc





@app.post("/api/skills/{slug}/draft")
def draft(slug: str):
    def task(job_id: str):
        session_id = opencode.create_session(f"Draft skill: {slug}")
        response = opencode.send_message(
            session_id,
            draft_prompt(slug, settings.context_root),
            agent="skill-builder",
        )
        return {"session_id": session_id, "response": response}

    return job_runner.enqueue(kind="draft", slug=slug, message="Draft requested", task=task)


@app.post("/api/skills/{slug}/promote", dependencies=[Depends(require_admin)])
def promote(slug: str):
    try:
        target = promote_skill(store, slug)
        return {"target": str(target)}
    except StoreError as exc:
        raise handle_store_error(exc) from exc


@app.post("/api/skills/{slug}/use/stream")
def use_skill_stream(slug: str, request: UseSkillRequest):
    session_id, prompt = prepare_skill_use(slug, request)

    def events() -> Iterator[str]:
        yield json_line({"type": "session", "session_id": session_id})
        try:
            for event in opencode.stream_message(
                session_id,
                prompt,
                agent="skill-use",
            ):
                yield json_line(event)
        except RuntimeError as exc:
            yield json_line({"type": "error", "message": str(exc)})

    return StreamingResponse(events(), media_type="application/x-ndjson")


def prepare_skill_use(slug: str, request: UseSkillRequest) -> tuple[str, str]:
    try:
        detail = store.get_skill(slug)
    except StoreError as exc:
        raise handle_store_error(exc) from exc

    source_text = publishable_body(detail.draft) if request.source == "draft" else _read_promoted_skill(slug)
    if not source_text.strip():
        raise HTTPException(status_code=400, detail="No skill text is available for use.")

    prompt = f"""Use the following skill in a read-only conversation.

Skill candidate: {slug}

--- SKILL TEXT START ---
{source_text}
--- SKILL TEXT END ---

User request:
{request.prompt}
"""
    session_id = opencode.create_session(f"Use skill: {slug}")
    return session_id, prompt


def json_line(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


@app.get("/api/jobs", response_model=list[JobRecord])
def list_jobs():
    return job_store.list()


@app.get("/api/jobs/{job_id}", response_model=JobRecord)
def get_job(job_id: str):
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    return job


def _read_promoted_skill(slug: str) -> str:
    for path in sorted(settings.rules_root.glob(f"*{slug}.md")):
        if path.is_file():
            return path.read_text(encoding="utf-8")
    return ""

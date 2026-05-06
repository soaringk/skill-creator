from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .asr import transcribe_with_dashscope_realtime
from .config import load_settings
from .jobs import JobRunner, JobStore
from .models import CreateSkillRequest, JobRecord, TextMaterialRequest, UseSkillRequest
from .opencode import OpenCodeClient, OpenCodeConfig, draft_prompt, propose_prompt
from .promotion import promote_skill
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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/skills")
def list_skills():
    return store.list_skills()


@app.post("/api/skills", dependencies=[Depends(require_admin)])
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


@app.post("/api/skills/{slug}/materials/text", dependencies=[Depends(require_admin)])
def add_text_material(slug: str, request: TextMaterialRequest):
    try:
        return store.add_text_material(
            slug,
            text=request.text,
            source_url=request.source_url,
            confidence=request.confidence,
            topics=request.topics,
        )
    except StoreError as exc:
        raise handle_store_error(exc) from exc


@app.post("/api/asr/text-draft", dependencies=[Depends(require_admin)])
async def transcribe_text_draft(file: UploadFile = File(...)):
    content = await file.read()
    suffix = Path(file.filename or "audio").suffix
    with tempfile.NamedTemporaryFile(prefix="skill_creator_text_draft_", suffix=suffix, delete=True) as temp_file:
        temp_file.write(content)
        temp_file.flush()
        result = transcribe_with_dashscope_realtime(
            Path(temp_file.name),
            api_key=settings.dashscope_api_key,
            model=settings.dashscope_model,
            websocket_url=settings.dashscope_websocket_url,
        )
    return {"text": result.text, "request_id": result.request_id}


@app.post("/api/skills/{slug}/materials/audio", dependencies=[Depends(require_admin)])
async def add_audio_material(slug: str, file: UploadFile = File(...)):
    try:
        content = await file.read()
        material = store.add_audio_material(slug, file.filename or "audio", content)
    except StoreError as exc:
        raise handle_store_error(exc) from exc

    def task(job_id: str):
        skill_dir = settings.context_root / slug
        source_file = material.source_file
        if not source_file:
            raise RuntimeError("Audio material has no source_file")
        try:
            audio_path = skill_dir / source_file
            result = transcribe_with_dashscope_realtime(
                audio_path,
                api_key=settings.dashscope_api_key,
                model=settings.dashscope_model,
                websocket_url=settings.dashscope_websocket_url,
            )
            transcript_file = store.write_transcript(
                slug,
                material.id,
                result.text,
                source_file=source_file,
                model=settings.dashscope_model,
            )
            store.update_audio_asr(slug, material.id, "done", transcript_file=transcript_file)
            return {"transcript_file": transcript_file, "request_id": result.request_id}
        except Exception as exc:
            store.update_audio_asr(slug, material.id, "failed", error_message=str(exc))
            raise

    job = job_runner.enqueue(
        kind="asr",
        slug=slug,
        message=f"Transcribing {material.id}",
        task=task,
    )
    return {"material": material, "job": job}


@app.post("/api/skills/{slug}/draft", dependencies=[Depends(require_admin)])
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


@app.post("/api/skills/{slug}/use", dependencies=[Depends(require_admin)])
def use_skill(slug: str, request: UseSkillRequest):
    try:
        detail = store.get_skill(slug)
    except StoreError as exc:
        raise handle_store_error(exc) from exc

    source_text = detail.draft if request.source == "draft" else _read_promoted_skill(slug)
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
    response = opencode.send_message(
        session_id,
        prompt,
        agent="skill-use",
        tools={
            "bash": False,
            "read": True,
            "grep": True,
            "glob": True,
            "list": True,
            "patch": False,
            "write": False,
            "edit": False,
            "webfetch": False,
            "web_search": False,
            "skill": False,
        },
    )
    return {"session_id": session_id, "response": response}


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

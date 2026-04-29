from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed"]


class SkillSummary(BaseModel):
    slug: str
    title: str
    status: str
    target_category: str | None = None
    material_count: int = 0
    usable_material_count: int = 0
    readiness: float = 0.0
    updated_at: str | None = None


class MaterialSummary(BaseModel):
    id: str
    type: str
    status: str
    path: str
    uploaded_at: str | None = None
    source_file: str | None = None
    asr: dict[str, Any] = Field(default_factory=dict)


class SkillDetail(BaseModel):
    summary: SkillSummary
    index_body: str
    materials: list[MaterialSummary]
    draft: str
    proposal: str


class CreateSkillRequest(BaseModel):
    slug: str
    title: str
    target_category: str = "Workflow"
    goal: str = ""
    trigger_draft: str = ""
    notes: str = ""


class TextMaterialRequest(BaseModel):
    text: str
    source_url: str | None = None
    confidence: str = "medium"
    topics: list[str] = Field(default_factory=list)


class JobRecord(BaseModel):
    id: str
    kind: str
    slug: str | None = None
    status: JobStatus
    created_at: str
    updated_at: str
    message: str = ""
    result: dict[str, Any] = Field(default_factory=dict)


class UseSkillRequest(BaseModel):
    prompt: str
    source: Literal["promoted", "draft"] = "promoted"

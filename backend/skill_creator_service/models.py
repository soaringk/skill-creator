from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "running", "completed", "failed"]


class SkillSummary(BaseModel):
    slug: str
    title: str
    status: str
    target_category: str | None = None
    output_language: str | None = None
    updated_at: str | None = None
    rules_target: str | None = None


class MaterialSummary(BaseModel):
    id: str
    type: str
    path: str
    uploaded_at: str | None = None
    content: str = ""


class SkillDetail(BaseModel):
    summary: SkillSummary
    index_body: str
    materials: list[MaterialSummary]
    draft: str
    promoted: str | None = None


class CreateSkillRequest(BaseModel):
    slug: str
    title: str
    target_category: str = "Workflow"
    output_language: str = "中文"
    goal: str = ""
    trigger_draft: str = ""
    notes: str = ""


class TextMaterialRequest(BaseModel):
    text: str
    confidence: str = "medium"


class PolishTextRequest(BaseModel):
    text: str


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

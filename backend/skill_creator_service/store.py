from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from .frontmatter import dump_markdown, parse_markdown
from .models import MaterialSummary, SkillDetail, SkillSummary

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


class StoreError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def compact_day() -> str:
    return datetime.now().strftime("%Y%m%d")


def validate_slug(slug: str) -> str:
    if not SLUG_PATTERN.fullmatch(slug) or slug == "_template":
        raise StoreError("Invalid skill slug. Use lowercase letters, digits, hyphens, or underscores.")
    return slug


def material_id() -> str:
    return f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid4().hex[:8]}"


def safe_filename(filename: str) -> str:
    name = Path(filename).name.strip() or "upload"
    sanitized = SAFE_FILENAME_PATTERN.sub("_", name)
    return sanitized[:160] or "upload"


class SkillStore:
    def __init__(self, context_root: Path, rules_root: Path):
        self.context_root = context_root
        self.rules_root = rules_root

    def _skill_dir(self, slug: str) -> Path:
        return self.context_root / validate_slug(slug)

    def _relative(self, path: Path) -> str:
        return str(path.relative_to(self.context_root))

    def _read_doc(self, path: Path) -> tuple[dict[str, Any], str]:
        if not path.exists():
            return {}, ""
        doc = parse_markdown(path.read_text(encoding="utf-8"))
        return doc.frontmatter, doc.body

    def _write_doc(self, path: Path, frontmatter: dict[str, Any], body: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(dump_markdown(frontmatter, body), encoding="utf-8")

    def _load_summary(self, skill_dir: Path) -> SkillSummary | None:
        index_path = skill_dir / "index.md"
        if not index_path.exists():
            return None
        frontmatter, _ = self._read_doc(index_path)
        slug = str(frontmatter.get("slug") or skill_dir.name)
        return SkillSummary(
            slug=slug,
            title=str(frontmatter.get("title") or slug),
            status=str(frontmatter.get("status") or "unknown"),
            target_category=frontmatter.get("target_category"),
            updated_at=str(frontmatter.get("updated_at") or "") or None,
            rules_target=frontmatter.get("rules_target"),
        )

    def list_skills(self) -> list[SkillSummary]:
        if not self.context_root.exists():
            return []
        summaries = []
        for skill_dir in sorted(self.context_root.iterdir()):
            if not skill_dir.is_dir() or skill_dir.name.startswith("_"):
                continue
            summary = self._load_summary(skill_dir)
            if summary:
                summaries.append(summary)
        return summaries

    def create_skill(
        self,
        slug: str,
        title: str,
        target_category: str,
        goal: str,
        trigger_draft: str,
        notes: str,
    ) -> SkillSummary:
        skill_dir = self._skill_dir(slug)
        if skill_dir.exists():
            raise StoreError(f"Skill candidate already exists: {slug}")
        template = self.context_root / "_template"
        if not template.exists():
            raise StoreError(f"Missing template directory: {template}")
        shutil.copytree(template, skill_dir)
        for placeholder in (skill_dir / "materials").rglob("example_*.md"):
            placeholder.unlink()

        now = utc_now()
        body = "\n".join(
            [
                f"# {title}",
                "",
                "## Goal",
                "",
                goal,
                "",
                "## Trigger Draft",
                "",
                trigger_draft,
                "",
                "## Notes",
                "",
                notes,
                "",
            ]
        )
        frontmatter = {
            "slug": slug,
            "title": title,
            "status": "collecting",
            "target_category": target_category,
            "rules_target": None,
            "created_at": now,
            "updated_at": now,
        }
        self._write_doc(skill_dir / "index.md", frontmatter, body)
        summary = self._load_summary(skill_dir)
        if not summary:
            raise StoreError("Skill candidate was created but index could not be read.")
        return summary

    def get_skill(self, slug: str) -> SkillDetail:
        skill_dir = self._skill_dir(slug)
        if not skill_dir.exists():
            raise StoreError(f"Unknown skill candidate: {slug}")
        summary = self._load_summary(skill_dir)
        if not summary:
            raise StoreError(f"Missing index.md for skill candidate: {slug}")
        _, index_body = self._read_doc(skill_dir / "index.md")
        _, draft = self._read_doc(skill_dir / "draft.md")
        
        # Prefer published.md for promoted status tracking
        published_fm, promoted_body = self._read_doc(skill_dir / "published.md")
        rules_target = published_fm.get("rules_target") or summary.rules_target
        
        promoted = None
        if rules_target:
            target_path = Path(rules_target)
            if target_path.exists():
                promoted = target_path.read_text(encoding="utf-8")
            elif promoted_body.strip():
                # Fallback to local snapshot if target is missing but snapshot exists
                promoted = promoted_body

        return SkillDetail(
            summary=summary,
            index_body=index_body,
            materials=self.list_materials(slug),
            draft=draft,
            promoted=promoted,
        )

    def list_materials(self, slug: str) -> list[MaterialSummary]:
        skill_dir = self._skill_dir(slug)
        material_root = skill_dir / "materials"
        if not material_root.exists():
            return []
        materials = []
        for path in sorted(material_root.rglob("*.md")):
            if path.name.startswith("."):
                continue
            frontmatter, body = self._read_doc(path)
            if not frontmatter:
                continue
            materials.append(
                MaterialSummary(
                    id=str(frontmatter.get("id") or path.stem),
                    type=str(frontmatter.get("type") or path.parent.name),
                    path=self._relative(path),
                    uploaded_at=str(frontmatter.get("uploaded_at") or "") or None,
                    content=body.strip(),
                )
            )
        return materials

    def add_text_material(
        self,
        slug: str,
        text: str,
        confidence: str,
    ) -> MaterialSummary:
        skill_dir = self._skill_dir(slug)
        if not skill_dir.exists():
            raise StoreError(f"Unknown skill candidate: {slug}")
        mid = material_id()
        path = skill_dir / "materials" / f"{mid}.md"
        frontmatter = {
            "id": mid,
            "type": "text",
            "uploaded_at": utc_now(),
            "confidence": confidence,
        }
        self._write_doc(path, frontmatter, text.strip() + "\n")
        self.touch_index(slug)
        return self._material_from_path(path)



    def touch_index(self, slug: str) -> None:
        skill_dir = self._skill_dir(slug)
        index_path = skill_dir / "index.md"
        frontmatter, body = self._read_doc(index_path)
        if not frontmatter:
            return
        frontmatter["updated_at"] = utc_now()
        self._write_doc(index_path, frontmatter, body)

    def set_index_status(self, slug: str, status: str, **updates: Any) -> None:
        index_path = self._skill_dir(slug) / "index.md"
        frontmatter, body = self._read_doc(index_path)
        if not frontmatter:
            raise StoreError(f"Missing index.md for skill candidate: {slug}")
        frontmatter["status"] = status
        frontmatter["updated_at"] = utc_now()
        frontmatter.update(updates)
        self._write_doc(index_path, frontmatter, body)

    def _material_from_path(self, path: Path) -> MaterialSummary:
        frontmatter, body = self._read_doc(path)
        return MaterialSummary(
            id=str(frontmatter.get("id") or path.stem),
            type=str(frontmatter.get("type") or path.parent.name),
            path=self._relative(path),
            uploaded_at=str(frontmatter.get("uploaded_at") or "") or None,
            content=body.strip(),
        )

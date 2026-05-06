from __future__ import annotations

from pathlib import Path

from .frontmatter import dump_markdown, parse_markdown
from .store import SkillStore, StoreError, utc_now, validate_slug


def _target_name(category: str | None, slug: str) -> str:
    normalized_category = (category or "workflow").lower()
    if slug.startswith(f"{normalized_category}_"):
        return f"{slug}.md"
    return f"{normalized_category}_{slug}.md"


def promote_skill(store: SkillStore, slug: str) -> Path:
    slug = validate_slug(slug)
    detail = store.get_skill(slug)
    skill_dir = store.context_root / slug

    draft_path = skill_dir / "draft.md"
    draft_doc = parse_markdown(draft_path.read_text(encoding="utf-8"))
    if draft_doc.frontmatter.get("status") == "empty" or not draft_doc.body.strip():
        raise StoreError("Cannot promote an empty draft.")

    target = store.rules_root / _target_name(detail.summary.target_category, slug)
    if target.exists():
        raise StoreError(f"Promotion target already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(draft_doc.body.lstrip(), encoding="utf-8")

    index_path = store.rules_root / "INDEX.md"
    if index_path.exists():
        index_text = index_path.read_text(encoding="utf-8")
        title = detail.summary.title
        entry = f"- [{title}](./{target.name}) - Promoted from skill creator candidate `{slug}`\n"
        if target.name not in index_text:
            index_path.write_text(index_text.rstrip() + "\n" + entry, encoding="utf-8")

    published_path = skill_dir / "published.md"
    self_frontmatter = {
        "status": "promoted",
        "rules_target": str(target),
        "promoted_at": utc_now()
    }
    published_path.write_text(dump_markdown(self_frontmatter, draft_doc.body), encoding="utf-8")

    store.set_index_status(slug, "promoted", rules_target=str(target))
    return target

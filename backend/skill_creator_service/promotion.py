from __future__ import annotations

import re
from pathlib import Path

from .frontmatter import dump_markdown, parse_markdown
from .store import SkillStore, StoreError, utc_now, validate_slug

PUBLISHABLE_HEADING = "Publishable Skill"
REVIEW_HEADINGS = {"draft review", "material coverage", "refinement notes"}


def _target_name(category: str | None, slug: str) -> str:
    normalized_category = (category or "workflow").lower()
    if slug.startswith(f"{normalized_category}_"):
        return f"{slug}.md"
    return f"{normalized_category}_{slug}.md"


def _heading_pattern(heading: str) -> re.Pattern[str]:
    return re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.IGNORECASE | re.MULTILINE)


def _section_start(text: str, heading: str, start: int) -> int:
    match = _heading_pattern(heading).search(text, start)
    if not match:
        return len(text)
    return match.start()


def publishable_body(draft_body: str) -> str:
    publishable_match = _heading_pattern(PUBLISHABLE_HEADING).search(draft_body)
    if publishable_match:
        section_start = publishable_match.end()
        section_end = _section_start(draft_body, "Draft Review", section_start)
        return draft_body[section_start:section_end].strip() + "\n"

    lines = draft_body.splitlines()
    kept: list[str] = []
    skipping = False
    for line in lines:
        h2_match = re.match(r"^##\s+(.+?)\s*$", line)
        if h2_match:
            skipping = h2_match.group(1).strip().lower() in REVIEW_HEADINGS
        if not skipping:
            kept.append(line)
    return "\n".join(kept).strip() + "\n"


def promote_skill(store: SkillStore, slug: str) -> Path:
    slug = validate_slug(slug)
    detail = store.get_skill(slug)
    skill_dir = store.context_root / slug

    draft_path = skill_dir / "draft.md"
    draft_doc = parse_markdown(draft_path.read_text(encoding="utf-8"))
    promoted_body = publishable_body(draft_doc.body)
    if draft_doc.frontmatter.get("status") == "empty" or not promoted_body.strip():
        raise StoreError("Cannot promote an empty draft.")

    target = store.rules_root / _target_name(detail.summary.target_category, slug)
    if target.exists():
        raise StoreError(f"Promotion target already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(promoted_body.lstrip(), encoding="utf-8")

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
        "promoted_at": utc_now(),
    }
    published_path.write_text(dump_markdown(self_frontmatter, promoted_body), encoding="utf-8")

    store.set_index_status(slug, "promoted", rules_target=str(target))
    return target

from __future__ import annotations

from pathlib import Path

import pytest

from skill_creator_service.frontmatter import dump_markdown, parse_markdown
from skill_creator_service.promotion import promote_skill, publishable_body
from skill_creator_service.store import SkillStore, StoreError


def make_context(root: Path) -> None:
    template = root / "contexts" / "skill_creator" / "_template"
    (template / "materials").mkdir(parents=True, exist_ok=True)
    (template / "index.md").write_text(
        dump_markdown(
            {
                "slug": None,
                "title": None,
                "status": "collecting",
                "target_category": "Workflow",
                "output_language": "中文",
            },
            "# Candidate Skill\n",
        ),
        encoding="utf-8",
    )
    (template / "draft.md").write_text(
        dump_markdown({"status": "empty", "generated_at": None, "source_materials": []}, "# Publishable Skill\n"),
        encoding="utf-8",
    )
    (template / "published.md").write_text(
        dump_markdown({"status": "empty", "rules_target": None}, ""),
        encoding="utf-8",
    )


def test_create_skill_and_add_text_material(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")

    summary = store.create_skill(
        "demo_skill",
        "Demo Skill",
        "Workflow",
        "中文",
        "Collect examples.",
        "Use on demo requests.",
        "No notes.",
    )
    material = store.add_text_material("demo_skill", "Example material", "medium")
    detail = store.get_skill("demo_skill")

    assert summary.slug == "demo_skill"
    assert summary.output_language == "中文"
    assert material.type == "text"
    assert len(detail.materials) == 1
    skill_dir = tmp_path / "contexts" / "skill_creator" / "demo_skill"
    material_doc = parse_markdown(next((skill_dir / "materials").glob("*.md")).read_text(encoding="utf-8"))
    assert set(material_doc.frontmatter) == {"id", "type", "uploaded_at", "confidence"}
    index_doc = parse_markdown((skill_dir / "index.md").read_text(encoding="utf-8"))
    assert index_doc.frontmatter["output_language"] == "中文"


def test_rejects_bad_slug(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")

    with pytest.raises(StoreError):
        store.create_skill("../bad", "Bad", "Workflow", "中文", "", "", "")


def test_promote_rejects_empty_draft(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")
    store.create_skill("demo_skill", "Demo Skill", "Workflow", "中文", "", "", "")

    with pytest.raises(StoreError):
        promote_skill(store, "demo_skill")


def test_promote_writes_only_publishable_section(tmp_path: Path) -> None:
    make_context(tmp_path)
    rules_root = tmp_path / "rules" / "skills"
    rules_root.mkdir(parents=True)
    (rules_root / "INDEX.md").write_text("# Skills Index\n", encoding="utf-8")
    store = SkillStore(tmp_path / "contexts" / "skill_creator", rules_root)
    store.create_skill("demo_skill", "Demo Skill", "Workflow", "中文", "", "", "")
    skill_dir = tmp_path / "contexts" / "skill_creator" / "demo_skill"
    (skill_dir / "draft.md").write_text(
        dump_markdown(
            {"status": "drafted"},
            """# Publishable Skill

## When to Use

Use it.

# Draft Review

## Material Coverage

- `example.md`: shaped the trigger.

## Refinement Notes

- Add more examples.
""",
        ),
        encoding="utf-8",
    )

    target = promote_skill(store, "demo_skill")

    assert target == rules_root / "workflow_demo_skill.md"
    target_text = target.read_text(encoding="utf-8")
    assert target_text.startswith("## When to Use")
    assert "Use it." in target_text
    assert "Material Coverage" not in target_text
    assert "Refinement Notes" not in target_text
    assert "workflow_demo_skill.md" in (rules_root / "INDEX.md").read_text(encoding="utf-8")
    published_doc = parse_markdown((skill_dir / "published.md").read_text(encoding="utf-8"))
    assert "Material Coverage" not in published_doc.body
    index_doc = parse_markdown((skill_dir / "index.md").read_text(encoding="utf-8"))
    assert index_doc.frontmatter["status"] == "promoted"


def test_publishable_body_strips_legacy_review_sections() -> None:
    body = """# Demo Skill

## When to Use

Use it.

## Material Coverage

Internal notes.

## Refinement Notes

More internal notes.
"""

    result = publishable_body(body)

    assert "## When to Use" in result
    assert "Material Coverage" not in result
    assert "Refinement Notes" not in result

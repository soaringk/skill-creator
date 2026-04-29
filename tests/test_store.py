from __future__ import annotations

from pathlib import Path

import pytest

from skill_creator_service.frontmatter import dump_markdown, parse_markdown
from skill_creator_service.promotion import promote_skill
from skill_creator_service.store import SkillStore, StoreError


def make_context(root: Path) -> None:
    template = root / "contexts" / "skill_creator" / "_template"
    for path in [
        template / "materials" / "text",
        template / "materials" / "audio" / "uploads",
        template / "materials" / "transcripts",
    ]:
        path.mkdir(parents=True, exist_ok=True)
    (template / "index.md").write_text(
        dump_markdown(
            {
                "slug": None,
                "title": None,
                "status": "collecting",
                "target_category": "Workflow",
                "material_count": 0,
                "usable_material_count": 0,
                "readiness": 0.0,
            },
            "# Candidate Skill\n",
        ),
        encoding="utf-8",
    )
    (template / "draft.md").write_text(
        dump_markdown({"status": "empty", "generated_at": None, "source_materials": []}, "# Draft Skill\n"),
        encoding="utf-8",
    )
    (template / "proposal.md").write_text(
        dump_markdown({"status": "empty", "decision": "pending"}, "# Promotion Proposal\n"),
        encoding="utf-8",
    )


def test_create_skill_and_add_text_material(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")

    summary = store.create_skill(
        "demo_skill",
        "Demo Skill",
        "Workflow",
        "Collect examples.",
        "Use on demo requests.",
        "No notes.",
    )
    material = store.add_text_material("demo_skill", "Example material", None, "medium", [])
    detail = store.get_skill("demo_skill")

    assert summary.slug == "demo_skill"
    assert material.status == "usable"
    assert detail.summary.material_count == 1
    assert detail.summary.usable_material_count == 1
    assert detail.summary.readiness == 0.5


def test_rejects_bad_slug(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")

    with pytest.raises(StoreError):
        store.create_skill("../bad", "Bad", "Workflow", "", "", "")


def test_promote_requires_approval(tmp_path: Path) -> None:
    make_context(tmp_path)
    store = SkillStore(tmp_path / "contexts" / "skill_creator", tmp_path / "rules" / "skills")
    store.create_skill("demo_skill", "Demo Skill", "Workflow", "", "", "")
    skill_dir = tmp_path / "contexts" / "skill_creator" / "demo_skill"
    (skill_dir / "draft.md").write_text(
        dump_markdown({"status": "drafted"}, "# Demo Skill\n\n## When to Use\n\nUse it.\n"),
        encoding="utf-8",
    )

    with pytest.raises(StoreError):
        promote_skill(store, "demo_skill")


def test_promote_writes_rules_skill_after_approval(tmp_path: Path) -> None:
    make_context(tmp_path)
    rules_root = tmp_path / "rules" / "skills"
    rules_root.mkdir(parents=True)
    (rules_root / "INDEX.md").write_text("# Skills Index\n", encoding="utf-8")
    store = SkillStore(tmp_path / "contexts" / "skill_creator", rules_root)
    store.create_skill("demo_skill", "Demo Skill", "Workflow", "", "", "")
    skill_dir = tmp_path / "contexts" / "skill_creator" / "demo_skill"
    (skill_dir / "draft.md").write_text(
        dump_markdown({"status": "drafted"}, "# Demo Skill\n\n## When to Use\n\nUse it.\n"),
        encoding="utf-8",
    )
    (skill_dir / "proposal.md").write_text(
        dump_markdown({"status": "proposed", "decision": "approved"}, "# Proposal\n"),
        encoding="utf-8",
    )

    target = promote_skill(store, "demo_skill")

    assert target == rules_root / "workflow_demo_skill.md"
    assert target.read_text(encoding="utf-8").startswith("# Demo Skill")
    assert "workflow_demo_skill.md" in (rules_root / "INDEX.md").read_text(encoding="utf-8")
    index_doc = parse_markdown((skill_dir / "index.md").read_text(encoding="utf-8"))
    assert index_doc.frontmatter["status"] == "promoted"

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import yaml


@dataclass(frozen=True)
class MarkdownDocument:
    frontmatter: dict[str, Any]
    body: str


def parse_markdown(text: str) -> MarkdownDocument:
    if not text.startswith("---\n"):
        return MarkdownDocument({}, text)

    end = text.find("\n---", 4)
    if end == -1:
        return MarkdownDocument({}, text)

    raw_frontmatter = text[4:end]
    body_start = end + len("\n---")
    if text[body_start : body_start + 2] == "\n\n":
        body_start += 2
    elif text[body_start : body_start + 1] == "\n":
        body_start += 1
    parsed = yaml.safe_load(raw_frontmatter) or {}
    if not isinstance(parsed, dict):
        parsed = {}
    return MarkdownDocument(parsed, text[body_start:])


def dump_markdown(frontmatter: dict[str, Any], body: str) -> str:
    frontmatter_text = yaml.safe_dump(
        frontmatter,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    ).strip()
    body_text = body.lstrip("\n")
    return f"---\n{frontmatter_text}\n---\n\n{body_text}"

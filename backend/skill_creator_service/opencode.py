from __future__ import annotations

import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


@dataclass(frozen=True)
class OpenCodeConfig:
    base_url: str
    username: str
    password: str
    directory: Path
    provider: str
    model: str


class OpenCodeClient:
    def __init__(self, config: OpenCodeConfig):
        self.config = config

    def _headers(self) -> dict[str, str]:
        if not self.config.password:
            return {}
        token = base64.b64encode(f"{self.config.username}:{self.config.password}".encode()).decode()
        return {"Authorization": f"Basic {token}"}

    def _params(self) -> dict[str, str]:
        return {"directory": str(self.config.directory)}

    def create_session(self, title: str) -> str:
        try:
            with httpx.Client(timeout=30) as client:
                response = client.post(
                    f"{self.config.base_url}/session",
                    headers=self._headers(),
                    params=self._params(),
                    json={"title": title},
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.RequestError as exc:
            raise RuntimeError(f"OpenCode server unavailable at {self.config.base_url}: {exc}") from exc
        session_id = payload.get("id")
        if not isinstance(session_id, str):
            raise RuntimeError(f"OpenCode create session response had no id: {payload}")
        return session_id

    def send_message(
        self,
        session_id: str,
        prompt: str,
        *,
        agent: str,
        tools: dict[str, bool] | None = None,
        timeout_seconds: int = 3600,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "parts": [{"type": "text", "text": prompt}],
            "agent": agent,
            "model": {
                "providerID": self.config.provider,
                "modelID": self.config.model,
            },
        }
        if tools is not None:
            payload["tools"] = tools
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(
                    f"{self.config.base_url}/session/{session_id}/message",
                    headers=self._headers(),
                    params=self._params(),
                    json=payload,
                )
                response.raise_for_status()
                if not response.text.strip():
                    return {"session_id": session_id, "empty_response": True}
                return response.json()
        except httpx.RequestError as exc:
            raise RuntimeError(f"OpenCode server unavailable at {self.config.base_url}: {exc}") from exc


def draft_prompt(slug: str, context_root: Path) -> str:
    return f"""Generate or refresh the draft skill for candidate `{slug}`.

Work only inside `{context_root / slug}`.

Read `index.md` and all materials under `materials/`.
Update `draft.md` using the artifact contract from the `skill-builder` agent:
- frontmatter with status/source metadata
- `# Draft Skill: <title>`
- `## Publishable Skill` containing the clean runtime skill
- `## Draft Review` containing `### Material Coverage` and `### Refinement Notes`

The publishable section must be usable on its own after promotion. Keep source coverage,
uncertainty, TODOs, and refinement guidance only in the draft review section.

Also update `index.md` status to `drafted` if the draft is meaningfully populated.
Do not promote the skill and do not modify unrelated files.
"""

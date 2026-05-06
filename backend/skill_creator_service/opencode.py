from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

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

    def _message_payload(self, prompt: str, *, agent: str, tools: dict[str, bool] | None = None) -> dict[str, Any]:
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
        return payload

    def send_message(
        self,
        session_id: str,
        prompt: str,
        *,
        agent: str,
        tools: dict[str, bool] | None = None,
        timeout_seconds: int = 3600,
    ) -> dict[str, Any]:
        payload = self._message_payload(prompt, agent=agent, tools=tools)
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

    def send_message_async(
        self,
        session_id: str,
        prompt: str,
        *,
        agent: str,
        tools: dict[str, bool] | None = None,
    ) -> None:
        payload = self._message_payload(prompt, agent=agent, tools=tools)
        try:
            with httpx.Client(timeout=30) as client:
                response = client.post(
                    f"{self.config.base_url}/session/{session_id}/prompt_async",
                    headers=self._headers(),
                    params=self._params(),
                    json=payload,
                )
                response.raise_for_status()
        except httpx.RequestError as exc:
            raise RuntimeError(f"OpenCode server unavailable at {self.config.base_url}: {exc}") from exc

    def stream_message(
        self,
        session_id: str,
        prompt: str,
        *,
        agent: str,
        tools: dict[str, bool] | None = None,
    ) -> Iterator[dict[str, Any]]:
        part_text: dict[str, str] = {}
        try:
            with httpx.Client(timeout=None) as event_client:
                with event_client.stream(
                    "GET",
                    f"{self.config.base_url}/event",
                    headers=self._headers(),
                    params=self._params(),
                ) as response:
                    response.raise_for_status()
                    self.send_message_async(session_id, prompt, agent=agent, tools=tools)
                    yield {"type": "status", "message": "Agent 已启动。"}

                    event_lines: list[str] = []
                    for line in response.iter_lines():
                        if line:
                            event_lines.append(line)
                            continue
                        event = parse_sse_event(event_lines)
                        event_lines = []
                        if not event:
                            continue
                        forwarded = opencode_stream_event(event, session_id, part_text)
                        if forwarded:
                            yield forwarded
                        if forwarded and forwarded["type"] in {"done", "error"}:
                            return
        except httpx.RequestError as exc:
            raise RuntimeError(f"OpenCode server unavailable at {self.config.base_url}: {exc}") from exc


def parse_sse_event(lines: list[str]) -> dict[str, Any] | None:
    data_lines = []
    for line in lines:
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if not data_lines:
        return None
    try:
        payload = json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def opencode_stream_event(
    event: dict[str, Any],
    session_id: str,
    part_text: dict[str, str],
) -> dict[str, Any] | None:
    event_type = event.get("type")
    properties = event.get("properties")
    if not isinstance(event_type, str) or not isinstance(properties, dict):
        return None

    event_session_id = (
        properties.get("sessionID")
        or _nested(properties, "info", "sessionID")
        or _nested(properties, "part", "sessionID")
    )
    if event_session_id != session_id:
        return None

    if event_type in {"session.idle", "session.turn.close"}:
        return {"type": "done"}
    if event_type == "session.error":
        message = properties.get("error") or properties.get("message") or "Agent 运行失败。"
        return {"type": "error", "message": str(message)}
    if event_type == "session.status":
        status = properties.get("status")
        return {"type": "status", "message": f"Agent {status}。"} if status else None
    if event_type == "message.part.delta":
        delta = properties.get("delta")
        return {"type": "delta", "text": delta} if isinstance(delta, str) and delta else None
    if event_type == "message.part.updated":
        delta = properties.get("delta")
        if isinstance(delta, str) and delta:
            return {"type": "delta", "text": delta}
        part = properties.get("part")
        if not isinstance(part, dict) or part.get("type") not in {"text", "reasoning"}:
            return None
        text = part.get("text") or part.get("content")
        if not isinstance(text, str) or not text:
            return None
        part_id = str(part.get("id") or part.get("partID") or "")
        previous = part_text.get(part_id, "")
        part_text[part_id] = text
        if text.startswith(previous):
            delta_text = text[len(previous):]
            return {"type": "delta", "text": delta_text} if delta_text else None
        return {"type": "delta", "text": text}
    return None


def _nested(payload: dict[str, Any], *keys: str) -> Any:
    current: Any = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def draft_prompt(slug: str, context_root: Path) -> str:
    return f"""Generate or refresh the draft skill for candidate `{slug}`.

Work only inside `{context_root / slug}`.

Read `index.md` and all materials under `materials/`.
Update `draft.md` using the artifact contract from the `skill-builder` agent:
- draft frontmatter with status and source material metadata
- `# Publishable Skill` containing the clean runtime skill
- `# Draft Review` containing `## Material Coverage` and `## Refinement Notes`

The candidate title already lives in `index.md`; do not repeat it as a heading in `draft.md`.
Use `# Publishable Skill` and `# Draft Review` as the only H1 boundaries. Put runtime
subsections under `##` headings. Keep source coverage, uncertainty, TODOs, and refinement
guidance only in the draft review section.

Also update `index.md` status to `drafted` if the draft is meaningfully populated.
Do not promote the skill and do not modify unrelated files.
"""

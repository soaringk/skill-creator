from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class DashScopeLLMConfig:
    api_key: str
    model: str
    base_url: str


class DashScopeLLMClient:
    def __init__(self, config: DashScopeLLMConfig):
        self.config = config

    def polish_text(self, text: str) -> str:
        source = text.strip()
        if not source:
            raise ValueError("Text is required.")
        if not self.config.api_key:
            raise RuntimeError("DASHSCOPE_API_KEY is required for text polishing")

        payload = {
            "model": self.config.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You polish raw user-provided skill source material. "
                        "Preserve facts, examples, names, constraints, and the original intent. "
                        "Do not add new information. Keep the original language unless the text itself clearly requests translation. "
                        "Return only the polished text, with no preface or explanation."
                    ),
                },
                {
                    "role": "user",
                    "content": source,
                },
            ],
            "temperature": 0.2,
        }
        try:
            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{self.config.base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            message = _error_message(exc.response)
            raise RuntimeError(f"DashScope text polishing failed: {message}") from exc
        except httpx.RequestError as exc:
            raise RuntimeError(f"DashScope text polishing unavailable: {exc}") from exc

        polished = _first_message_content(data)
        if not polished.strip():
            raise RuntimeError("DashScope text polishing returned empty content.")
        return polished.strip()


def _first_message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _error_message(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text or f"HTTP {response.status_code}"
    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str):
                return message
        message = data.get("message")
        if isinstance(message, str):
            return message
    return response.text or f"HTTP {response.status_code}"

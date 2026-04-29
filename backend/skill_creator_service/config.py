from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _expand_path(value: str) -> Path:
    return Path(value).expanduser().resolve()


def load_dotenv(path: Path = PROJECT_ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


@dataclass(frozen=True)
class Settings:
    context_root: Path
    rules_root: Path
    job_store_path: Path
    admin_token: str
    dashscope_api_key: str
    dashscope_model: str
    dashscope_websocket_url: str
    opencode_base_url: str
    opencode_username: str
    opencode_password: str
    opencode_directory: Path
    opencode_model: str
    opencode_provider: str


def load_settings() -> Settings:
    load_dotenv()
    context_root = _expand_path(
        os.getenv(
            "SKILL_CREATOR_CONTEXT_ROOT",
            "~/context-infrastructure/contexts/skill_creator",
        )
    )
    return Settings(
        context_root=context_root,
        rules_root=_expand_path(
            os.getenv(
                "SKILL_CREATOR_RULES_ROOT",
                "~/context-infrastructure/rules/skills",
            )
        ),
        job_store_path=_expand_path(
            os.getenv(
                "SKILL_CREATOR_JOB_STORE",
                str(Path.cwd() / "data" / "jobs.jsonl"),
            )
        ),
        admin_token=os.getenv("SKILL_CREATOR_ADMIN_TOKEN", ""),
        dashscope_api_key=os.getenv("DASHSCOPE_API_KEY", ""),
        dashscope_model=os.getenv("DASHSCOPE_ASR_MODEL", "fun-asr-realtime"),
        dashscope_websocket_url=os.getenv(
            "DASHSCOPE_WEBSOCKET_URL",
            "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
        ),
        opencode_base_url=os.getenv("OPENCODE_BASE_URL", "http://127.0.0.1:4096"),
        opencode_username=os.getenv("OPENCODE_SERVER_USERNAME", "opencode"),
        opencode_password=os.getenv("OPENCODE_SERVER_PASSWORD", ""),
        opencode_directory=_expand_path(os.getenv("OPENCODE_DIRECTORY", str(PROJECT_ROOT))),
        opencode_model=os.getenv("OPENCODE_MODEL", "glm-5"),
        opencode_provider=os.getenv("OPENCODE_PROVIDER", "zai-coding-plan"),
    )

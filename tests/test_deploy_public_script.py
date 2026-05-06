from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "scripts" / "deploy-public.sh").read_text(encoding="utf-8")


def nginx_block(path: str) -> str:
    match = re.search(
        rf"location \^~ {re.escape(path)} \{{\n(?P<body>.*?)\n\}}",
        SCRIPT,
        flags=re.DOTALL,
    )
    assert match is not None
    return match.group("body")


def test_public_locations_do_not_require_basic_auth() -> None:
    for path in ("/tools/skill-creator/api/", "/tools/skill-creator/"):
        block = nginx_block(path)
        assert "auth_basic" not in block
        assert "auth_basic_user_file" not in block


def test_public_deploy_does_not_manage_auth_credentials() -> None:
    assert "htpasswd" not in SCRIPT
    assert "openssl rand" not in SCRIPT
    assert "SKILL_CREATOR_PUBLIC_AUTH_USER" not in SCRIPT
    assert "SKILL_CREATOR_PUBLIC_AUTH_PASSWORD" not in SCRIPT


def test_public_api_proxy_is_not_ip_allowlisted() -> None:
    block = nginx_block("/tools/skill-creator/api/")

    assert "allow 127.0.0.1;" not in block
    assert "allow ::1;" not in block
    assert "deny all;" not in block


def test_public_api_proxy_forwards_websocket_upgrade() -> None:
    block = nginx_block("/tools/skill-creator/api/")

    assert "proxy_http_version 1.1;" in block
    assert "proxy_set_header Upgrade $http_upgrade;" in block
    assert 'proxy_set_header Connection "upgrade";' in block

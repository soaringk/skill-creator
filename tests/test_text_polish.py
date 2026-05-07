from __future__ import annotations

from fastapi.testclient import TestClient

import skill_creator_service.main as main


class FakeLLM:
    def polish_text(self, text: str) -> str:
        assert text == "raw text"
        return "polished text"


class FailingLLM:
    def polish_text(self, text: str) -> str:
        raise RuntimeError("provider down")


def test_polish_text_returns_polished_text(monkeypatch) -> None:
    monkeypatch.setattr(main, "llm", FakeLLM())
    client = TestClient(main.app)

    response = client.post("/api/text/polish", json={"text": "raw text"})

    assert response.status_code == 200
    assert response.json() == {"text": "polished text"}


def test_polish_text_maps_provider_errors(monkeypatch) -> None:
    monkeypatch.setattr(main, "llm", FailingLLM())
    client = TestClient(main.app)

    response = client.post("/api/text/polish", json={"text": "raw text"})

    assert response.status_code == 502
    assert response.json()["detail"] == "provider down"

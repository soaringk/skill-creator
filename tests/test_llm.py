from __future__ import annotations

import httpx

from skill_creator_service.llm import DashScopeLLMClient, DashScopeLLMConfig


def test_polish_text_calls_dashscope_compatible_endpoint(monkeypatch) -> None:
    requests: list[dict] = []
    original_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(
            {
                "url": str(request.url),
                "authorization": request.headers.get("authorization"),
                "json": request.read().decode(),
            }
        )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "Polished text",
                        }
                    }
                ]
            },
        )

    class MockClient:
        def __init__(self, timeout: int):
            self.timeout = timeout
            self.client = original_client(transport=httpx.MockTransport(handler))

        def __enter__(self):
            return self.client

        def __exit__(self, exc_type, exc, traceback):
            self.client.close()

    monkeypatch.setattr(httpx, "Client", MockClient)
    client = DashScopeLLMClient(
        DashScopeLLMConfig(
            api_key="sk-test",
            model="qwen-plus",
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1/",
        )
    )

    result = client.polish_text("Raw text")

    assert result == "Polished text"
    assert requests[0]["url"] == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    assert requests[0]["authorization"] == "Bearer sk-test"
    assert '"model":"qwen-plus"' in requests[0]["json"].replace(" ", "")

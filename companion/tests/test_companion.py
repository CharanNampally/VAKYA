import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from vakya_companion.app import create_app
from vakya_companion.engine import Engine, ProviderError, SemanticReply, direction, iast

TOKEN = "test-only-pairing-token-with-at-least-32-characters"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client():
    return TestClient(create_app(TOKEN), base_url="http://127.0.0.1:8765", headers=HEADERS)


@pytest.mark.parametrize("source,target,expected", [
    ("sa", "sa", "identity"), ("en", "sa", "en-indic"),
    ("te", "sa", "indic-indic"), ("hi", "en", "indic-en"), ("sa", "te", "indic-indic"),
])
def test_direction(source, target, expected):
    assert direction(source, target) == expected


def test_real_iast_and_sanskrit_identity(client):
    assert iast("नमस्ते") == "namaste"
    response = client.post("/v1/teach", json={"text": "अहं पठामि।", "sourceLanguage": "sa"})
    assert response.status_code == 200
    assert response.json()["sanskrit"] == "अहं पठामि।"
    assert response.json()["warnings"] == ["transliteration_only"]


def test_real_morphology_preserves_visarga_analyses(client):
    pytest.importorskip("sanskrit_parser")
    response = client.post("/v1/analyze", json={"text": "रामः फलम् खादति।"})
    assert response.status_code == 200
    words = response.json()["words"]
    assert [word["word"] for word in words] == ["रामः", "फलम्", "खादति"]
    assert any(candidate["root"].startswith("rAma") for candidate in words[0]["candidates"])
    assert all(word["candidates"] for word in words)
    assert response.json()["warnings"] == ["candidate_analysis"]


def test_pairing_required_and_not_exposed(client):
    response = client.get("/v1/capabilities", headers={"Authorization": ""})
    assert response.status_code == 401
    assert TOKEN not in response.text
    assert client.get("/v1/capabilities", headers={"Authorization": b"Bearer \xff"}).status_code == 401


def test_bad_origin_and_host_denied(client):
    assert client.get("/v1/capabilities", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/v1/capabilities", headers={"Host": "evil.example"}).status_code == 403


def test_private_network_preflight_does_not_require_token(client):
    response = client.options("/v1/teach", headers={
        "Authorization": "", "Origin": "https://charannampally.github.io",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Private-Network": "true",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://charannampally.github.io"
    assert response.headers["access-control-allow-private-network"] == "true"


@pytest.mark.parametrize("body", [
    {"text": "  ", "sourceLanguage": "en"},
    {"text": "a" * 401, "sourceLanguage": "en"},
    {"text": "hello", "sourceLanguage": "fr"},
    {"text": "hello", "sourceLanguage": "en", "modelPath": "/tmp/arbitrary"},
])
def test_strict_input_limits(client, body):
    response = client.post("/v1/teach", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert "arbitrary" not in response.text


def test_body_limit(client):
    response = client.post("/v1/teach", content=b"x" * 17000, headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_speech_not_faked(client):
    response = client.post("/v1/speak", json={"text": "नमस्ते"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "provider_unavailable"


def test_missing_model_is_explicit(client, monkeypatch):
    monkeypatch.setattr("vakya_companion.engine.installed", lambda name: False)
    response = client.post("/v1/teach", json={"text": "I read.", "sourceLanguage": "en"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "provider_unavailable"


def test_conversation_orchestration_with_fixture_providers():
    class FixtureEngine(Engine):
        def capabilities(self):
            return {"conversation": True}

        def translate(self, text, source, target):
            return "नमस्ते" if target == "sa" else text

        def semantic_reply(self, text, level, history):
            return SemanticReply(reply="Hello", explanation="A greeting.")

    output = FixtureEngine().converse("Hello", "en", "en", "beginner", [])
    assert output["sanskrit"] == "नमस्ते"
    assert output["history"][-1] == {"role": "assistant", "content": "Hello"}


def test_conversation_requires_explicit_experimental_opt_in(monkeypatch):
    monkeypatch.setattr("vakya_companion.engine.installed", lambda name: True)
    monkeypatch.delenv("VAKYA_EXPERIMENTAL_CONVERSATION", raising=False)
    assert Engine().capabilities()["conversation"] is False
    monkeypatch.setenv("VAKYA_EXPERIMENTAL_CONVERSATION", "1")
    assert Engine().capabilities()["conversation"] is True


def test_inference_failure_does_not_echo_input():
    class FailingEngine(Engine):
        def teach(self, text, source):
            raise RuntimeError(text)

    client = TestClient(create_app(TOKEN, FailingEngine()), base_url="http://127.0.0.1:8765", headers=HEADERS)
    response = client.post("/v1/teach", json={"text": "private test sentence", "sourceLanguage": "en"})
    assert response.status_code == 500
    assert "private test sentence" not in response.text
    assert response.json()["error"]["code"] == "inference_failed"


def test_busy_does_not_queue_work():
    started = threading.Event()
    release = threading.Event()

    class SlowEngine(Engine):
        def teach(self, text, source):
            started.set()
            assert release.wait(5)
            return super().teach(text, source)

    client = TestClient(create_app(TOKEN, SlowEngine()), base_url="http://127.0.0.1:8765", headers=HEADERS)
    with ThreadPoolExecutor() as pool:
        request = pool.submit(client.post, "/v1/teach", json={"text": "नमस्ते", "sourceLanguage": "sa"})
        try:
            assert started.wait(5)
            response = client.post("/v1/teach", json={"text": "नमस्ते", "sourceLanguage": "sa"})
            assert response.status_code == 429
        finally:
            release.set()
        assert request.result().status_code == 200

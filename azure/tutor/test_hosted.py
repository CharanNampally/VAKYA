import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))

from app import create_app
from engine import HostedEngine
from vakya_companion.engine import ProviderError, SemanticReply
from quota import DailyQuota
from azure.core.exceptions import ResourceNotFoundError


class Quota:
    def __init__(self):
        self.calls = 0

    def take(self, client):
        self.calls += 1


class FakeEngine:
    def capabilities(self):
        return {"protocol": 1}

    def teach(self, text, source):
        return {"sanskrit": "नमस्ते", "source": source}

    def analyze(self, text):
        return {"words": []}

    def converse(self, *args):
        return {"sanskrit": "नमस्ते"}


@pytest.fixture
def service():
    quota = Quota()
    return TestClient(create_app(FakeEngine(), lambda: quota)), quota


def test_anonymous_requests_need_no_pairing(service):
    client, quota = service
    assert client.get("/health").status_code == 200
    assert client.get("/v1/capabilities").status_code == 200
    assert quota.calls == 0
    response = client.post("/v1/teach", json={"text": "Hello", "sourceLanguage": "en"})
    assert response.json()["sanskrit"] == "नमस्ते"
    assert quota.calls == 1


@pytest.mark.parametrize("body", [
    {"text": "", "sourceLanguage": "en"}, {"text": "x" * 401, "sourceLanguage": "en"},
    {"text": "Hello", "sourceLanguage": "xx"}, {"text": "Hi", "sourceLanguage": "en", "secret": "x"},
])
def test_invalid_input_is_rejected_before_quota(service, body):
    client, quota = service
    response = client.post("/v1/teach", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert quota.calls == 0


def test_body_limit_and_content_type(service):
    client, quota = service
    assert client.post("/v1/teach", content="x" * 16385, headers={"content-type": "application/json"}).status_code == 413
    assert client.post("/v1/teach", content="x").status_code == 415
    assert quota.calls == 0


def test_cors_and_bad_origin(service):
    client, quota = service
    response = client.options("/v1/teach", headers={
        "origin": "https://charannampally.github.io", "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
    })
    assert response.headers["access-control-allow-origin"] == "https://charannampally.github.io"
    assert client.post("/v1/teach", headers={"origin": "https://unapproved.example"},
                       json={"text": "Hello", "sourceLanguage": "en"}).status_code == 403
    assert quota.calls == 0


def test_quota_failure_is_explicit_and_no_inference():
    class Limited:
        def take(self, client):
            raise ProviderError("quota_exceeded", "Daily limit reached.")
    response = TestClient(create_app(FakeEngine(), Limited)).post(
        "/v1/teach", json={"text": "Hello", "sourceLanguage": "en"},
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "quota_exceeded"


def test_infrastructure_failure_does_not_fall_back():
    def unavailable():
        raise RuntimeError("Storage offline")
    response = TestClient(create_app(FakeEngine(), unavailable)).post(
        "/v1/teach", json={"text": "Hello", "sourceLanguage": "en"},
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "inference_failed"


def test_unknown_translation_provider_is_not_silently_changed(monkeypatch):
    monkeypatch.setenv("VAKYA_TRANSLATION_PROVIDER", "typo")
    with pytest.raises(ValueError):
        HostedEngine()


def test_missing_madlad_disables_translation_and_conversation(monkeypatch, tmp_path):
    monkeypatch.setenv("VAKYA_TRANSLATION_PATH", str(tmp_path))
    engine = HostedEngine()
    assert not any(engine.capabilities()["translation"].values())
    assert not engine.capabilities()["conversation"]
    with pytest.raises(ProviderError, match="not provisioned"):
        engine.teach("Hello", "en")
    assert engine.teach("नमस्ते", "sa")["transliteration"] == "namaste"


def test_selected_translator_is_reported_and_english_planner_is_separate(monkeypatch):
    engine = HostedEngine()
    calls = []

    def translate(text, source, target):
        calls.append((source, target))
        return "नमस्ते" if target == "sa" else "Hello"

    monkeypatch.setattr(engine, "translate", translate)
    monkeypatch.setattr(engine, "capabilities", lambda: {"conversation": True})
    monkeypatch.setattr(engine, "semantic_reply", lambda *args: SemanticReply(reply="Hello", explanation="Practice a greeting."))
    assert engine.teach("Hello", "en")["provider"] == "google/madlad400-3b-mt"
    result = engine.converse("నమస్కారం", "te", "hi", "beginner", [])
    assert calls == [("en", "sa"), ("te", "en"), ("en", "sa"), ("en", "hi")]
    assert result["provider"] == "Qwen/Qwen3-4B+madlad"
    assert result["history"][-1]["content"] == "Hello"


def test_indictrans_remains_selectable_without_claiming_missing_weights(monkeypatch, tmp_path):
    monkeypatch.setenv("VAKYA_TRANSLATION_PROVIDER", "indictrans2")
    engine = HostedEngine()
    assert engine.capabilities()["translationProvider"] == "indictrans2"
    assert not engine.capabilities()["conversation"]


def test_quota_reserves_global_and_client_in_one_atomic_transaction():
    class Table:
        def get_entity(self, day, key):
            raise ResourceNotFoundError("missing")

        def submit_transaction(self, actions):
            self.actions = actions

    quota = DailyQuota.__new__(DailyQuota)
    quota.table, quota.global_limit, quota.client_limit = Table(), 10, 2
    quota.take("test-client")
    actions = quota.table.actions
    assert len(actions) == 2
    assert all(action[0] == "create" and action[1]["count"] == 1 for action in actions)
    assert actions[0][1]["PartitionKey"] == actions[1][1]["PartitionKey"]
    assert actions[0][1]["RowKey"] == "global"
    assert "test-client" not in str(actions)


def test_exhausted_quota_writes_nothing():
    class Table:
        def get_entity(self, day, key):
            return {"count": 10}

        def submit_transaction(self, actions):
            pytest.fail("An exhausted quota must not write.")

    quota = DailyQuota.__new__(DailyQuota)
    quota.table, quota.global_limit, quota.client_limit = Table(), 10, 2
    with pytest.raises(ProviderError, match="Daily request limit"):
        quota.take("test-client")

"""
Tests for the HTTP surface in main.py, exercised in-process with FastAPI's
TestClient — no uvicorn, no socket, no real pipeline.

The behaviour that matters here is what Express sees. server/src/services/
ai.service.ts treats any non-2xx as "Sana AI is currently unavailable" and
degrades gracefully, so the contract this suite protects is: every failure
arrives as a clean 503 with a JSON body, and no failure leaks a stack trace.
"""

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture
def api_key(monkeypatch):
    """Most tests need the key present so the guard in consult() doesn't
    short-circuit before the part being tested."""
    monkeypatch.setenv("GROQ_API_KEY", "test-key-not-real")


def _fake_pipeline_result(**overrides):
    """A minimal dict shaped like what rag.pipeline.consult returns."""
    result = {
        "diagnosticGuidance": "Consider malaria; confirm with an RDT.",
        "sources": [{"title": "Ghana STG — Malaria", "excerpt": "Presents with fever...", "score": 0.41}],
        "disclaimer": "Sana AI provides decision support only.",
        "ragMetadata": {"model": "test-model", "retrievalCount": 1, "responseTimeMs": 12},
        "acuityLevel": None,
        "acuityReasons": None,
    }
    result.update(overrides)
    return result


class _FakeCollection:
    def __init__(self, count: int):
        self._count = count

    def count(self) -> int:
        return self._count


class _FakeStore:
    def __init__(self, count: int):
        self._collection = _FakeCollection(count)


def test_health_is_ok_when_the_key_and_the_store_are_both_present(client, api_key, monkeypatch):
    monkeypatch.setattr(main, "get_vectorstore", lambda: _FakeStore(42))

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"groqApiKey": True, "vectorStore": True}
    assert body["passages"] == 42


def test_health_is_503_without_an_api_key(client, monkeypatch):
    """
    The point of the readiness check. Reporting healthy here would mean the
    first real consult is the thing that discovers the service can't work —
    and by then it's a user-visible failure rather than a startup one.
    """
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setattr(main, "get_vectorstore", lambda: _FakeStore(42))

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["checks"]["groqApiKey"] is False
    # The other check still reports its real state, so the body says which
    # half is broken rather than just that something is.
    assert response.json()["checks"]["vectorStore"] is True


def test_health_is_503_when_the_vector_store_is_empty(client, api_key, monkeypatch):
    monkeypatch.setattr(main, "get_vectorstore", lambda: _FakeStore(0))

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["checks"]["vectorStore"] is False


def test_health_reports_rather_than_raises_when_the_store_errors(client, api_key, monkeypatch):
    """A health check that 500s tells a monitor nothing useful — it has to
    survive the failure it exists to report."""

    def _explode():
        raise RuntimeError("chroma is unreadable")

    monkeypatch.setattr(main, "get_vectorstore", _explode)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["checks"]["vectorStore"] is False


def test_consult_without_an_api_key_is_503(client, monkeypatch):
    """
    Fails loudly at the front door rather than letting the Groq client throw a
    confusing auth error deep in the pipeline. Express collapses this to
    "unavailable" for the user, but the detail here is what makes the real
    cause findable in the service logs.
    """
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    response = client.post("/v1/consult", json={"query": "How is malaria treated?"})

    assert response.status_code == 503
    assert "GROQ_API_KEY" in response.json()["detail"]


def test_consult_returns_the_pipeline_result(client, api_key, monkeypatch):
    monkeypatch.setattr(main, "run_rag_pipeline", lambda *_args: _fake_pipeline_result())

    response = client.post("/v1/consult", json={"query": "How is malaria treated?"})

    assert response.status_code == 200
    body = response.json()
    assert body["diagnosticGuidance"].startswith("Consider malaria")
    assert body["sources"][0]["title"] == "Ghana STG — Malaria"
    assert body["disclaimer"]


def test_any_pipeline_exception_becomes_a_503(client, api_key, monkeypatch):
    """
    Everything that can go wrong downstream — the embedding model failing to
    load, a Groq outage, a corrupt vector store — has to reach Express as the
    same clean 503. A raw 500 would surface a Python traceback to the client.
    """

    def _explode(*_args):
        raise RuntimeError("chroma exploded")

    monkeypatch.setattr(main, "run_rag_pipeline", _explode)

    response = client.post("/v1/consult", json={"query": "anything"})

    assert response.status_code == 503
    assert "RAG pipeline error" in response.json()["detail"]


def test_a_503_body_carries_no_traceback(client, api_key, monkeypatch):
    """The detail names the failure, but must not include a file path or frame
    listing — those tell an attacker about the deployment."""

    def _explode(*_args):
        raise RuntimeError("chroma exploded")

    monkeypatch.setattr(main, "run_rag_pipeline", _explode)

    detail = client.post("/v1/consult", json={"query": "anything"}).json()["detail"]

    assert "Traceback" not in detail
    assert ".py" not in detail


def test_patient_context_reaches_the_pipeline(client, api_key, monkeypatch):
    captured = {}

    def _capture(query, patient_context, assess_acuity):
        captured["query"] = query
        captured["context"] = patient_context
        captured["assess_acuity"] = assess_acuity
        return _fake_pipeline_result()

    monkeypatch.setattr(main, "run_rag_pipeline", _capture)

    client.post(
        "/v1/consult",
        json={
            "query": "What should I consider?",
            "patientContext": {"chiefComplaint": "Fever", "vitals": {"temperature": 39.1}},
            "assessAcuity": True,
        },
    )

    assert captured["query"] == "What should I consider?"
    assert captured["context"]["chiefComplaint"] == "Fever"
    assert captured["context"]["vitals"]["temperature"] == 39.1
    assert captured["assess_acuity"] is True


def test_a_request_with_no_patient_context_sends_an_empty_dict(client, api_key, monkeypatch):
    """The doctor's free-text consult has no encounter attached. The pipeline
    must get {} rather than None, which _format_context can't index."""
    captured = {}

    def _capture(_query, patient_context, _assess_acuity):
        captured["context"] = patient_context
        return _fake_pipeline_result()

    monkeypatch.setattr(main, "run_rag_pipeline", _capture)

    client.post("/v1/consult", json={"query": "A general question"})

    assert captured["context"] == {}


def test_assess_acuity_defaults_to_false(client, api_key, monkeypatch):
    """A request that forgets the flag must not silently get a triage read —
    Express stores acuity only for NURSE_VITALS_ANALYSIS."""
    captured = {}

    def _capture(_query, _context, assess_acuity):
        captured["assess_acuity"] = assess_acuity
        return _fake_pipeline_result()

    monkeypatch.setattr(main, "run_rag_pipeline", _capture)

    client.post("/v1/consult", json={"query": "A question"})

    assert captured["assess_acuity"] is False


def test_an_acuity_response_carries_level_and_reasons(client, api_key, monkeypatch):
    monkeypatch.setattr(
        main,
        "run_rag_pipeline",
        lambda *_args: _fake_pipeline_result(
            acuityLevel="CRITICAL", acuityReasons=["Oxygen saturation 85% is critically low"]
        ),
    )

    body = client.post("/v1/consult", json={"query": "Assess", "assessAcuity": True}).json()

    assert body["acuityLevel"] == "CRITICAL"
    assert body["acuityReasons"] == ["Oxygen saturation 85% is critically low"]


def test_a_missing_query_is_rejected_as_a_validation_error(client, api_key):
    """Pydantic rejects it before any work is done — 422, not 503, because the
    service is fine and the request is not."""
    assert client.post("/v1/consult", json={}).status_code == 422


class TestServiceToken:
    """
    The shared secret on /v1/consult (main.require_service_token).

    AI_SERVICE_TOKEN is read once at import into a module global, so these
    tests set main.AI_SERVICE_TOKEN directly rather than the environment —
    setting the env var after import would have no effect, and a test that
    appeared to pass for that reason would be worse than no test.
    """

    def test_unset_token_leaves_the_endpoint_open(self, client, api_key, monkeypatch):
        """Local development must keep working without any configuration.
        The startup warning is what stops this being a silent default."""
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", None)
        monkeypatch.setattr(main, "run_rag_pipeline", lambda *_a: _fake_pipeline_result())

        assert client.post("/v1/consult", json={"query": "A question"}).status_code == 200

    def test_a_request_with_the_right_token_is_allowed(self, client, api_key, monkeypatch):
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", "the-shared-secret")
        monkeypatch.setattr(main, "run_rag_pipeline", lambda *_a: _fake_pipeline_result())

        response = client.post(
            "/v1/consult",
            json={"query": "A question"},
            headers={"X-Sana-Token": "the-shared-secret"},
        )

        assert response.status_code == 200

    def test_a_request_with_no_token_is_rejected(self, client, api_key, monkeypatch):
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", "the-shared-secret")

        response = client.post("/v1/consult", json={"query": "A question"})

        assert response.status_code == 401
        assert "token" in response.json()["detail"].lower()

    def test_a_request_with_the_wrong_token_is_rejected(self, client, api_key, monkeypatch):
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", "the-shared-secret")

        response = client.post(
            "/v1/consult",
            json={"query": "A question"},
            headers={"X-Sana-Token": "not-the-secret"},
        )

        assert response.status_code == 401

    def test_the_pipeline_is_never_reached_by_a_rejected_request(self, client, api_key, monkeypatch):
        """The whole point is not spending Groq quota on an unauthorized
        caller — rejecting after doing the work would defeat it."""
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", "the-shared-secret")

        def _should_not_run(*_args):
            raise AssertionError("the pipeline ran for an unauthenticated request")

        monkeypatch.setattr(main, "run_rag_pipeline", _should_not_run)

        assert client.post("/v1/consult", json={"query": "A question"}).status_code == 401

    def test_health_is_not_behind_the_token(self, client, api_key, monkeypatch):
        """A readiness probe has to be reachable by whatever is monitoring the
        service, which is generally not holding the backend's secret."""
        monkeypatch.setattr(main, "AI_SERVICE_TOKEN", "the-shared-secret")
        monkeypatch.setattr(main, "get_vectorstore", lambda: _FakeStore(42))

        assert client.get("/health").status_code == 200

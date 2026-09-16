"""
Shared fixtures for the ai-service test suite.

The whole suite is deliberately offline: no GROQ_API_KEY, no network call, no
embedding model load, except where a test says otherwise in its own docstring
(tests/test_knowledge_base.py and tests/test_retrieval.py do load the real
tokenizer/vector store, and say so).
"""

import pytest

from rag import pipeline


@pytest.fixture(autouse=True)
def reset_pipeline_caches():
    """
    Clears the module-level caches in rag.pipeline between every test.

    pipeline.py memoizes the vector store and the LLM client in module globals
    (`_vectorstore`, `_llm`) so the ~80MB embedding model is loaded once per
    process rather than once per request. That's right for the server and wrong
    for tests: without this fixture, the first test to monkeypatch `_get_llm`
    would leave its fake behind in `_llm` for every test that ran afterwards,
    and tests would pass or fail depending on the order they happened to run in.

    autouse, because forgetting it in one test file would reintroduce exactly
    that cross-test leakage this exists to prevent.
    """
    pipeline._vectorstore = None
    pipeline._llm = None
    yield
    pipeline._vectorstore = None
    pipeline._llm = None


class FakeCompletion:
    """Stands in for the object LangChain's `.invoke()` returns — the pipeline
    only ever reads `.content` off it."""

    def __init__(self, content: str):
        self.content = content


class FakeLLM:
    """
    A stand-in for ChatGroq. Records the messages it was handed so a test can
    assert on what the prompt actually contained, which is the only way to
    check that below-threshold passages were really kept out of it.
    """

    def __init__(self, response: str = "Fake guidance."):
        self.response = response
        self.calls: list[list[dict]] = []

    def invoke(self, messages):
        self.calls.append(messages)
        return FakeCompletion(self.response)

    @property
    def last_user_prompt(self) -> str:
        """The most recent user-role message content."""
        return next(m["content"] for m in reversed(self.calls[-1]) if m["role"] == "user")


class FakeDocument:
    """Mirrors the two attributes the pipeline reads off a LangChain Document."""

    def __init__(self, page_content: str, title: str = "Untitled"):
        self.page_content = page_content
        self.metadata = {"title": title}


class FakeVectorStore:
    """
    Returns a fixed list of (document, score) pairs, so a test controls exactly
    which passages land above and below MIN_RELEVANCE_SCORE.
    """

    def __init__(self, results: list[tuple[FakeDocument, float]]):
        self.results = results

    def similarity_search_with_relevance_scores(self, query: str, k: int = 5):
        return self.results[:k]


@pytest.fixture
def fake_llm(monkeypatch):
    """Installs a FakeLLM in place of the real ChatGroq client and returns it."""

    def _install(response: str = "Fake guidance.") -> FakeLLM:
        llm = FakeLLM(response)
        monkeypatch.setattr(pipeline, "_get_llm", lambda: llm)
        return llm

    return _install


@pytest.fixture
def fake_store(monkeypatch):
    """Installs a FakeVectorStore with caller-supplied (text, title, score) rows."""

    def _install(rows: list[tuple[str, str, float]]) -> FakeVectorStore:
        store = FakeVectorStore([(FakeDocument(text, title), score) for text, title, score in rows])
        monkeypatch.setattr(pipeline, "_get_vectorstore", lambda: store)
        return store

    return _install

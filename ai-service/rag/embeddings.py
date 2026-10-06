"""
A LangChain-compatible embedder backed by fastembed (ONNX Runtime).

Why this exists: the pipeline used `HuggingFaceEmbeddings`, which loads the
model through PyTorch. Importing torch plus the model needs well over 512MB of
RAM, which is more than Render's free tier allows, so the service was killed
on its first request and the proxy answered 502. fastembed runs the very same
`all-MiniLM-L6-v2` weights through ONNX Runtime instead, with no torch in the
process, which brings the footprint down to a few hundred MB.

Chroma only needs an object with `embed_documents` and `embed_query`, which is
exactly LangChain's `Embeddings` interface, so this small class is all the glue
required — nothing else in the pipeline has to change.
"""

from fastembed import TextEmbedding
from langchain_core.embeddings import Embeddings


class FastEmbedEmbeddings(Embeddings):
    def __init__(self, model_name: str) -> None:
        # Downloads the ONNX model to a local cache the first time it runs
        # (about 90MB), then loads it from there on every later start.
        self._model = TextEmbedding(model_name=model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # fastembed yields numpy arrays lazily; Chroma wants plain lists of
        # floats, so each vector is converted as it is collected.
        return [vector.tolist() for vector in self._model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        # A query is just a one-item batch — fastembed's `embed` always takes
        # an iterable, so wrap it and unwrap the single result.
        return next(iter(self._model.embed([text]))).tolist()

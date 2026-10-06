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


# How many passages are pushed through the model at once. fastembed defaults to
# 256, which pads the whole batch to its longest passage and allocates
# activations for all of it in one go — seeding the 42-passage knowledge base
# that way measured a ~430MB peak, versus ~230MB (just the loaded model) at 4.
# The knowledge base is embedded once at startup, so the extra batches cost
# milliseconds; the vectors are bit-identical either way.
EMBED_BATCH_SIZE = 4


class FastEmbedEmbeddings(Embeddings):
    def __init__(self, model_name: str) -> None:
        # Downloads the ONNX model to a local cache the first time it runs
        # (about 90MB), then loads it from there on every later start.
        self._model = TextEmbedding(model_name=model_name)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # fastembed yields numpy arrays lazily; Chroma wants plain lists of
        # floats, so each vector is converted as it is collected.
        return [
            vector.tolist()
            for vector in self._model.embed(texts, batch_size=EMBED_BATCH_SIZE)
        ]

    def embed_query(self, text: str) -> list[float]:
        # A query is just a one-item batch — fastembed's `embed` always takes
        # an iterable, so wrap it and unwrap the single result.
        return next(iter(self._model.embed([text]))).tolist()

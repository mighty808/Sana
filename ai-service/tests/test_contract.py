"""
Guards the committed JSON Schema that describes the /v1/consult response.

This is the Python half of a two-sided check. Here we assert that the schema
on disk still matches the Pydantic models — i.e. that whoever changed a model
also regenerated the contract. The other half lives in
server/src/test/ai-contract.test.ts, which validates Express's own idea of the
shape against the same file.

Together they turn a silent cross-service drift into a failing test. Before
this existed, the only thing connecting the two services' understanding of the
response was a hand-maintained comment.
"""

import json
import os

from generate_contract import CONTRACT_PATH, build_schema


def test_the_committed_schema_matches_the_pydantic_models():
    """
    If this fails, a model in main.py changed without the contract being
    regenerated. That is not a test to edit — regenerate and commit the result:

        cd ai-service && ./venv/Scripts/python generate_contract.py
    """
    assert os.path.exists(CONTRACT_PATH), (
        "contract/consult-response.schema.json is missing — "
        "run `python generate_contract.py` from ai-service/"
    )

    with open(CONTRACT_PATH, encoding="utf-8") as handle:
        committed = json.load(handle)

    assert committed == build_schema(), (
        "The committed contract no longer matches ai-service/main.py. "
        "Regenerate it with `python generate_contract.py` from ai-service/, "
        "then update the TypeScript copies listed in "
        "server/src/test/ai-contract.test.ts."
    )


def test_the_contract_covers_the_fields_express_depends_on():
    """
    A regeneration keeps the file in step with Pydantic automatically, which
    means a field could be *removed* from the model and the contract would
    happily follow it down. These are the fields Express reads by name in
    ai.service.ts — losing one breaks the feature, so removing it should have
    to be deliberate enough to edit this list.
    """
    with open(CONTRACT_PATH, encoding="utf-8") as handle:
        schema = json.load(handle)

    assert set(schema["required"]) >= {"diagnosticGuidance", "sources", "disclaimer", "ragMetadata"}

    source_properties = set(schema["$defs"]["Source"]["properties"])
    assert source_properties == {"title", "excerpt", "score", "grounded"}

    metadata_properties = set(schema["$defs"]["RagMetadata"]["properties"])
    assert metadata_properties == {"model", "retrievalCount", "responseTimeMs"}

    # Acuity is optional by design — only the nurse's vitals analysis sets it,
    # and Express normalizes a null to "not present" before storing.
    assert "acuityLevel" not in schema["required"]
    assert "acuityReasons" not in schema["required"]

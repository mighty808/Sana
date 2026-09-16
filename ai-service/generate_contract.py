"""
Regenerates the committed JSON Schema for the /v1/consult response.

The response shape is restated by hand in six places across three languages
(this service's Pydantic models, the Express client interface, its Mongoose
schema, its test mock, and the React type). Nothing made them agree — the
comment in server/src/services/ai.service.ts says as much. This script makes
the Pydantic model the single source of truth and writes it out in a form the
TypeScript side can assert against too.

Run it after changing any model in main.py:

    ./venv/Scripts/python generate_contract.py

Then commit the updated contract/consult-response.schema.json. Both
ai-service/tests/test_contract.py and server/src/test/ai-contract.test.ts fail
until you do, which is the point: drift becomes a failing test instead of a
production surprise.
"""

import json
import os

from main import ConsultResponse

CONTRACT_PATH = os.path.join(os.path.dirname(__file__), "..", "contract", "consult-response.schema.json")


def build_schema() -> dict:
    schema = ConsultResponse.model_json_schema()
    # A stable header so a reader who opens the file knows it is generated and
    # what regenerates it, rather than editing it by hand and having the next
    # run silently overwrite them.
    return {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$comment": (
            "GENERATED from ai-service/main.py's ConsultResponse by "
            "ai-service/generate_contract.py — do not edit by hand."
        ),
        **schema,
    }


def main() -> None:
    os.makedirs(os.path.dirname(CONTRACT_PATH), exist_ok=True)
    with open(CONTRACT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        # sort_keys so a field added in the middle of a model produces a
        # minimal diff rather than reordering the whole file.
        json.dump(build_schema(), handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"wrote {os.path.normpath(CONTRACT_PATH)}")


if __name__ == "__main__":
    main()

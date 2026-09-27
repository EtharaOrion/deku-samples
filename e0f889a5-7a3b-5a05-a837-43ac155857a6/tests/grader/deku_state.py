from __future__ import annotations

import json
import os

import pytest

SNAPSHOT_PATH = os.environ.get("DEKU_PRE_BROWSER_COUNTS",
                               "/logs/verifier/pre_browser_counts.json")


@pytest.fixture(scope="session")
def pre_browser() -> dict:
    try:
        with open(SNAPSHOT_PATH, encoding="utf-8") as handle:
            loaded = json.load(handle)
    except (OSError, ValueError):
        return {}
    return loaded if isinstance(loaded, dict) else {}

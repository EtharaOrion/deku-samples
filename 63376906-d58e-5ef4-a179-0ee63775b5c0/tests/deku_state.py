"""Grading-session state the checks read but must not gather themselves.

Stage 3 of test.sh measures the store BEFORE any stage that can write to it, and
parks the reading at a known path. This exposes that reading as a fixture so a
check can tell a record the grading session created from a record the seed
shipped -- without querying the store a second time and measuring its own
footprint.
"""
from __future__ import annotations

import json
import os

import pytest

SNAPSHOT_PATH = os.environ.get("DEKU_PRE_BROWSER_COUNTS",
                               "/logs/verifier/pre_browser_counts.json")


@pytest.fixture(scope="session")
def pre_browser() -> dict:
    """Row counts taken before the grading session could write anything.

    An empty dict when no baseline was taken -- the checks treat that as "skip
    the seed-count comparison" rather than inventing a number. `_snapshot_ok`
    distinguishes a real reading of an empty store from a snapshot that failed,
    which would otherwise both read as zero.
    """
    try:
        with open(SNAPSHOT_PATH, encoding="utf-8") as handle:
            loaded = json.load(handle)
    except (OSError, ValueError):
        return {}
    return loaded if isinstance(loaded, dict) else {}

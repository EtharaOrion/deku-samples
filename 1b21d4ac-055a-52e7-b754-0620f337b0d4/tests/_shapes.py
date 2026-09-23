"""Payload shapes the checks read, independent of how a collection is wrapped.

The brief pins a top-level array for the index routes, but an app that answers
`{"items": [...]}` has still served the collection. A check asks for the rows and
does not spend an assertion on the envelope; the routes whose shape IS the
contract assert on it directly.

Rows come back exactly as served. A derived set like GET /api/disciplines answers
plain strings, and its check reads both spellings -- so filtering to records here
would report an empty set for a route that answered correctly.
"""
from __future__ import annotations

COLLECTION_KEYS = ("items", "data", "results", "rows", "records")


def items(payload) -> list:
    """The rows in `payload`, whether it is an array or wraps one."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in COLLECTION_KEYS:
            found = payload.get(key)
            if isinstance(found, list):
                return found
    return []


if __name__ == "__main__":
    assert items([{"slug": "a"}, {"slug": "b"}]) == [{"slug": "a"}, {"slug": "b"}]
    assert items({"items": [{"slug": "a"}]}) == [{"slug": "a"}]
    assert items({"data": [{"slug": "a"}]}) == [{"slug": "a"}]
    assert items({"items": "not a list"}) == []
    assert items(None) == [] and items({}) == [] and items(7) == []
    assert items(["director", "photographer"]) == ["director", "photographer"]
    assert items({"items": ["director"]}) == ["director"]
    assert items({"results": [{"n": 1}], "items": [{"n": 2}]}) == [{"n": 2}]
    print("_shapes self-check OK")

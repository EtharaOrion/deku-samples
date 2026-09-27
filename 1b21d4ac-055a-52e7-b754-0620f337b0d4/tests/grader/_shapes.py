from __future__ import annotations

COLLECTION_KEYS = ("items", "data", "results", "rows", "records")


def items(payload) -> list:
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

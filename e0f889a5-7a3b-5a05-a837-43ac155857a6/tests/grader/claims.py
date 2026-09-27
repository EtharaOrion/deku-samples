"""Compile task rubric criteria into conservative, typed verification claims.

Compilation never turns an English sentence into a deterministic assertion unless
it has an objective target (a literal, selector, URL, attribute, or measurement).
Behavioral criteria remain COMPOSITE and are sent to the appropriate browser
specialist instead of being guessed from the root page.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path


class ClaimType(str, Enum):
    DOM_PRESENCE = "dom_presence"
    TEXT_CONTENT = "text_content"
    STYLE_PROPERTY = "style_property"
    LAYOUT_GEOMETRY = "layout_geometry"
    NETWORK_RESPONSE = "network_response"
    MOTION_BEHAVIOR = "motion_behavior"
    A11Y_ATTRIBUTE = "a11y_attribute"
    FORM_FLOW = "form_flow"
    PERMISSION = "permission"
    DATA_INTEGRITY = "data_integrity"
    COMPOSITE = "composite"


@dataclass
class VerificationClaim:
    claim_type: ClaimType
    route: str = "/"
    route_candidates: list[str] = field(default_factory=list)
    selector_hint: str = ""
    expected: str = ""
    statement: str = ""
    evaluation_rule_excerpt: str = ""
    required_interaction: str = ""
    criterion_number: str = ""
    is_positive: bool = True

    def to_dict(self) -> dict:
        out = asdict(self)
        out["claim_type"] = self.claim_type.value
        return out


_ROUTE_RE = re.compile(r"(?<![\w.])(/[A-Za-z][A-Za-z0-9_./:*?=&%{}-]*)")
_QUOTED_RE = re.compile(r'["“]([^"”\n]{2,120})["”]|`([^`\n]{2,120})`|\'([^\'\n]{3,120})\'')
_SELECTOR_RE = re.compile(
    r"(?:css\s+selector|selector)\s*(?:is|=|:)?\s*[`\"']([^`\"']+)[`\"']", re.I)


def _routes(text: str, capture: dict) -> list[str]:
    out: list[str] = []
    route = str((capture or {}).get("route", ""))
    if route.startswith("/"):
        out.append(route.rstrip("/") or "/")
    for match in _ROUTE_RE.finditer(text):
        candidate = match.group(1).rstrip(".,;:)'\"`")
        if candidate not in {"/api"} and candidate not in out:
            out.append(candidate.rstrip("/") or "/")
    return out


def _literal(text: str) -> str:
    for match in _QUOTED_RE.finditer(text):
        value = next((group for group in match.groups() if group), "").strip()
        if value and not value.startswith("/") and len(value.split()) <= 8:
            return value
    return ""


def _extract_routes(text: str) -> list[str]:
    return _routes(text, {})


def _extract_quoted_strings(text: str) -> list[str]:
    return [next((group for group in match.groups() if group), "").strip()
            for match in _QUOTED_RE.finditer(text)
            if next((group for group in match.groups() if group), "").strip()]


def _selector(text: str) -> str:
    match = _SELECTOR_RE.search(text)
    return match.group(1).strip() if match else ""


def _required_interaction(text: str, capture: dict) -> str:
    if (capture or {}).get("interaction"):
        return str(capture["interaction"])
    lower = text.lower()
    verbs = (
        "click", "activate", "expand", "submit", "file", "approve", "reject",
        "refuse", "type", "enter", "select", "open", "navigate", "sign in",
        "reload", "hover", "scroll", "drag", "press", "resize",
    )
    return next((verb for verb in verbs if verb in lower), "")


def _infer_type(criterion: dict, full_text: str, literal: str, selector: str) -> ClaimType:
    lower = full_text.lower()
    dimension = str(criterion.get("dimension", "")).lower()
    target = str(criterion.get("evaluation_target", "")).lower()

    if target == "recorded_ui" or dimension == "motion" or any(
        token in lower for token in ("animation", "transition", "motion", "easing", "still behind")
    ):
        return ClaimType.MOTION_BEHAVIOR
    if dimension == "accessibility" or any(
        token in lower for token in ("screen reader", "accessible name", "aria-", "keyboard", "focus order")
    ):
        return ClaimType.A11Y_ATTRIBUTE
    if dimension == "responsiveness" or any(
        token in lower for token in ("phone width", "mobile", "responsive", "reflows", "sideways")
    ):
        return ClaimType.LAYOUT_GEOMETRY
    if any(token in lower for token in ("permission", "role", "unauthor", "forbidden", "another user")):
        return ClaimType.PERMISSION
    if any(token in lower for token in (
        "reconcile", "exactly", "duplicate", "same entry", "resolved count", "computed from",
        "data integrity", "persists", "freshly filed", "next visit",
    )):
        return ClaimType.DATA_INTEGRITY
    if any(token in lower for token in ("wizard", "form", "typed", "step", "submit", "validation")):
        return ClaimType.FORM_FLOW
    if any(token in lower for token in ("colour", "color", "font", "background", "border", "opacity")):
        return ClaimType.STYLE_PROPERTY
    if any(token in lower for token in (
        "align", "column", "grid", "beside", "stack", "width", "clipped", "geometry"
    )):
        return ClaimType.LAYOUT_GEOMETRY
    if any(token in lower for token in ("endpoint", "status code", "http response")):
        return ClaimType.NETWORK_RESPONSE
    if literal:
        return ClaimType.TEXT_CONTENT
    if selector and any(token in lower for token in ("exists", "visible", "present", "render")):
        return ClaimType.DOM_PRESENCE
    return ClaimType.COMPOSITE


def decompose_criterion(criterion: dict) -> list[VerificationClaim]:
    number = str(criterion.get("number", ""))
    statement = str(criterion.get("criterion", "")).strip()
    rule = str(criterion.get("evaluation_rule", "")).strip()
    full_text = "\n".join(part for part in (statement, rule) if part)
    capture = criterion.get("capture") or {}
    route_candidates = _routes(full_text, capture)
    route = route_candidates[0] if route_candidates else "/"
    literal = _literal(full_text)
    selector = _selector(full_text)
    claim_type = _infer_type(criterion, full_text, literal, selector)

    expected = literal if claim_type in {ClaimType.TEXT_CONTENT, ClaimType.DOM_PRESENCE} else ""
    return [VerificationClaim(
        claim_type=claim_type,
        route=route,
        route_candidates=route_candidates,
        selector_hint=selector,
        expected=expected,
        statement=statement,
        evaluation_rule_excerpt=rule[:1200],
        required_interaction=_required_interaction(full_text, capture),
        criterion_number=number,
        is_positive=bool(criterion.get("is_positive", True)),
    )]


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Compile rubric criteria into claims")
    parser.add_argument("--rubric", required=True, type=Path)
    args = parser.parse_args()
    raw = json.loads(args.rubric.read_text())
    for criterion in raw:
        print(json.dumps(decompose_criterion(criterion)[0].to_dict(), indent=2))

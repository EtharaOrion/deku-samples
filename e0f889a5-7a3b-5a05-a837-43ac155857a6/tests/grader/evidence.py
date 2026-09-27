"""Typed, serializable evidence shared by browser, pytest, probes and rubric agents.

The loader is deliberately tolerant of older artifacts, but it preserves the
important distinction between an app verdict and an evaluator error.  Nothing in
this module calls an LLM or a browser.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SCHEMA_VERSION = "deku.evidence.v1"


@dataclass
class EvidenceClaim:
    source: str
    workflow_id: str = ""
    substep_id: str = ""
    substep_do: str = ""
    route: str = ""
    final_url: str = ""
    observation: str = ""
    passed: bool | None = None
    evaluator_error: str = ""
    tools_used: list[str] = field(default_factory=list)
    trace_path: str = ""
    screenshot_paths: list[str] = field(default_factory=list)
    timestamp: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class EvidenceBundle:
    claims: list[EvidenceClaim] = field(default_factory=list)
    routes_visited: set[str] = field(default_factory=set)
    screenshots: list[dict[str, Any]] = field(default_factory=list)
    styles: dict[str, Any] = field(default_factory=dict)
    a11y: dict[str, Any] = field(default_factory=dict)
    motion: dict[str, Any] = field(default_factory=dict)
    network: list[dict[str, Any]] = field(default_factory=list)
    probe_results: list[dict[str, Any]] = field(default_factory=list)
    active_results: list[dict[str, Any]] = field(default_factory=list)
    verdicts: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    generated_at: str = ""
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "generated_at": self.generated_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "claims": [claim.to_dict() for claim in self.claims],
            "routes_visited": sorted(self.routes_visited),
            "screenshots": self.screenshots,
            "styles": self.styles,
            "a11y": self.a11y,
            "motion": self.motion,
            "network": self.network,
            "probe_results": self.probe_results,
            "active_results": self.active_results,
            "verdicts": self.verdicts,
            "metrics": self.metrics,
        }

    def claims_for_route(self, route: str) -> list[EvidenceClaim]:
        wanted = normalize_route(route)
        return [claim for claim in self.claims if normalize_route(claim.route) == wanted]

    def passing_claims(self) -> list[EvidenceClaim]:
        return [claim for claim in self.claims if claim.passed is True]

    def failing_claims(self) -> list[EvidenceClaim]:
        return [claim for claim in self.claims if claim.passed is False]


def normalize_route(value: str) -> str:
    """Return a path+query route from either a URL or path."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith(("http://", "https://")):
        parsed = urlparse(raw)
        raw = parsed.path or "/"
        if parsed.query:
            raw += "?" + parsed.query
    if not raw.startswith("/"):
        return ""
    return raw.rstrip("/") or "/"


def _extract_route_from_text(text: str) -> str:
    url = re.search(r"https?://[^\s\"'`,;)]+", text)
    if url:
        route = normalize_route(url.group(0))
        if route:
            return route
    explicit = re.search(
        r"(?:navigated?\s+to|final\s+url|url\s+is|at|visiting|on|route)\s+[\"']?"
        r"(/[A-Za-z0-9_./?=&:%{}*-]+)", text, re.I)
    if explicit:
        return normalize_route(explicit.group(1))
    bare = re.search(r"(?<![\w.])(/[A-Za-z][A-Za-z0-9_./?=&:%{}*-]*)", text)
    return normalize_route(bare.group(1)) if bare else ""


def _tool_names(raw: Any) -> list[str]:
    if isinstance(raw, dict):
        out: list[str] = []
        for name, count in raw.items():
            try:
                n = max(1, min(int(count), 20))
            except (TypeError, ValueError):
                n = 1
            out.extend([str(name)] * n)
        return out[:50]
    if isinstance(raw, list):
        return [str(item.get("name")) for item in raw
                if isinstance(item, dict) and item.get("name")][:50]
    return []


def _route_from_tool_history(raw: Any) -> str:
    if not isinstance(raw, list):
        return ""
    for item in reversed(raw):
        if not isinstance(item, dict):
            continue
        if item.get("name") in {"navigate", "browser_navigate"}:
            route = normalize_route((item.get("input") or {}).get("url", ""))
            if route:
                return route
    return ""


def load_workflow_evidence(path: Path) -> list[EvidenceClaim]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return []

    flattened: list[dict[str, Any]] = []
    for ss in data.get("substeps", []) or []:
        if isinstance(ss, dict):
            flattened.append(dict(ss))
    if not flattened:
        for workflow in data.get("workflows", []) or []:
            if not isinstance(workflow, dict):
                continue
            wid = str(workflow.get("id", workflow.get("name", "")))
            trace_path = str(workflow.get("trace", ""))
            for index, ss in enumerate(workflow.get("substeps", []) or [], 1):
                if not isinstance(ss, dict):
                    continue
                row = dict(ss)
                row.setdefault("workflow_id", wid)
                row.setdefault("substep_id", row.get("id", str(index)))
                row.setdefault("trace_path", trace_path)
                flattened.append(row)

    claims: list[EvidenceClaim] = []
    for index, ss in enumerate(flattened, 1):
        do_text = str(ss.get("do", ""))
        note = str(ss.get("note", ""))
        final_url = str(ss.get("final_url", ss.get("url", "")))
        tools_raw = ss.get("tools", ss.get("tools_used", []))
        route = (normalize_route(final_url)
                 or _route_from_tool_history(ss.get("tools"))
                 or _extract_route_from_text(note)
                 or _extract_route_from_text(do_text))
        evaluator_error = str(ss.get("error", ""))
        raw_passed = ss.get("passed")
        passed = None if evaluator_error else (
            raw_passed if isinstance(raw_passed, bool) else None)
        screenshots = ss.get("screenshots") or []
        if isinstance(screenshots, str):
            screenshots = [screenshots]
        claims.append(EvidenceClaim(
            source="workflow",
            workflow_id=str(ss.get("workflow_id", "")),
            substep_id=str(ss.get("substep_id", ss.get("id", index))),
            substep_do=do_text,
            route=route,
            final_url=final_url,
            observation=note or do_text,
            passed=passed,
            evaluator_error=evaluator_error,
            tools_used=_tool_names(tools_raw),
            trace_path=str(ss.get("trace_path", ss.get("trace", ""))),
            screenshot_paths=[str(item) for item in screenshots],
            timestamp=str(ss.get("started_at", ss.get("timestamp", ""))),
            metadata={
                key: ss[key] for key in ("steps_used", "reason") if key in ss
            },
        ))
    return claims


def load_pytest_evidence(path: Path) -> list[EvidenceClaim]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return []

    claims: list[EvidenceClaim] = []
    for test in (data.get("results") or {}).get("tests", []) or []:
        if not isinstance(test, dict):
            continue
        name = str(test.get("name", ""))
        status = str(test.get("status", "")).lower()
        message = str(test.get("message", ""))
        route = _extract_route_from_text(name + " " + message)
        passed = True if status == "passed" else False if status == "failed" else None
        observation = f"pytest {name}: {status or 'unknown'}"
        if message:
            observation += f" — {message[:500]}"
        claims.append(EvidenceClaim(
            source="pytest",
            substep_id=name,
            substep_do=name,
            route=route,
            observation=observation,
            passed=passed,
            evaluator_error=str(test.get("error", "")),
            timestamp=str(test.get("start", "")),
        ))
    return claims


def merge_evidence(
    workflow_claims: list[EvidenceClaim],
    pytest_claims: list[EvidenceClaim],
    rubric_evidence: dict[str, Any] | None = None,
) -> EvidenceBundle:
    rubric_evidence = rubric_evidence or {}
    claims = [*workflow_claims, *pytest_claims]
    routes = {normalize_route(claim.route) for claim in claims if normalize_route(claim.route)}
    routes.update(normalize_route(route) for route in rubric_evidence.get("routes_visited", [])
                  if normalize_route(route))
    screenshots = rubric_evidence.get("screenshots") or []
    if isinstance(screenshots, dict):
        screenshots = [{"path": key, "value": value} for key, value in screenshots.items()]
    screenshot_index = []
    for item in screenshots:
        if isinstance(item, dict):
            screenshot_index.append({key: value for key, value in item.items() if key != "b64"})
        else:
            screenshot_index.append({"path": str(item)})
    return EvidenceBundle(
        claims=claims,
        routes_visited=routes,
        screenshots=screenshot_index,
        styles=dict(rubric_evidence.get("styles") or {}),
        a11y=dict(rubric_evidence.get("a11y") or {}),
        motion=dict(rubric_evidence.get("motion") or {}),
        network=list(rubric_evidence.get("failed_requests") or []),
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Inspect shared grader evidence")
    parser.add_argument("--browser-results", required=True, type=Path)
    parser.add_argument("--ctrf", type=Path)
    args = parser.parse_args()
    workflow = load_workflow_evidence(args.browser_results)
    pytest_claims = load_pytest_evidence(args.ctrf) if args.ctrf else []
    bundle = merge_evidence(workflow, pytest_claims)
    print(json.dumps(bundle.to_dict(), indent=2))

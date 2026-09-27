"""Route rubric criteria to evidence sources and browser specialists."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

try:
    from .claims import ClaimType, VerificationClaim
    from .evidence import EvidenceBundle, EvidenceClaim, normalize_route
    from .probes import ProbeResult
except ImportError:
    from claims import ClaimType, VerificationClaim
    from evidence import EvidenceBundle, EvidenceClaim, normalize_route
    from probes import ProbeResult


class Resolution(str, Enum):
    FROM_WORKFLOW_EVIDENCE = "workflow_evidence"
    FROM_PROBE = "probe"
    FROM_ACTIVE_ACQUISITION = "active_acquisition"
    FROM_LLM_JUDGE = "llm_judge"
    MACHINE_UNRESOLVED = "machine_unresolved"


class Specialist(str, Enum):
    NAVIGATION = "navigation"
    FORMS = "forms"
    PERMISSIONS = "permissions"
    DATA_INTEGRITY = "data_integrity"
    VISUAL = "visual"
    RESPONSIVE = "responsive"
    ACCESSIBILITY = "accessibility"
    MOTION = "motion"


@dataclass
class RoutingDecision:
    criterion: dict
    resolution: Resolution
    specialist: Specialist = Specialist.NAVIGATION
    evidence_source: str = ""
    claims: list[VerificationClaim] = field(default_factory=list)
    workflow_match_score: float = 0.0
    matching_workflow_ids: list[str] = field(default_factory=list)
    probe_settled: bool = False
    needs_active: bool = False

    def to_dict(self) -> dict:
        return {
            "criterion_number": self.criterion.get("number", ""),
            "resolution": self.resolution.value,
            "specialist": self.specialist.value,
            "evidence_source": self.evidence_source,
            "claims": [claim.to_dict() for claim in self.claims],
            "workflow_match_score": self.workflow_match_score,
            "matching_workflow_ids": self.matching_workflow_ids,
            "probe_settled": self.probe_settled,
            "needs_active": self.needs_active,
        }


_STOP = {
    "the", "and", "that", "with", "from", "this", "then", "when", "where", "each",
    "only", "into", "there", "their", "shows", "renders", "appears", "criterion",
    "fully", "screen", "page", "user", "same", "after", "before",
}


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z][a-z0-9_-]{2,}", text.lower())
            if word not in _STOP}


def _semantic_overlap(a: str, b: str) -> float:
    left, right = _tokens(a), _tokens(b)
    if not left or not right:
        return 0.0
    shared = left & right
    precision = len(shared) / min(len(left), len(right))
    jaccard = len(shared) / len(left | right)
    return 0.65 * precision + 0.35 * jaccard


def _keyword_overlap(text_a: str, text_b: str) -> float:
    return _semantic_overlap(text_a, text_b)

def specialist_for(criterion: dict, claims: list[VerificationClaim]) -> Specialist:
    dimension = str(criterion.get("dimension", "")).lower()
    kinds = {claim.claim_type for claim in claims}
    text = (str(criterion.get("criterion", "")) + " " +
            str(criterion.get("evaluation_rule", ""))).lower()
    if ClaimType.MOTION_BEHAVIOR in kinds or dimension == "motion":
        return Specialist.MOTION
    if ClaimType.A11Y_ATTRIBUTE in kinds or dimension == "accessibility":
        return Specialist.ACCESSIBILITY
    if dimension == "responsiveness" or "phone width" in text:
        return Specialist.RESPONSIVE
    if ClaimType.PERMISSION in kinds:
        return Specialist.PERMISSIONS
    if ClaimType.DATA_INTEGRITY in kinds:
        return Specialist.DATA_INTEGRITY
    if ClaimType.FORM_FLOW in kinds or dimension in {"functionality", "ux_flow"}:
        return Specialist.FORMS
    if kinds & {ClaimType.STYLE_PROPERTY, ClaimType.LAYOUT_GEOMETRY} or dimension == "ui_visual":
        return Specialist.VISUAL
    return Specialist.NAVIGATION


def _find_matching_workflow_evidence(
    criterion: dict,
    bundle: EvidenceBundle,
    threshold: float = 0.28,
) -> tuple[float, list[EvidenceClaim]]:
    text = f"{criterion.get('criterion', '')} {criterion.get('evaluation_rule', '')}".strip()
    capture_route = normalize_route((criterion.get("capture") or {}).get("route", ""))
    criterion_routes = {normalize_route(match) for match in
                        re.findall(r"(?<![\w.])(/[A-Za-z][A-Za-z0-9_./?=&%{}*-]*)", text)
                        if normalize_route(match)}
    if capture_route:
        criterion_routes.add(capture_route)
    candidates: list[tuple[float, EvidenceClaim]] = []
    for claim in bundle.claims:
        if claim.source != "workflow" or claim.evaluator_error:
            continue
        claim_text = f"{claim.substep_do} {claim.observation}"
        score = _semantic_overlap(text, claim_text)
        if criterion_routes and normalize_route(claim.route) in criterion_routes:
            score = min(1.0, score + 0.12)
        if score >= threshold:
            candidates.append((score, claim))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return (candidates[0][0] if candidates else 0.0,
            [claim for _, claim in candidates[:6]])


def seed_workflow_evidence(
    criterion: dict,
    bundle: EvidenceBundle,
    limit: int = 6,
) -> list[EvidenceClaim]:
    """Best-effort context for the specialist prompt -- NO threshold.

    SETTLING a criterion from workflow evidence must stay strict: 0.72 overlap,
    consistent verdicts, or the grader would launder a loosely-worded substep
    into a rubric verdict. SEEDING has no such risk. The seeds are labelled
    untrusted in the system prompt and the specialist re-verifies anything it
    relies on; a merely-related observation is still worth more than nothing.

    The two were previously the same 0.28-gated call, which meant that in
    practice the specialist was seeded with nothing at all. Measured across the
    three tasks in output/, the best overlap any criterion achieved against any
    workflow observation was 0.451 (calendar 0.251, talent-roster 0.247), so the
    0.28 gate admitted 4 seeds out of 56 criteria and the 0.72 settle gate has
    never once fired. Every specialist opened with

        PREVIOUS WORKFLOW EVIDENCE: []

    while 36-50 fresh observations of the same app sat unused in the bundle.
    Rubric prose and workflow prose describe the same screens in different
    vocabulary, so a bag-of-words overlap cannot connect them -- but the routes
    can, and an imperfect lead still saves the specialist several of its ~28
    browser calls on rediscovery.
    """
    text = f"{criterion.get('criterion', '')} {criterion.get('evaluation_rule', '')}".strip()
    capture_route = normalize_route((criterion.get("capture") or {}).get("route", ""))
    criterion_routes = {normalize_route(match) for match in
                        re.findall(r"(?<![\w.])(/[A-Za-z][A-Za-z0-9_./?=&%{}*-]*)", text)
                        if normalize_route(match)}
    if capture_route:
        criterion_routes.add(capture_route)

    scored: list[tuple[float, EvidenceClaim]] = []
    for claim in bundle.claims:
        if claim.source != "workflow" or claim.evaluator_error:
            continue
        score = _semantic_overlap(text, f"{claim.substep_do} {claim.observation}")
        if criterion_routes and normalize_route(claim.route) in criterion_routes:
            score += 1.0
        scored.append((score, claim))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [claim for _, claim in scored[:limit]]


def route_criterion(
    criterion: dict,
    evidence_bundle: EvidenceBundle,
    probe_results: list[ProbeResult],
    claims: list[VerificationClaim],
) -> RoutingDecision:
    number = str(criterion.get("number", ""))
    specialist = specialist_for(criterion, claims)
    match_score, matching = _find_matching_workflow_evidence(criterion, evidence_bundle)
    criterion_probes = [result for result in probe_results
                        if result.claim.criterion_number == number]

    clear = [claim for claim in matching if claim.passed is not None]
    if match_score >= 0.72 and clear:
        verdicts = {claim.passed for claim in clear}
        if len(verdicts) == 1:
            return RoutingDecision(
                criterion, Resolution.FROM_WORKFLOW_EVIDENCE, specialist,
                f"{len(clear)} consistent workflow observation(s)", claims,
                match_score, sorted({claim.workflow_id for claim in clear}), False, False)

    settled = [result for result in criterion_probes
               if result.satisfied is not None and result.confidence >= 0.9
               and not result.evaluator_error]
    if settled and len(settled) == len(criterion_probes):
        values = {result.satisfied for result in settled}
        if len(values) == 1:
            return RoutingDecision(
                criterion, Resolution.FROM_PROBE, specialist,
                f"{len(settled)} deterministic probe(s)", claims, match_score,
                sorted({claim.workflow_id for claim in matching}), True, False)

    return RoutingDecision(
        criterion, Resolution.FROM_ACTIVE_ACQUISITION, specialist,
        "active specialist seeded with workflow and deterministic measurements",
        claims, match_score, sorted({claim.workflow_id for claim in matching}), False, True)


def plan_grading(
    criteria: list[dict],
    evidence_bundle: EvidenceBundle,
    probe_results: list[ProbeResult] | None = None,
    all_claims: list[VerificationClaim] | None = None,
) -> list[RoutingDecision]:
    grouped: dict[str, list[VerificationClaim]] = {}
    for claim in all_claims or []:
        grouped.setdefault(claim.criterion_number, []).append(claim)
    return [route_criterion(
        criterion, evidence_bundle, probe_results or [],
        grouped.get(str(criterion.get("number", "")), []),
    ) for criterion in criteria]


def summarize_plan(decisions: list[RoutingDecision]) -> dict:
    by_resolution: dict[str, int] = {}
    by_specialist: dict[str, int] = {}
    for decision in decisions:
        by_resolution[decision.resolution.value] = by_resolution.get(decision.resolution.value, 0) + 1
        by_specialist[decision.specialist.value] = by_specialist.get(decision.specialist.value, 0) + 1
    return {
        "total_criteria": len(decisions),
        "by_resolution": by_resolution,
        "by_specialist": by_specialist,
        "needs_active": sum(decision.needs_active for decision in decisions),
        "probe_settled": sum(decision.probe_settled for decision in decisions),
    }

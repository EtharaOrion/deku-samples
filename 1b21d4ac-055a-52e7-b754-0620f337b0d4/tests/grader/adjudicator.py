"""Evidence adjudication with explicit machine-only unresolved outcomes.

Missing evidence is never converted into an app failure, and negative criteria
can never earn credit merely because the evaluator saw nothing.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

try:
    from .active_evidence import ActiveAcquisitionResult
    from .evidence import EvidenceBundle, EvidenceClaim
    from .probes import ProbeResult
    from .router import Resolution, RoutingDecision, _find_matching_workflow_evidence
except ImportError:
    from active_evidence import ActiveAcquisitionResult
    from evidence import EvidenceBundle, EvidenceClaim
    from probes import ProbeResult
    from router import Resolution, RoutingDecision, _find_matching_workflow_evidence


PROBE_CONFIDENCE_THRESHOLD = float(os.environ.get("DEKU_ADJUDICATOR_PROBE_THRESHOLD", "0.9"))
ACTIVE_CONFIDENCE_THRESHOLD = float(os.environ.get("DEKU_ADJUDICATOR_ACTIVE_THRESHOLD", "0.7"))
WORKFLOW_OVERLAP_THRESHOLD = float(os.environ.get("DEKU_ADJUDICATOR_WORKFLOW_THRESHOLD", "0.72"))
PARTIAL_CONFIDENCE_THRESHOLD = float(os.environ.get("DEKU_ADJUDICATOR_PARTIAL_THRESHOLD", "0.7"))
PARTIAL_COVERAGE_THRESHOLD = float(os.environ.get("DEKU_ADJUDICATOR_PARTIAL_COVERAGE", "0.6"))
PARTIAL_CONFIDENCE_DISCOUNT = float(os.environ.get("DEKU_ADJUDICATOR_PARTIAL_DISCOUNT", "0.85"))


class MachineOutcome(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    EVALUATOR_ERROR = "EVALUATOR_ERROR"


@dataclass
class Verdict:
    criterion_number: str
    outcome: MachineOutcome
    satisfied: bool | None
    confidence: float
    resolution: Resolution
    evidence: list[str] = field(default_factory=list)
    rationale: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "criterion_number": self.criterion_number,
            "outcome": self.outcome.value,
            "satisfied": self.satisfied,
            "confidence": self.confidence,
            "resolution": self.resolution.value,
            "evidence": self.evidence,
            "rationale": self.rationale,
        }

    def to_judge_entry(self, criterion: dict) -> dict[str, Any]:
        positive = bool(criterion.get("is_positive", True))
        passed = None if self.satisfied is None else (
            self.satisfied if positive else not self.satisfied)
        return {
            "number": self.criterion_number,
            "criterion": criterion.get("criterion", ""),
            "evaluation_rule": criterion.get("evaluation_rule", ""),
            "dimension": criterion.get("dimension", ""),
            "importance": criterion.get("importance", ""),
            "satisfied": self.satisfied,
            "passed": passed,
            "is_positive": positive,
            "score": None if passed is None else (1.0 if passed else 0.0),
            "confidence": self.confidence,
            "weight": criterion.get("weight", 0.0),
            "rationale": self.rationale,
            "evidence": self.evidence,
            "human_eval": "no",
            "machine_status": self.outcome.value,
            "resolved_by": self.resolution.value,
            "voters": 1,
        }


def _resolved(number: str, statement_satisfied: bool, confidence: float,
              resolution: Resolution, evidence: list[str], rationale: str,
              positive: bool) -> Verdict:
    passed = statement_satisfied if positive else not statement_satisfied
    return Verdict(number, MachineOutcome.PASS if passed else MachineOutcome.FAIL,
                   statement_satisfied, confidence, resolution, evidence, rationale)


def adjudicate(
    criterion: dict,
    routing: RoutingDecision,
    probe_results: list[ProbeResult],
    active_result: ActiveAcquisitionResult | None,
    workflow_evidence: list[EvidenceClaim],
) -> Verdict:
    number = str(criterion.get("number", ""))
    positive = bool(criterion.get("is_positive", True))
    criterion_probes = [result for result in probe_results
                        if result.claim.criterion_number == number]

    strong_probes = [result for result in criterion_probes
                     if result.satisfied is not None
                     and result.confidence >= PROBE_CONFIDENCE_THRESHOLD
                     and not result.evaluator_error]
    if strong_probes:
        values = {result.satisfied for result in strong_probes}
        if len(values) == 1:
            value = bool(next(iter(values)))
            return _resolved(
                number, value, min(result.confidence for result in strong_probes),
                Resolution.FROM_PROBE,
                [result.evidence_text for result in strong_probes[:5]],
                f"{len(strong_probes)} deterministic probe(s) directly settled the statement",
                positive)

    clear_workflow = [claim for claim in workflow_evidence
                      if claim.passed is not None and not claim.evaluator_error]
    if routing.workflow_match_score >= WORKFLOW_OVERLAP_THRESHOLD and clear_workflow:
        values = {claim.passed for claim in clear_workflow}
        if len(values) == 1:
            requirement_passed = bool(next(iter(values)))
            statement_satisfied = requirement_passed if positive else not requirement_passed
            return _resolved(
                number, statement_satisfied, min(0.9, routing.workflow_match_score),
                Resolution.FROM_WORKFLOW_EVIDENCE,
                [f"{claim.substep_do}: {claim.observation}"[:500]
                 for claim in clear_workflow[:5]],
                f"specific, consistent workflow evidence matched at {routing.workflow_match_score:.2f}",
                positive)

    if active_result and active_result.status == "resolved" \
            and active_result.satisfied is not None \
            and active_result.confidence >= ACTIVE_CONFIDENCE_THRESHOLD:
        return _resolved(
            number, active_result.satisfied, active_result.confidence,
            Resolution.FROM_ACTIVE_ACQUISITION, active_result.evidence[:10],
            active_result.rationale, positive)

    if active_result and active_result.status == "partial" \
            and active_result.satisfied is not None:
        observed = len(getattr(active_result, "observed", []) or [])
        unobserved = len(getattr(active_result, "unobserved", []) or [])
        parts = observed + unobserved
        if active_result.satisfied is False:
            return _resolved(
                number, False, max(active_result.confidence, PARTIAL_CONFIDENCE_THRESHOLD),
                Resolution.FROM_ACTIVE_ACQUISITION, active_result.evidence[:10],
                f"partial observation found a counterexample, which settles the "
                f"statement: {active_result.rationale}", positive)
        if parts and observed / parts >= PARTIAL_COVERAGE_THRESHOLD \
                and active_result.confidence >= PARTIAL_CONFIDENCE_THRESHOLD:
            return _resolved(
                number, True, round(active_result.confidence * PARTIAL_CONFIDENCE_DISCOUNT, 4),
                Resolution.FROM_ACTIVE_ACQUISITION,
                active_result.evidence[:10] + [
                    f"partially observed: {observed}/{parts} parts checked",
                    f"not observed: {'; '.join(active_result.unobserved[:4])}"],
                f"every observed part held ({observed}/{parts}); "
                f"unobserved parts were not contradicted: {active_result.rationale}",
                positive)

    errors = [result.evaluator_error for result in criterion_probes if result.evaluator_error]
    if active_result and active_result.status == "evaluator_error":
        errors.append(active_result.rationale or "active evaluator error")
    if errors and not active_result:
        return Verdict(
            number, MachineOutcome.EVALUATOR_ERROR, None, 0.0,
            Resolution.MACHINE_UNRESOLVED, errors[:5],
            "the evaluator failed before it obtained criterion-specific evidence")

    evidence: list[str] = []
    evidence.extend(result.evidence_text for result in criterion_probes
                    if result.evidence_text and not result.evaluator_error)
    if active_result:
        evidence.extend(active_result.evidence)
    if clear_workflow:
        evidence.extend(claim.observation for claim in clear_workflow[:3])
    reason = (active_result.rationale if active_result else
              "available workflow and deterministic evidence did not directly settle the criterion")
    return Verdict(
        number, MachineOutcome.INSUFFICIENT_EVIDENCE, None, 0.0,
        Resolution.MACHINE_UNRESOLVED, evidence[:10], reason)


def adjudicate_all(
    criteria: list[dict],
    evidence_bundle: EvidenceBundle,
    probe_results: list[ProbeResult],
    active_results: dict[str, ActiveAcquisitionResult],
    routing_decisions: list[RoutingDecision],
) -> list[Verdict]:
    verdicts: list[Verdict] = []
    for index, criterion in enumerate(criteria):
        number = str(criterion.get("number", ""))
        routing = (routing_decisions[index] if index < len(routing_decisions)
                   else RoutingDecision(criterion, Resolution.MACHINE_UNRESOLVED))
        _, workflow = _find_matching_workflow_evidence(criterion, evidence_bundle)
        verdicts.append(adjudicate(
            criterion, routing, probe_results, active_results.get(number), workflow))
    return verdicts


def verdicts_to_judge_entries(verdicts: list[Verdict], criteria: list[dict]) -> dict[str, dict]:
    return {
        criterion.get("key", f"{verdict.criterion_number}_unspecified"):
            verdict.to_judge_entry(criterion)
        for verdict, criterion in zip(verdicts, criteria)
    }


def summarize_verdicts(verdicts: list[Verdict], criteria: list[dict]) -> dict[str, Any]:
    counts = {outcome.value: 0 for outcome in MachineOutcome}
    for verdict in verdicts:
        counts[verdict.outcome.value] += 1
    total = len(verdicts)
    resolved = counts[MachineOutcome.PASS.value] + counts[MachineOutcome.FAIL.value]
    total_weight = sum(float(c.get("weight", 0.0) or 0.0) for c in criteria)
    resolved_weight = sum(float(c.get("weight", 0.0) or 0.0)
                          for verdict, c in zip(verdicts, criteria)
                          if verdict.outcome in {MachineOutcome.PASS, MachineOutcome.FAIL})
    return {
        "counts": counts,
        "criteria_total": total,
        "criteria_resolved": resolved,
        "criteria_unresolved": total - resolved,
        "coverage": (resolved / total) if total else 0.0,
        "weighted_coverage": (resolved_weight / total_weight) if total_weight else 0.0,
    }


def resolved_weighted_score(entries: dict[str, dict]) -> float | None:
    resolved = [entry for entry in entries.values() if entry.get("score") is not None]
    denominator = sum(float(entry.get("weight", 0.0) or 0.0) for entry in resolved)
    if denominator <= 0:
        return None
    numerator = sum(float(entry["score"]) * float(entry.get("weight", 0.0) or 0.0)
                    for entry in resolved)
    return round(numerator / denominator, 6)

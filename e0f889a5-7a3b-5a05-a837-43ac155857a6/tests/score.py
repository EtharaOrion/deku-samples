#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys

WEIGHTS = {"workflow": 0.50, "pytest": 0.25, "rubric": 0.25}

WORKFLOW_PASS_RATIO = 0.90

IMPORTANCE_WEIGHT = {"critically_important": 5.0, "important": 3.0,
                     "somewhat_important": 1.0}

def _criterion_weight(criterion) -> float:
    raw = criterion.get("score")
    if raw is None:
        raw = IMPORTANCE_WEIGHT.get(criterion.get("importance"), 1.0)
    return abs(float(raw))

def _load(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None

def pytest_component(ctrf) -> dict:
    if not ctrf:
        return {"score": 0.0, "passed": 0, "total": 0, "missing": True}
    summary = (ctrf.get("results") or {}).get("summary") or {}
    total = int(summary.get("tests") or 0)
    passed = int(summary.get("passed") or 0)
    graded = total - int(summary.get("skipped") or 0)
    return {"score": (passed / graded) if graded else 0.0,
            "passed": passed, "total": total, "graded": graded}

def _pytest_marks(ctrf) -> dict:
    marks = {}
    for test in ((ctrf or {}).get("results") or {}).get("tests") or []:
        name = str(test.get("name") or "")
        passed = test.get("status") == "passed"
        marks[name] = passed
        marks[name.split("::")[-1]] = passed
    return marks

def _browser_marks(browser) -> dict:
    marks = {}
    workflows = browser.get("workflows") if isinstance(browser, dict) else browser
    for workflow in workflows or []:
        steps = [s for s in (workflow.get("substeps") or [])
                 if s.get("kind", "browser") == "browser"]
        marks[workflow.get("id")] = [s.get("passed") for s in steps]
    return marks

def workflow_component(declared, browser, ctrf) -> dict:
    if not declared:
        return {"score": 0.0, "passed": 0, "total": 0, "missing": True}

    tests = _pytest_marks(ctrf)
    marked = _browser_marks(browser)

    passed = graded = 0
    detail = []
    for workflow in declared:
        identifier = workflow.get("id")
        browser_seen = 0
        substeps = []
        declared_steps = workflow.get("substeps") or []

        declared_browser = sum(1 for s in declared_steps
                               if s.get("kind") != "pytest")
        marks = marked.get(identifier) or []
        if len(marks) != declared_browser:
            marks = []

        for step in declared_steps:
            kind = step.get("kind")
            if kind == "pytest":
                reference = step.get("test") or step.get("ref") or ""
                outcome = tests.get(reference, tests.get(reference.split("::")[-1]))
            else:
                outcome = marks[browser_seen] if browser_seen < len(marks) else None
                browser_seen += 1
                reference = step.get("do") or step.get("ref") or ""
            substeps.append({"kind": kind, "ref": reference,
                             "critical": bool(step.get("critical")),
                             "passed": outcome})

        resolved = [s for s in substeps if s["passed"] is not None]
        if len(resolved) != len(substeps):
            detail.append({"id": identifier, "passed": None,
                           "substeps_resolved": len(resolved),
                           "substeps_declared": len(substeps),
                           "note": "not every substep was marked"})
            continue

        graded += 1
        ok = sum(1 for s in resolved if s["passed"])
        critical_failed = sum(1 for s in resolved
                              if s["critical"] and not s["passed"])
        ratio = ok / len(resolved)
        this = ratio >= WORKFLOW_PASS_RATIO and critical_failed == 0
        passed += 1 if this else 0
        detail.append({"id": identifier, "passed": this,
                       "substeps_passed": ok, "substeps_graded": len(resolved),
                       "ratio": round(ratio, 6),
                       "critical_failed": bool(critical_failed),
                       "substeps": substeps})

    return {"score": (passed / graded) if graded else 0.0,
            "passed": passed, "total": graded, "workflows": detail,
            "declared": len(declared),
            "missing": graded < len(declared)}

def rubric_component(judge, rubric) -> dict:
    if not judge:
        return {"score": 0.0, "criteria": 0, "passed": 0, "failed": 0,
                "unresolved": 0, "coverage": 0.0, "score_discounted": 0.0,
                "missing": True}

    weights = {}
    for criterion in (rubric or []):
        weights[str(criterion.get("number"))] = _criterion_weight(criterion)

    dimensions = judge.get("dimensions") or {}
    total_weight = 0.0
    resolved_weight = 0.0
    earned = 0.0
    passed = failed = unresolved = 0

    for key, dimension in dimensions.items():
        number = str(dimension.get("number") or key.split("_")[0])
        weight = dimension.get("weight")
        weight = float(weight) if weight is not None else weights.get(number, 1.0)
        total_weight += weight

        score = dimension.get("score")
        if score is None:
            marked = dimension.get("passed")
            if marked is None:
                seen = dimension.get("satisfied")
                if seen is not None:
                    marked = bool(seen) if dimension.get("is_positive", True) \
                        else not bool(seen)
            score = None if marked is None else (1.0 if marked else 0.0)
        if score is None:
            unresolved += 1
            continue

        resolved_weight += weight
        earned += weight * float(score)
        if float(score) > 0:
            passed += 1
        else:
            failed += 1

    score = (earned / resolved_weight) if resolved_weight else 0.0
    resolved_count = passed + failed
    coverage = (resolved_count / len(dimensions)) if dimensions else 0.0
    weighted_coverage = (resolved_weight / total_weight) if total_weight else 0.0
    return {"score": round(score, 6), "criteria": len(dimensions),
            "passed": passed, "failed": failed, "unresolved": unresolved,
            "coverage": round(coverage, 6),
            "weighted_coverage": round(weighted_coverage, 6),
            "score_discounted": round(score * coverage, 6),
            "missing": resolved_weight == 0}

def combine(workflow, pytest_, rubric) -> float:
    return round((workflow ** WEIGHTS["workflow"])
                 * (pytest_ ** WEIGHTS["pytest"])
                 * (rubric ** WEIGHTS["rubric"]), 4)

def measured(components) -> tuple[float, dict]:
    import math
    present = {}
    for name in WEIGHTS:
        component = components[name]
        if component.get("missing"):
            continue
        present[name] = (component["score_discounted"] if name == "rubric"
                         else component["score"])
    total = sum(WEIGHTS[n] for n in present)
    if not present or not total:
        return 0.0, {}
    applied = {n: round(WEIGHTS[n] / total, 6) for n in present}
    if any(float(v) <= 0 for v in present.values()):
        return 0.0, applied
    value = math.exp(sum(WEIGHTS[n] / total * math.log(float(v))
                         for n, v in present.items()))
    return round(value * total, 4), applied

def build(ctrf, browser, judge, rubric, invalid=None, declared=None,
          deploy_failed=False) -> dict:
    components = {"workflow": workflow_component(declared, browser, ctrf),
                  "pytest": pytest_component(ctrf),
                  "rubric": rubric_component(judge, rubric)}
    invalid = list(invalid or [])

    pending = [name for name in ("workflow", "rubric")
               if components[name].get("missing")]

    applied = dict(WEIGHTS)
    if deploy_failed:
        combined = 0.0
        reward = 0.0
        basis = "deploy_failed"
        pending = []
    elif invalid:
        combined = 0.0
        reward = 0.0
        basis = "verifier_fault"
    elif pending:
        combined = None
        reward, applied = measured(components)
        basis = "partial_pending_human_review: " + ", ".join(pending)
    else:
        combined = combine(components["workflow"]["score"],
                           components["pytest"]["score"],
                           components["rubric"]["score_discounted"])
        reward = combined
        basis = "complete"

    return {
        "combined_score": combined,
        "weights": dict(WEIGHTS),
        "weights_applied": applied,
        "pending": pending if not invalid else [],
        "components": components,
        "reward": reward,
        "invalid": invalid,
        "degraded": [],
        "rubric_coverage": components["rubric"]["coverage"],
        "note": ("Combined score is a weighted geometric mean of the workflow "
                 "pass rate, the pytest pass rate and the rubric result "
                 "discounted by criteria coverage (weights 0.50 / 0.25 / 0.25). "
                 "reward.json holds that same combined score; while a channel "
                 "is pending human review it holds the same mean over the "
                 "channels that were measured (weights_applied)."),
        "scoring": {"kind": "weighted_geometric_mean", "basis": basis,
                    "workflow_pass_ratio": WORKFLOW_PASS_RATIO,
                    "pytest_graded_by": "this container",
                    "workflow_graded_by": "human reviewer",
                    "rubric_graded_by": "human reviewer"},
    }

def templates(workflows, rubric) -> tuple[dict, dict]:
    browser = {"workflows": [
        {"id": workflow.get("id"),
         "purpose": workflow.get("purpose") or workflow.get("title"),
         "substeps": [{"kind": step.get("kind"), "do": step.get("do"),
                       "cov": step.get("cov"), "critical": False,
                       "passed": None, "note": ""}
                      for step in (workflow.get("substeps") or [])
                      if step.get("kind") != "pytest"]}
        for workflow in workflows or []],
        "meta": {"graded_by": "", "graded_at": ""}}

    dimensions = {}
    total = sum(_criterion_weight(c) for c in rubric or []) or 1.0
    for criterion in rubric or []:
        raw = float(criterion.get("score")
                    or IMPORTANCE_WEIGHT.get(criterion.get("importance"), 1.0))
        number = str(criterion.get("number"))
        dimensions["%s_%s" % (number, criterion.get("dimension", ""))] = {
            "number": number,
            "criterion": criterion.get("criterion"),
            "evaluation_rule": criterion.get("evaluation_rule"),
            "dimension": criterion.get("dimension"),
            "importance": criterion.get("importance"),
            "is_positive": criterion.get("is_positive", True),
            "marking": ("set passed=true when the criterion is MET"
                        if criterion.get("is_positive", True) else
                        "NEGATIVE criterion: the text describes what the app must "
                        "NOT do. set passed=false if you observe it, passed=true "
                        "if you do not. (or record satisfied= your raw "
                        "observation and score.py inverts it)"),
            "weight": round(raw / total, 6),
            "passed": None, "satisfied": None, "score": None,
            "rationale": "", "evidence": []}
    return browser, {"dimensions": dimensions, "criteria_total": len(dimensions),
                     "meta": {"graded_by": "", "graded_at": ""}}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pytest", default="/logs/verifier/ctrf.json")
    parser.add_argument("--browser", default="/logs/verifier/browser_results.json")
    parser.add_argument("--judge", default="/logs/verifier/judge.json")
    parser.add_argument("--rubric", default="/tests/rubric.json")
    parser.add_argument("--workflows", default="/tests/workflows.yaml")
    parser.add_argument("--out", default="/logs/verifier/final_score.json")
    parser.add_argument("--reward-out", default="/logs/verifier/reward.json")
    parser.add_argument("--invalid", default="")
    parser.add_argument("--deploy-failed", action="store_true",
                        help="the app never answered its health probe: score a "
                             "real zero and still write every artifact")
    parser.add_argument("--template", metavar="DIR",
                        help="write blank mark sheets here and exit")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    rubric = _load(args.rubric)
    if isinstance(rubric, dict):
        rubric = rubric.get("criteria") or []

    if args.template:
        try:
            import yaml
            with open(args.workflows, encoding="utf-8") as handle:
                workflows = yaml.safe_load(handle)
        except Exception as exc:
            print("could not read %s: %s" % (args.workflows, exc), file=sys.stderr)
            return 2
        if isinstance(workflows, dict):
            workflows = workflows.get("workflows") or []
        browser, judge = templates(workflows, rubric)
        os.makedirs(args.template, exist_ok=True)
        for name, payload in (("browser_results.json", browser),
                              ("judge.json", judge)):
            path = os.path.join(args.template, name)
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
            print("wrote %s" % path)
        return 0

    declared = None
    try:
        import yaml
        with open(args.workflows, encoding="utf-8") as handle:
            declared = yaml.safe_load(handle)
        if isinstance(declared, dict):
            declared = declared.get("workflows") or []
    except Exception as exc:
        print("could not read %s: %s" % (args.workflows, exc), file=sys.stderr)

    result = build(_load(args.pytest), _load(args.browser), _load(args.judge),
                   rubric, [x for x in args.invalid.split(",") if x], declared,
                   deploy_failed=args.deploy_failed)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)

    with open(args.reward_out, "w", encoding="utf-8") as handle:
        json.dump({"reward": result["reward"]}, handle)

    print("combined_score: %s  (%s)" % (result["combined_score"],
                                        result["scoring"]["basis"]))
    for name, component in result["components"].items():
        print("  %-9s %-8s %s/%s" % (name, round(component["score"], 4),
                                     component.get("passed"),
                                     component.get("total") or component.get("criteria")))
    return 0

def self_test() -> int:
    assert combine(0.38461538461538464, 0.8604651162790697, 0.397959) == 0.4744
    assert combine(1.0, 1.0, 1.0) == 1.0
    assert combine(0.0, 1.0, 1.0) == 0.0

    spec = [{"id": "w", "substeps": [{"kind": "browser", "do": "s%d" % i}
                                     for i in range(10)]}]
    def marks(flags, critical=None):
        steps = [{"kind": "browser", "passed": f} for f in flags]
        declared = [{"id": "w", "substeps": [
            dict({"kind": "browser", "do": "s%d" % i},
                 **({"critical": True} if critical == i else {}))
            for i in range(len(flags))]}]
        return workflow_component(declared, {"workflows": [{"id": "w", "substeps": steps}]}, None)
    assert marks([True] * 9 + [False])["passed"] == 1
    assert marks([True] * 8 + [False] * 2)["passed"] == 0
    assert marks([True] * 9 + [False], critical=9)["passed"] == 0

    mixed = workflow_component(
        [{"id": "w", "substeps": [{"kind": "pytest", "test": "t.py::a"},
                                  {"kind": "browser", "do": "look"}]}],
        {"workflows": [{"id": "w", "substeps": [{"kind": "browser", "passed": True}]}]},
        {"results": {"tests": [{"name": "t.py::a", "status": "passed"}]}})
    assert mixed["passed"] == 1 and mixed["workflows"][0]["substeps_graded"] == 2

    blank = workflow_component(spec, {"workflows": []}, None)
    assert blank["total"] == 0 and blank["missing"]

    partial = workflow_component(
        spec, {"workflows": [{"id": "w", "substeps":
                              [{"kind": "browser", "passed": True}]}]}, None)
    assert partial["total"] == 0 and partial["missing"], partial

    unreviewed = workflow_component(
        [{"id": "w", "substeps": [{"kind": "pytest", "test": "t.py::a"},
                                  {"kind": "browser", "do": "look"}]}],
        None, {"results": {"tests": [{"name": "t.py::a", "status": "passed"}]}})
    assert unreviewed["total"] == 0 and unreviewed["missing"], unreviewed

    two = [{"id": "a", "substeps": [{"kind": "browser", "do": "x"}]},
           {"id": "b", "substeps": [{"kind": "browser", "do": "y"}]}]
    half = workflow_component(
        two, {"workflows": [{"id": "a", "substeps":
                             [{"kind": "browser", "passed": True}]}]}, None)
    assert half["score"] == 1.0 and half["total"] == 1 and half["missing"], half

    skewed = workflow_component(
        [{"id": "w", "substeps": [{"kind": "browser", "do": "a"},
                                  {"kind": "browser", "do": "b",
                                   "critical": True}]}],
        {"workflows": [{"id": "w", "substeps":
                        [{"kind": "browser", "passed": True}]}]}, None)
    assert skewed["total"] == 0 and skewed["missing"], skewed

    assert _criterion_weight({"number": "R17", "score": -5}) == 5.0
    assert _criterion_weight({"number": "R1", "score": 0,
                              "importance": "important"}) == 0.0
    assert _criterion_weight({"number": "R2",
                              "importance": "critically_important"}) == 5.0

    sheet, _ = templates(
        [{"id": "w", "substeps": [{"kind": "pytest", "test": "t.py::a"},
                                  {"kind": "browser", "do": "look"}]}], [])
    assert [s["kind"] for s in sheet["workflows"][0]["substeps"]] == ["browser"]

    ctrf = {"results": {"summary": {"tests": 4, "passed": 2, "failed": 1, "skipped": 1}}}
    assert pytest_component(ctrf)["score"] == 2 / 3

    judge = {"dimensions": {
        "R1_x": {"number": "R1", "weight": 0.5, "score": 1.0},
        "R2_x": {"number": "R2", "weight": 0.25, "score": 0.0},
        "R3_x": {"number": "R3", "weight": 0.25, "score": None}}}
    got = rubric_component(judge, [])
    assert got["score"] == round(0.5 / 0.75, 6), got["score"]
    assert got["unresolved"] == 1
    assert got["coverage"] == round(2 / 3, 6) and got["weighted_coverage"] == 0.75
    assert got["score_discounted"] == round(0.5 / 0.75 * (2 / 3), 6)

    neg = {"dimensions": {
        "R17_x": {"number": "R17", "weight": 1.0, "is_positive": False,
                  "satisfied": True, "passed": None, "score": None}}}
    assert rubric_component(neg, [])["score"] == 0.0
    neg["dimensions"]["R17_x"]["satisfied"] = False
    assert rubric_component(neg, [])["score"] == 1.0
    pos = {"dimensions": {
        "R1_x": {"number": "R1", "weight": 1.0, "is_positive": True,
                 "satisfied": True, "passed": None, "score": None}}}
    assert rubric_component(pos, [])["score"] == 1.0

    both = {"dimensions": {
        "R1_x": {"number": "R1", "weight": 1.0, "is_positive": True,
                 "satisfied": True, "passed": False, "score": None}}}
    assert rubric_component(both, [])["score"] == 0.0

    held = build(ctrf, None, None, [], declared=spec)
    assert held["combined_score"] is None
    assert held["reward"] == round(2 / 3 * 0.25, 4), held["reward"]
    assert held["weights_applied"] == {"pytest": 1.0}
    assert held["scoring"]["basis"].startswith("partial_pending_human_review")
    perfect_pytest = build({"results": {"summary": {"tests": 9, "passed": 9}}},
                           None, None, [], declared=spec)
    assert perfect_pytest["components"]["pytest"]["score"] == 1.0
    assert perfect_pytest["reward"] == 0.25, perfect_pytest["reward"]
    assert measured({"workflow": {"score": 1.0}, "pytest": {"score": 1.0},
                     "rubric": {"missing": True, "score_discounted": 0.0}})[0] == 0.75
    assert measured({"workflow": {"score": 0.5}, "pytest": {"score": 0.5},
                     "rubric": {"score_discounted": 0.5}})[0] == combine(0.5, 0.5, 0.5)

    fault = build(ctrf, None, None, [], ["no_tests_collected"], declared=spec)
    assert fault["combined_score"] == 0.0 and fault["invalid"] == ["no_tests_collected"]

    gone = build(None, None, None, [], declared=spec, deploy_failed=True)
    assert gone["combined_score"] == 0.0 and gone["reward"] == 0.0
    assert gone["scoring"]["basis"] == "deploy_failed"
    assert gone["invalid"] == [] and gone["pending"] == []

    print("score.py self-test OK")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Derive every generated canonical artifact in this bundle from one source.

Reads solution/trinity/grounding.yaml and writes:

    solution/trinity/TRUTH.md          the human-readable golden trajectory
    solution/trinity/rubrics.json      the reference-based rubric
    solution/trinity/test_output.py    the deterministic tests compiled from that rubric
    tests/rubric.json                  the judged criteria the runtime judge reads

The fourth target is why one source now feeds both rubrics. `rubric_items`
describes the answer key and is mostly `compiled`, meaning bound to a committed
pytest function. `judged_criteria` describes what only a person can see, and is
what `run_rubric.py` grades against. They stay separate because they observe
different surfaces; they share a source so neither can drift from the brief.

Every judged criterion is BINARY and carries no agent-facing prefix. The judge
runs after the session has ended, so a criterion opening "The agent" asks about
a process nobody can observe; the claim is stated about the running product and
`evaluation_rule` names the yes case and the no case.

The whole answer-key family lives in one directory. test_output.py moved out of
tests/ with it: its wrappers all skip and cite the section test that carries the
real assertion, so it was never collected for score, while sitting in the pytest
tree made it fail G31 (no pytest.skip) and G8 (every test is cited by a substep)
by construction.

Nothing here invokes a model, a network, a clock, a locale, or a random source.
Every criterion string is a frozen literal of grounding.yaml, so regeneration is
byte-identical under two different host identities. Drift between what this emits
and what the bundle commits is a defect, never a variation -- the truth gate
(G48) re-runs `recompute.py --check` and fails on any difference.

Output is written with write_bytes(text.encode("utf-8")) and read back with
read_bytes for --check, so the newline is always "\\n" and the comparison is
byte-exact on win32 and linux alike. text-mode write_text would translate "\\n"
to the platform separator and fingerprint the authoring host.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

BANNER = "GENERATED SECTION. DO NOT HAND-EDIT."
SOURCE = "solution/trinity/grounding.yaml"
GENERATOR = "solution/trinity/recompute.py"
# Identifies these bytes independently of the grader pin, which does not cover this
# file: vendor/grader-<v>/MANIFEST.json hashes the eight grader files and not this one.
GENERATOR_REVISION = "truth-generator-4"

# The closed rubrics.json item schema (FORGE 9g). recompute.py emits exactly
# these keys, in this order; compiled_test stays in grounding.yaml and reaches
# the bundle only as a test_output.py citation, never as a rubric field.
RUBRIC_SCHEMA = ["id", "dimension", "weight", "evaluation_target",
                 "criterion", "judgment", "evidence", "mode"]

# tests/rubric.json. The first eight are the fields the vendored run_rubric.py
# requires present -- it drops any criterion missing one, and any criterion whose
# dimension is outside its seven. `evaluation_rule` is the ninth: run_rubric
# checks for MISSING fields only, so an extra key reaches the judge untouched.
JUDGED_SCHEMA = ["number", "criterion", "is_positive", "type", "dimension",
                 "evaluation_target", "importance", "score", "evaluation_rule"]
JUDGED_DIMENSIONS = ("instruction_following", "functionality", "ux_flow",
                     "ui_visual", "motion", "accessibility", "responsiveness")
BANNED_OPENERS = ("the agent", "the response")

# The dependency map that stood here fed a table in TRUTH.md and nothing else.
# Both are gone: reference/M-truth-contract.md is the one place that describes
# which files descend from grounding.yaml, and restating it inside a generated
# artifact gave the list a second home that could drift from the first.


def load(root: Path) -> dict:
    g = yaml.safe_load((root / "solution" / "trinity" / "grounding.yaml")
                       .read_text(encoding="utf-8"))
    _validate(g)
    return g


def _validate(g: dict) -> None:
    """Fail loudly on a grounding.yaml the generator cannot honour. A generator
    that emits an empty artifact on bad input is the silent pass the contract
    forbids."""
    for key in ("task_name", "canary_block", "literals", "golden_trajectory",
                "rejected_routes", "rubric_items"):
        if key not in g:
            raise SystemExit(f"recompute: grounding.yaml is missing required key '{key}'")
    for step in g["golden_trajectory"]:
        for key in ("step", "action", "established_state", "survives", "checkers"):
            if key not in step:
                raise SystemExit(
                    f"recompute: trajectory step {step.get('step', '?')!r} is missing '{key}'")
    for item in g["rubric_items"]:
        for key in RUBRIC_SCHEMA:
            if key not in item:
                raise SystemExit(f"recompute: rubric item {item.get('id', '?')!r} is missing '{key}'")
        if item["mode"] not in ("compiled", "judged"):
            raise SystemExit(
                f"recompute: rubric item {item['id']!r} has mode {item['mode']!r} "
                f"(expected 'compiled' or 'judged')")
        if item["mode"] == "compiled" and "compiled_test" not in item:
            raise SystemExit(
                f"recompute: compiled rubric item {item['id']!r} names no compiled_test")
    for route in g["rejected_routes"]:
        for key in ("route", "rejected_because", "known_wrong_control"):
            if key not in route:
                raise SystemExit(f"recompute: a rejected_route is missing '{key}'")
    for item in g.get("judged_criteria") or []:
        for key in JUDGED_SCHEMA:
            if key == "number":
                continue
            if key not in item:
                raise SystemExit(
                    f"recompute: judged criterion {item.get('id', '?')!r} is missing '{key}'")
        if item["dimension"] not in JUDGED_DIMENSIONS:
            raise SystemExit(
                f"recompute: judged criterion {item['id']!r} has dimension "
                f"{item['dimension']!r}, which the runtime judge would drop "
                f"(legal: {', '.join(JUDGED_DIMENSIONS)})")
        opener = str(item["criterion"]).strip().lower()
        for banned in BANNED_OPENERS:
            if opener.startswith(banned):
                raise SystemExit(
                    f"recompute: judged criterion {item['id']!r} opens {banned!r}. "
                    f"The judge runs after the session ends; state the claim about "
                    f"the running product")
        rule = str(item["evaluation_rule"])
        if "yes" not in rule.lower() or "no" not in rule.lower():
            raise SystemExit(
                f"recompute: judged criterion {item['id']!r} has an evaluation_rule "
                f"that does not name both the yes case and the no case. The verdict "
                f"is binary")


def truth_md(g: dict) -> str:
    # Opens on its content. The banner, the source line and the privacy
    # paragraph were removed at the tasker's instruction: each restated in prose
    # a rule already enforced elsewhere -- the hand-edit ban by G48's
    # regeneration check, the privacy by CON-6 and the layout gate -- and a file
    # that spends its first screen describing itself buries the trajectory it
    # exists to carry.
    out = ["# TRUTH.md", "", "## Canary", ""]
    out += [f"- `{line}`" for line in g["canary_block"]]
    out += ["", "## Ordered path", ""]
    for index, step in enumerate(g["golden_trajectory"], start=1):
        out.append(f"### {index}. {step['step']}")
        out.append("")
        out.append(f"**Action.** {step['action']}")
        out.append("")
        out.append(f"**Established state.** {step['established_state']}")
        out.append("")
        out.append(f"**Survives.** {step['survives']}")
        out.append("")
        if step.get("obligations"):
            out.append("**Obligations.** " + ", ".join(f"`{o}`" for o in step["obligations"]))
            out.append("")
        out.append("**Satisfied checkers.** " + ", ".join(f"`{c}`" for c in step["checkers"]))
        out.append("")
    out += ["## Rejected routes", ""]
    for route in g["rejected_routes"]:
        out.append(f"- **{route['route']}** {route['rejected_because']} "
                   f"Known-wrong control `{route['known_wrong_control']}`.")
    out += ["", "## Pinned literals", "", "| Name | Value |", "|---|---|"]
    for name, value in g["literals"].items():
        out.append(f"| `{name}` | `{value}` |")
    out.append("")
    return "\n".join(out)


def rubrics_json(g: dict) -> str:
    items = [{k: item[k] for k in RUBRIC_SCHEMA} for item in g["rubric_items"]]
    total = sum(i["weight"] for i in items)
    compiled = sum(i["weight"] for i in items if i["mode"] == "compiled")
    body = {
        "banner": BANNER,
        "source_of_truth": SOURCE,
        "task": g["task_name"],
        "schema": RUBRIC_SCHEMA,
        "compiled_weight_share": round(compiled / total, 6) if total else 0.0,
        "items": items,
    }
    return json.dumps(body, indent=2, sort_keys=False, ensure_ascii=False) + "\n"


def judged_rubric_json(g: dict) -> str:
    """Render tests/rubric.json: the criteria the runtime judge grades against.

    Numbering is assigned here, in source order, so R1..Rn is sequential with no
    gaps by construction rather than by an author remembering to renumber after a
    deletion. `items`, `anchor` and `facet` stay in grounding.yaml: they are
    authoring provenance for the coverage gates and never reach the judge, which
    is frozen at the nine fields below.
    """
    out = []
    for index, item in enumerate(g["judged_criteria"], start=1):
        row = {"number": f"R{index}"}
        for key in JUDGED_SCHEMA[1:]:
            row[key] = item[key]
        out.append(row)
    return json.dumps(out, indent=2, sort_keys=False, ensure_ascii=False) + "\n"


def test_output_py(g: dict) -> str:
    """Compile every deterministically reducible rubric item into a test.

    Each compiled test carries the implied relation only. No criterion prose and
    no reference text crosses into it, because the compiled test is graded
    machinery and the criterion is authoring material. The real assertion lives
    in the committed grader named by compiled_test; this test cites it.
    """
    lines = [
        '"""Compiled rubric tests.',
        "",
        BANNER,
        "",
        f"Compiled from `solution/trinity/rubrics.json`, which is generated from `{SOURCE}`.",
        "Each test below carries the relation its rubric item implies and no",
        "criterion prose. The graded relation is discharged by the committed test",
        "it names, which lives in the one merged pytest module.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "import pytest",
        "",
    ]
    for item in g["rubric_items"]:
        if item["mode"] != "compiled":
            continue
        lines += [
            f"def test_rubric_{item['id'].lower()}(request):",
            f'    """Rubric item {item["id"]}, dimension {item["dimension"]},'
            f' weight {item["weight"]}, target {item["evaluation_target"]}."""',
            "    outcome = request.session.testscollected",
            "    assert outcome >= 0",
            # No comment here. It said what the skip reason on the next line
            # already says, and G48 reads the relation out of the skip reason,
            # not out of prose. The bundle carries no comments (G54).
            f'    pytest.skip("relation discharged by {item["compiled_test"]}")',
            "",
            "",
        ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    # solution/trinity/recompute.py -> the bundle root is three levels up.
    root = Path(__file__).resolve().parents[2]
    g = load(root)
    trinity = root / "solution" / "trinity"
    targets = {
        trinity / "TRUTH.md": truth_md(g),
        trinity / "rubrics.json": rubrics_json(g),
        trinity / "test_output.py": test_output_py(g),
    }
    if g.get("judged_criteria"):
        targets[root / "tests" / "rubric.json"] = judged_rubric_json(g)
    check = "--check" in sys.argv
    drift = []
    for path, text in targets.items():
        want = text.encode("utf-8")
        if check:
            have = path.read_bytes() if path.is_file() else b""
            if have != want:
                drift.append(str(path.relative_to(root)).replace("\\", "/"))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(want)
    if check and drift:
        print("recompute: drift in " + ", ".join(drift), file=sys.stderr)
        return 1
    print("recompute: " + ("no drift" if check else f"wrote {len(targets)} artifacts"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

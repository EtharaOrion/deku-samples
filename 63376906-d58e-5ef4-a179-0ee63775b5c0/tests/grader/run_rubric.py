#!/usr/bin/env python3
"""Qualitative rubric judge for Deku (PLAN.md 4.5 grader determinism).

DIAGNOSTIC ONLY. PLAN.md 1.4 and 4.7: `judge_score` is recorded but NEVER
drives training -- a judge-only reward is trivially gamed. This tool:

  * writes its own artifact (``judge.json``), never ``reward.json``;
  * never imports, calls, or influences ``grader/score.py``;
  * states advisory-only status in ``--help`` and in the emitted JSON.

The binary substep grader (``run_workflows.py``) owns the RL reward. This
file owns the human-facing quality read. The two must not be blurred.

Drives a real Chromium browser through the deployed app, gathers objective
evidence (screenshots, computed styles, real motion, console errors, a11y
snapshots) across desktop / tablet / mobile viewports, and scores against
the rubric in the spec:

    instruction_following  0.30
    functionality          0.25
    ux_flow                0.15
    ui_visual              0.15
    motion                 0.05
    accessibility          0.05
    responsiveness         0.05
                           -----
                           1.00

Each dimension is graded by a separate LLM call, so a failure in one does
not corrupt the others. The grader is pinned in-source (PLAN.md 4.5) and
recorded in ``meta.grader_model``.

Reuses ``Browser`` and ``Anthropic`` from ``run_workflows``; extends the
tool set with page_screenshot (base64 image), page_styles, page_motion,
page_console, page_a11y, set_viewport.
"""

from __future__ import annotations

import argparse
import base64
import io
import hashlib
import pathlib
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import httpx

try:
    from run_workflows import (  # type: ignore
        Anthropic, Browser, OpenAI, read_credentials,
        _resolve_provider, _wire_dialect,
        GRADER_TEMPERATURE, GRADER_SEED,
    )
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from run_workflows import (  # type: ignore
        Anthropic, Browser, OpenAI, read_credentials,
        _resolve_provider, _wire_dialect,
        GRADER_TEMPERATURE, GRADER_SEED,
    )


DEFAULT_JUDGE_MODEL = (os.environ.get("DEKU_JUDGE_MODEL_DEFAULT")
                       or "anthropic/claude-sonnet-4-6")
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_VIEWPORTS = "1920x1200,768x1024,390x844"
DEFAULT_MAX_STEPS = 40
DEFAULT_CREDENTIALS_PATH = "/app/USER_README.md"
LLM_TIMEOUT_SEC = 420
ACTION_TIMEOUT_MS = 15000
JUDGE_MAX_TOKENS = 4096


ADVISORY_NOTE = ("Diagnostic only. PLAN.md 1.4: judge_score never drives training. "
                 "A judge-only reward is trivially gamed. The binary substep grader "
                 "owns the RL reward; this score is for human review only.")


def _slug(title: str) -> str:
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


IMPORTANCE_WEIGHT = {
    "critically_important": 5.0,
    "important": 3.0,
    "somewhat_important": 1.0,
}
DEFAULT_IMPORTANCE_WEIGHT = 1.0


JUDGE_PANEL = [m.strip() for m in (os.environ.get("DEKU_JUDGE_PANEL")
                                   or DEFAULT_JUDGE_MODEL).split(",") if m.strip()]


def short_model(model: str) -> str:
    """`claude-opus-5` -> `opus-5`, for readable per-judge keys."""
    return model.replace("claude-", "", 1)


def council_verdict(votes: list[dict], is_positive: bool, weight: float,
                    criterion: str, number: str) -> dict:
    """Fold each member's vote into one criterion record.

    `satisfied` answers the criterion as written. `passed` answers whether the
    APP is in good shape, which for a NEGATIVE criterion is the inverse: an
    anti-pattern that is not satisfied is an anti-pattern that is absent, and the
    app passes. Conflating the two rewards an app for being broken.
    """
    live = [v for v in votes if v.get("satisfied") is not None]
    sats = [bool(v["satisfied"]) for v in live]
    confs = [float(v.get("confidence") or 0.0) for v in live]

    if not live:
        satisfied, resolved = False, "no_votes"
    elif len(set(sats)) == 1:
        satisfied, resolved = sats[0], "unanimous"
    else:
        satisfied = live[max(range(len(live)), key=lambda i: confs[i])]["satisfied"]
        resolved = "disagreement"

    unsure = any(c < HUMAN_REVIEW_THRESHOLD for c in confs) if confs else True
    needs_human = unsure or resolved in ("disagreement", "no_votes")

    return {
        "number": number,
        "weight": weight if is_positive else -weight,
        "is_positive": is_positive,
        "criterion": criterion,
        "satisfied": bool(satisfied),
        "passed": bool(satisfied) if is_positive else (not bool(satisfied)),
        "resolved_by": resolved,
        "human_eval": "yes" if needs_human else "no",
        "voters": len(live),
        "judges": [v["judge"] for v in votes],
        "satisfied_by_judge": [v.get("satisfied") for v in votes],
        "confidence_by_judge": [v.get("confidence") for v in votes],
        "rationales_by_judge": [v.get("rationale", "") for v in votes],
        "score": 1.0 if (bool(satisfied) if is_positive else not bool(satisfied)) else 0.0,
    }


def weighted_rubric_score(criteria: list[dict]) -> float:
    """Points earned over points available.

        numerator    weight of every POSITIVE criterion that passed
                     minus the weight of every NEGATIVE criterion that failed
        denominator  weight of every POSITIVE criterion

    Negative criteria are penalties, not credit: they cannot raise the score, and
    an anti-pattern the app exhibits subtracts from what it earned. With no
    negative failing, this reduces to passed/possible -- which reproduces the
    reference implementation exactly (26.0 / 42.0 = 0.6190).
    """
    possible = sum(abs(c["weight"]) for c in criteria if c["is_positive"]) or 1.0
    earned = sum(abs(c["weight"]) for c in criteria if c["is_positive"] and c["passed"])
    penalty = sum(abs(c["weight"]) for c in criteria
                  if not c["is_positive"] and not c["passed"])
    return round(max(0.0, min(1.0, (earned - penalty) / possible)), 4)


RECORDED_TARGET = "recorded_ui"
FRAME_INTERVAL_MS = int(os.environ.get("DEKU_CAPTURE_FRAME_MS", "100"))
MAX_FRAMES = int(os.environ.get("DEKU_CAPTURE_MAX_FRAMES", "14"))

INTERACTIONS = {
    "scroll_page":      "scroll from top to bottom in steps",
    "hover_primary":    "move the pointer across the page and onto the primary action",
    "reload_cold":      "reload with a cleared cache and watch the first paint",
    "navigate_and_back":"open the first internal link, then go back",
    "idle":             "record without interacting, for load-time behaviour",
}


def record_capture(pw, url: str, cap: dict, out_dir: Path,
                   credentials_text: str = "") -> list[dict]:
    """Film one interaction and return its frames, oldest first.

    Frames rather than a video file, because the judge reads images: a strip of
    stills spaced in time is a movie as far as a vision model is concerned, and
    it needs no decoder on the judge's side.

    Never raises. A capture that fails yields no frames, the criterion falls back
    to the still evidence, and its confidence drops -- which routes it to a human
    rather than scoring the app on footage that was never taken.
    """
    route = cap.get("route", "/")
    interaction = cap.get("interaction", "idle")
    duration = min(int(cap.get("duration_ms", 4000)), 10000)
    if interaction not in INTERACTIONS:
        print(f"  [warn] unknown capture interaction {interaction!r}; skipping",
              file=sys.stderr)
        return []

    frames: list[dict] = []
    browser = context = None
    try:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        if credentials_text:
            status = try_login(page, credentials_text, url)
            if status.startswith("LOGIN FAILED") or "unverified" in status:
                print(f"  [warn] capture {interaction} filming logged OUT: {status}",
                      file=sys.stderr)

        page.goto(url.rstrip("/") + route, wait_until="domcontentloaded",
                  timeout=ACTION_TIMEOUT_MS)

        steps = max(2, min(MAX_FRAMES, duration // FRAME_INTERVAL_MS))
        for i in range(steps):
            if interaction == "scroll_page":
                page.evaluate("(f) => scrollTo({top: document.body.scrollHeight * f,"
                              " behavior: 'smooth'})", i / max(1, steps - 1))
            elif interaction == "hover_primary" and i == 1:
                for sel in ("button", "[role=button]", "a"):
                    try:
                        page.locator(sel).first.hover(timeout=2000); break
                    except Exception:
                        continue
            elif interaction == "navigate_and_back" and i == steps // 2:
                try:
                    page.locator("a[href^='/']").first.click(timeout=2000)
                except Exception:
                    pass
            elif interaction == "reload_cold" and i == 0:
                page.reload(wait_until="commit")

            png = page.screenshot(type="jpeg", quality=55, full_page=False)
            frames.append({"t_ms": i * FRAME_INTERVAL_MS,
                           "b64": base64.b64encode(png).decode("ascii")})
            page.wait_for_timeout(FRAME_INTERVAL_MS)

        out_dir.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(frames):
            (out_dir / f"{interaction}_{i:02d}.jpg").write_bytes(
                base64.b64decode(fr["b64"]))
    except Exception as exc:
        print(f"  [warn] capture {interaction} on {route} failed: {exc}", file=sys.stderr)
    finally:
        for c in (context, browser):
            try:
                if c: c.close()
            except Exception:
                pass
    return frames


def frame_blocks(frames: list[dict]) -> list[dict]:
    """Frames as ordered image blocks, each labelled with its offset."""
    out: list[dict] = []
    for fr in frames:
        out.append({"type": "text", "text": f"frame @ {fr['t_ms']}ms"})
        out.append({"type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg",
                               "data": fr["b64"]}})
    return out


def capture_key(cap: dict) -> str:
    """Identity of a recording, so criteria wanting the same footage share it."""
    return "{}|{}|{}".format(cap.get("route", "/"),
                             cap.get("interaction", "idle"),
                             int(cap.get("duration_ms", 4000)))


def load_task_rubric(path: Path) -> list[dict]:
    """Read tests/rubric.json into the (name, weight, asks) shape used above.

    Criteria carry `is_positive`. A NEGATIVE criterion describes an anti-pattern
    the app must not exhibit -- "presents a retried set as a second visible
    entry". The judge is asked whether the anti-pattern is PRESENT, and the score
    is inverted, so detecting it lowers the composite. Grading a negative
    criterion the same way as a positive one rewards the app for being broken.
    """
    raw = json.loads(path.read_text())
    if isinstance(raw, dict):
        raw = raw.get("criteria")
    if not isinstance(raw, list):
        raise ValueError(
            f"{path} must be a JSON array of criteria, or an object carrying "
            f"one under `criteria`")

    out: list[dict] = []
    for i, c in enumerate(raw):
        number = str(c.get("number") or f"R{i + 1}")
        criterion = str(c.get("criterion") or "").strip()
        if not criterion:
            raise ValueError(f"{path}: criterion {number} has no `criterion` text")
        positive = bool(c.get("is_positive", True))
        weight = IMPORTANCE_WEIGHT.get(
            str(c.get("importance", "")), DEFAULT_IMPORTANCE_WEIGHT
        )
        if positive:
            asks = (
                f"{criterion}\n\n"
                "Score 1.0 if the deployed app fully satisfies this, 0.0 if it does "
                "not at all, and in between for partial. Judge ONLY this criterion. "
                "Cite concrete evidence -- computed styles, screenshots, the DOM, "
                "console output -- not impressions."
            )
        else:
            asks = (
                f"ANTI-PATTERN -- score how strongly the app AVOIDS this:\n\n"
                f"{criterion}\n\n"
                "Score 1.0 if the app does NOT exhibit this at all, 0.0 if it "
                "clearly does. This describes a defect, so a high score means the "
                "defect is absent. Cite concrete evidence."
            )
        target = str(c.get("evaluation_target", ""))
        capture = c.get("capture") or {}
        if target == RECORDED_TARGET and not capture:
            raise ValueError(
                f"{path}: criterion {number} is {RECORDED_TARGET} but declares no "
                f"`capture`. A recorder cannot film 'the app' -- name the route, "
                f"the interaction ({sorted(INTERACTIONS)}) and a duration_ms.")
        out.append({
            "evaluation_target": target,
            "evaluation_rule": str(c.get("evaluation_rule", "")).strip(),
            "type": str(c.get("type", "")),
            "capture": capture,
            "key": f"{number}_{c.get('dimension', 'unspecified')}",
            "number": number,
            "dimension": str(c.get("dimension", "unspecified")),
            "importance": str(c.get("importance", "")),
            "is_positive": positive,
            "raw_weight": weight,
            "declared_score": c.get("score"),
            "asks": asks,
            "criterion": criterion,
        })

    total = sum(c["raw_weight"] for c in out) or 1.0
    for c in out:
        c["weight"] = round(c["raw_weight"] / total, 6)
    return out


def rubric_verdict(score: float) -> str:
    """A readable label beside the verdict. Presentation only -- never arithmetic.

    A criterion is satisfied or it is not (see REPORT_TOOL), so `score` is 1.0 or
    0.0 and this label is a direct restatement of it. The cutoff logic below is
    retained only so that a judge.json written before 2026-08-17 -- when the
    rubric did measure degree -- still renders readably.

    Thresholds match the scoring guide the judge is given:
        1.0 fully meets · 0.8 mostly meets · 0.5 partial · 0.2 barely · 0.0 absent

    `partial` covers 0.5, which is also what the judge is told to return when a
    criterion could not be assessed from the evidence -- so a `partial` deserves a
    look at its rationale before being read as a defect.
    """
    if score >= 0.8:
        return "pass"
    if score > 0.0:
        return "partial"
    return "fail"


def compute_task_rubric_score(criteria: list[dict], graded: dict[str, dict]) -> float:
    """Normalised weighted mean of the per-criterion scores.

    No functionality cap here: unlike the generic rubric there is no single
    `functionality` dimension to tie a ceiling to. The cap existed to stop
    aesthetics disguising a broken app -- a task rubric is mostly behavioural, and
    the reward is set by workflows + pytest regardless, so the guard is redundant.
    """
    total = 0.0
    for c in criteria:
        d = graded.get(c["key"]) or {}
        score = max(0.0, min(1.0, float(d.get("score", 0.0) or 0.0)))
        total += score * c["weight"]
    return round(min(1.0, max(0.0, total)), 4)


def safe_dimension(name: str, weight: float, asks: str,
                   runner: Callable[[], dict]) -> dict:
    """Wrap a per-dimension runner so any exception yields a complete dict.

    Contract: the returned dict is always writable and always contains
    score/weight/rationale/evidence, matching the schema in judge.json.
    """
    try:
        result = runner()
        if not isinstance(result, dict):
            raise TypeError(f"runner returned {type(result).__name__}, not dict")
        satisfied = bool(result.get("satisfied", False))
        return {
            "satisfied": satisfied,
            "score": 1.0 if satisfied else 0.0,
            "confidence": result.get("confidence"),
            "weight": weight,
            "rationale": str(result.get("rationale", ""))[:2000],
            "evidence": list(result.get("evidence", []))[:20],
            "asks": asks,
        }
    except Exception as exc:
        return {
            "satisfied": False,
            "score": 0.0,
            "confidence": 0.0,
            "weight": weight,
            "rationale": f"exception: {exc.__class__.__name__}: {exc}"[:2000],
            "evidence": [],
            "asks": asks,
        }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_viewport(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d+)x(\d+)", s.strip())
    if not m:
        raise argparse.ArgumentTypeError(f"viewport must be WxH, got {s!r}")
    return int(m.group(1)), int(m.group(2))


def parse_viewport_list(s: str) -> list[tuple[int, int]]:
    return [parse_viewport(x) for x in s.split(",") if x.strip()]


class JudgeAnthropic(Anthropic):
    """Anthropic client with a rubric-sized output budget.

    Only the default max_tokens differs. The transport, including 429/5xx
    backoff, is inherited deliberately -- an independent copy of message() is how
    the judge previously missed the retry and lost every dimension to rate
    limiting.
    """

    def message(self, system: str, messages: list[dict], tools: list[dict],  # type: ignore[override]
                max_tokens: int = JUDGE_MAX_TOKENS) -> dict:
        return super().message(system, messages, tools, max_tokens=max_tokens)


def _temperature_applied(model: str) -> bool:
    """Did the configured temperature actually reach the provider for `model`?

    Every shipped transport sends it, so today this is simply whether one was
    configured. It stays a per-model function because the report records the
    flag per judge, and recording a configured value that never took effect is
    exactly the claim this flag exists to prevent -- see _sends_seed, where a
    provider really does refuse the parameter.
    """
    del model  # no provider currently refuses temperature
    return GRADER_TEMPERATURE is not None


class JudgeOpenAI(OpenAI):
    """Chat Completions judge with a rubric-sized output budget.

    Same rationale as JudgeAnthropic: only the default max_tokens differs, the
    shared transport (retry/backoff/usage) is inherited. Serves every provider
    whose wire dialect is "openai", Gemini and custom gateways included.
    """

    def message(self, system: str, messages: list[dict], tools: list[dict],  # type: ignore[override]
                max_tokens: int = JUDGE_MAX_TOKENS) -> dict:
        return super().message(system, messages, tools, max_tokens=max_tokens)


def _make_judge_llm(model: str):
    """Pick the judge client for `model`, mirroring run_workflows.make_llm.

    An Anthropic-dialect model -> JudgeAnthropic. Every OpenAI-dialect
    provider, Gemini and custom gateways included -> JudgeOpenAI. This keeps the
    council (DEKU_JUDGE_PANEL) working with mixed providers: each member gets
    the right transport for its own name.
    """
    if _wire_dialect(model) == "anthropic":
        return JudgeAnthropic(model=model)
    return JudgeOpenAI(model=model)


def cap_screenshot(page, out_path: Path, max_bytes: int = 900_000) -> tuple[str, str]:
    """Save a viewport screenshot and return (path, base64). Downscale by JPEG
    quality if PNG exceeds max_bytes -- Anthropic image blocks want < 1.5 MB.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    png = page.screenshot(full_page=True, type="png")
    if len(png) <= max_bytes:
        out_path.write_bytes(png)
        return str(out_path), base64.b64encode(png).decode("ascii")
    for q in (85, 70, 55, 40, 25):
        jpg = page.screenshot(full_page=True, type="jpeg", quality=q)
        if len(jpg) <= max_bytes:
            jpg_path = out_path.with_suffix(".jpg")
            jpg_path.write_bytes(jpg)
            return str(jpg_path), base64.b64encode(jpg).decode("ascii")
    jpg_path = out_path.with_suffix(".jpg")
    jpg_path.write_bytes(jpg)
    return str(jpg_path), base64.b64encode(jpg).decode("ascii")


_STYLES_JS = r"""
() => {
  const wanted = ['color','background-color','font-family','font-size','font-weight',
                  'line-height','letter-spacing','border-radius','border','box-shadow',
                  'padding','margin','text-transform'];
  const pick = (el) => {
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of wanted) o[p] = cs.getPropertyValue(p).trim();
    return o;
  };
  const selectors = ['body','h1','h2','h3','p','button','input','select','textarea',
                     'a','table','th','td','[role="button"]','.card','main','nav','header'];
  const out = {};
  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll(sel)).filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).slice(0, 3);
    if (!nodes.length) continue;
    out[sel] = nodes.map(pick);
  }
  return out;
}
"""

_MOTION_JS = r"""
() => {
  const animations = document.getAnimations().map(a => ({
    id: a.id, playState: a.playState,
    duration: (a.effect && a.effect.getTiming && a.effect.getTiming().duration) || null,
    easing:   (a.effect && a.effect.getTiming && a.effect.getTiming().easing)   || null,
  })).slice(0, 40);
  const tr = new Map();
  const nodes = document.querySelectorAll('*');
  let scanned = 0;
  for (const el of nodes) {
    if (scanned++ > 400) break;
    const cs = getComputedStyle(el);
    const key = [cs.transitionProperty, cs.transitionDuration,
                 cs.transitionTimingFunction].join('|');
    if (cs.transitionDuration && cs.transitionDuration !== '0s') {
      tr.set(key, (tr.get(key) || 0) + 1);
    }
    if (cs.animationName && cs.animationName !== 'none') {
      const k = 'anim|' + [cs.animationName, cs.animationDuration,
                           cs.animationTimingFunction].join('|');
      tr.set(k, (tr.get(k) || 0) + 1);
    }
  }
  const transitions = Array.from(tr.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, n]) => ({ key: k, count: n }));
  return { active_animations: animations, transitions,
           reduced_motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
}
"""

_A11Y_JS = r"""
() => {
  const iconButtons = [];
  for (const b of document.querySelectorAll('button, a, [role="button"]')) {
    const text = (b.innerText || '').trim();
    const label = b.getAttribute('aria-label') || b.getAttribute('title') || '';
    if (!text && !label) {
      iconButtons.push({
        tag: b.tagName.toLowerCase(),
        html: (b.outerHTML || '').slice(0, 120),
        has_svg: !!b.querySelector('svg,img,i'),
      });
      if (iconButtons.length >= 10) break;
    }
  }
  const inputs = [];
  for (const i of document.querySelectorAll('input, select, textarea')) {
    const id = i.id;
    const labeled = !!(i.getAttribute('aria-label')
                       || (id && document.querySelector(`label[for="${id}"]`))
                       || i.closest('label'));
    if (!labeled) {
      inputs.push({ type: i.type || i.tagName.toLowerCase(), name: i.name || '' });
      if (inputs.length >= 10) break;
    }
  }
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
    .slice(0, 20).map(h => ({ level: h.tagName, text: (h.innerText||'').slice(0,80) }));
  const landmarks = ['main','nav','header','footer','aside'].map(t => ({
    tag: t, count: document.querySelectorAll(t).length,
  }));
  return { icon_only_buttons_without_label: iconButtons,
           unlabeled_inputs: inputs, headings, landmarks };
}
"""


def cap_styles(page) -> dict:
    try:
        return page.evaluate(_STYLES_JS) or {}
    except Exception as exc:
        return {"_error": str(exc)}


def cap_motion(page) -> dict:
    try:
        return page.evaluate(_MOTION_JS) or {}
    except Exception as exc:
        return {"_error": str(exc)}


def cap_a11y(page) -> dict:
    try:
        return page.evaluate(_A11Y_JS) or {}
    except Exception as exc:
        return {"_error": str(exc)}


def focus_walk(page, presses: int = 10) -> list[dict]:
    """Tab through and record what receives focus, plus whether outline is visible."""
    out: list[dict] = []
    for _ in range(presses):
        try:
            page.keyboard.press("Tab")
            info = page.evaluate(r"""
              () => {
                const el = document.activeElement;
                if (!el || el === document.body) return null;
                const cs = getComputedStyle(el);
                return {
                  tag: el.tagName.toLowerCase(),
                  text: (el.innerText || el.value || '').slice(0, 40),
                  outline: cs.outline,
                  outline_width: cs.outlineWidth,
                  outline_style: cs.outlineStyle,
                  box_shadow: cs.boxShadow,
                };
              }
            """)
            if info:
                out.append(info)
        except Exception as exc:
            out.append({"_error": str(exc)})
            break
    return out


class Recorder:
    def __init__(self) -> None:
        self.console: list[dict] = []
        self.failed_requests: list[dict] = []

    def bind(self, context) -> None:
        def _on_console(msg):
            try:
                if msg.type in ("error", "warning"):
                    self.console.append({"type": msg.type, "text": msg.text[:500]})
            except Exception:
                pass
        def _on_pageerror(err):
            self.console.append({"type": "pageerror", "text": str(err)[:500]})
        def _on_requestfailed(req):
            try:
                self.failed_requests.append({
                    "url": req.url[:300],
                    "method": req.method,
                    "failure": (req.failure or "")[:200],
                })
            except Exception:
                pass
        def _on_response(resp):
            try:
                if resp.status >= 500:
                    self.failed_requests.append({
                        "url": resp.url[:300], "method": resp.request.method,
                        "status": resp.status,
                    })
            except Exception:
                pass
        context.on("console", _on_console)
        context.on("pageerror", _on_pageerror)
        context.on("requestfailed", _on_requestfailed)
        context.on("response", _on_response)


NAV_ROUTES_JS = r"""
() => {
  const origin = location.origin;
  const seen = new Set();
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== origin) continue;
      if (u.pathname.match(/\.(png|jpe?g|svg|ico|css|js|pdf)$/i)) continue;
      if (seen.has(u.pathname)) continue;
      seen.add(u.pathname);
      out.push(u.pathname + (u.search || ''));
      if (out.length >= 12) break;
    } catch (e) {}
  }
  return out;
}
"""


CREDENTIAL_LOGIN_PATH = re.compile(
    r'(?:sign[\s-]?in|log[\s-]?in)\s+at\s+`?(/[A-Za-z0-9._\-/]{1,40})`?', re.I)

COMMON_LOGIN_PATHS = ("/signin", "/sign-in", "/login", "/log-in",
                      "/account/login", "/account/signin", "/account", "/auth/login")


def login_paths(credentials_text: str) -> list[str]:
    """Candidate sign-in paths, the README's own answer first.

    USER_README.md routinely says "Sign in at `/sign-in`" -- the agent documents
    exactly where its login lives and nothing read it. Honour that before
    guessing, then fall back to the common shapes.
    """
    paths: list[str] = []
    for m in CREDENTIAL_LOGIN_PATH.finditer(credentials_text or ""):
        p = m.group(1).rstrip("/") or "/"
        if p not in paths:
            paths.append(p)
    for p in COMMON_LOGIN_PATHS:
        if p not in paths:
            paths.append(p)
    return paths


def try_login(page, credentials_text: str, base_url: str = "",
              email_hint: str = "") -> str:
    """Programmatic login using credentials from USER_README.md, then VERIFY it.

    An SPA login is a `fetch`, not a navigation, so `domcontentloaded` returns
    the instant it is asked and the caller's next `page.goto` aborts the still
    in-flight POST -- `net::ERR_ABORTED`, no session, and every subsequent route
    bounces to /login. Measured 2026-08-19: a whole 51-criterion rubric graded
    against a login card while reporting "attempted login as ..." as though it
    had worked.

    So: wait for the network to settle, then prove the session exists by loading
    "/" and looking for a password field. The return value distinguishes
    verified from failed -- callers must be able to tell an unmeasured rubric
    from a bad one.
    """
    if not credentials_text:
        return "no credentials file"
    emails = list(dict.fromkeys(
        re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", credentials_text)))
    email = next((value for value in emails
                  if value.casefold() == email_hint.casefold()), "") if email_hint else (
                      emails[0] if emails else "")
    if email_hint and not email:
        return f"requested credential {email_hint} is not available"
    pw_m = None
    for pat in (r"[Pp]assword\**\s*[:=]\s*[*`\"'\s]*([^\s`\"'*\n]+)",
                r"pass(?:word)?\s+is\s+[*`\"'\s]*([^\s`\"'*\n]+)"):
        m = re.search(pat, credentials_text)
        if m and len(m.group(1)) >= 3:
            pw_m = m
            break
    if not (email and pw_m):
        return "could not parse credentials"
    pw = pw_m.group(1)
    seen: dict[str, object] = {}

    def _note(resp):
        try:
            if (resp.request.method == "POST"
                    and re.search(r"(login|signin|session|token|auth)", resp.url, re.I)):
                seen.setdefault("status", resp.status)
                seen.setdefault("url", resp.url)
        except Exception:
            pass

    try:
        page.on("response", _note)
    except Exception:
        pass
    try:
        origin = (base_url or page.url).rstrip("/")
        landed = False
        for path in login_paths(credentials_text):
            try:
                page.goto(origin + path, timeout=ACTION_TIMEOUT_MS,
                          wait_until="domcontentloaded")
                page.wait_for_timeout(400)
                if page.locator('input[type="password"]').count() > 0:
                    landed = True
                    break
            except Exception:
                continue
        if not landed:
            try:
                page.goto(origin + "/", timeout=ACTION_TIMEOUT_MS,
                          wait_until="domcontentloaded")
                link = page.locator(
                    'a:has-text("Sign in"), a:has-text("Log in"), '
                    'a:has-text("Login"), a:has-text("Sign In"), '
                    'a[href*="signin"], a[href*="sign-in"], a[href*="login"]').first
                if link.count() > 0:
                    link.click(timeout=ACTION_TIMEOUT_MS)
                    page.wait_for_timeout(600)
                    landed = page.locator('input[type="password"]').count() > 0
            except Exception:
                pass
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        page.wait_for_timeout(600)

        def fill_verified(selectors: tuple[str, ...], value: str) -> bool:
            """Type, then read back -- and retry if the framework overwrote it."""
            for sel in selectors:
                loc = page.locator(sel).first
                if loc.count() == 0:
                    continue
                for attempt in range(3):
                    loc.fill(value, timeout=ACTION_TIMEOUT_MS)
                    page.wait_for_timeout(250)
                    try:
                        if loc.input_value(timeout=2000) == value:
                            return True
                    except Exception:
                        return True
                    page.wait_for_timeout(400 * (attempt + 1))
                return False
            return False

        ok_email = fill_verified(('input[type="email"]', 'input[name*="email" i]',
                                  'input[name*="user" i]', 'input[type="text"]'), email)
        ok_pw = fill_verified(('input[type="password"]',), pw)
        if not (ok_email and ok_pw):
            if not landed:
                return (f"LOGIN FAILED as {email} -- no sign-in form found. Tried "
                        f"{', '.join(login_paths(credentials_text)[:4])} and the "
                        f"home page nav; none exposed a password field. This is a "
                        f"grader routing failure, not evidence about the app.")
            return (f"LOGIN FAILED as {email} at {page.url} -- the form would not "
                    f"hold its values (email_ok={ok_email} password_ok={ok_pw})")
        for sel in ('button[type="submit"]', 'button:has-text("Sign in")',
                    'button:has-text("Log in")', 'button:has-text("Login")',
                    'input[type="submit"]'):
            loc = page.locator(sel).first
            if loc.count() > 0:
                loc.click(timeout=ACTION_TIMEOUT_MS)
                break
        for state in ("domcontentloaded", "networkidle"):
            try:
                page.wait_for_load_state(state, timeout=10000)
            except Exception:
                pass
        time.sleep(1.0)

        try:
            page.goto(origin + "/", timeout=ACTION_TIMEOUT_MS,
                      wait_until="domcontentloaded")
            page.wait_for_timeout(600)
            still_out = (page.locator('input[type="password"]').count() > 0
                         or "/login" in page.url)
        except Exception as exc:
            return f"login unverified as {email}: {exc}"
        if still_out:
            why = (f" (auth endpoint {seen.get('url')} returned {seen['status']})"
                   if "status" in seen else "")
            return (f"LOGIN FAILED as {email} -- still at {page.url} with a "
                    f"password field{why}; everything below was graded logged OUT")
        return f"logged in as {email}"
    except Exception as exc:
        return f"login attempt failed: {exc}"


def credential_emails(credentials_text: str) -> list[str]:
    """Ordered, deduplicated trusted emails from sanitized credential text."""
    return list(dict.fromkeys(
        re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", credentials_text or "")))


def select_specialist_email(
    criterion: dict,
    workflow_evidence: list,
    credentials_text: str,
) -> str:
    """Choose the most relevant seeded role before active acquisition.

    Workflow prose is preferred because it often names the exact account. The
    fallback vocabulary covers task rubrics that describe a surface rather than
    spelling out its route or role. This is only an initial session; permission
    specialists retain browser_clear_cookies when a criterion requires two roles.
    """
    available = credential_emails(credentials_text)
    if not available:
        return ""
    evidence_text = " ".join(
        f"{getattr(item, 'substep_do', '')} {getattr(item, 'observation', '')}"
        for item in workflow_evidence)
    text = " ".join((
        evidence_text,
        str(criterion.get("criterion", "")),
        str(criterion.get("evaluation_rule", "")),
        str(criterion.get("dimension", "")),
    )).casefold()

    for email in available:
        if email.casefold() in text:
            return email

    preferred: list[str]
    if any(token in text for token in (
        "analyst", "approval", "approve", "team figure", "reporting week",
        "interval grid", "workforce",
    )):
        preferred = ["analyst@"]
    elif any(token in text for token in (
        "team leader", "team_leader", "check queue", "review queue", "reviews",
        "direct report", "checked",
    )):
        preferred = ["team_leader@", "leader@"]
    elif any(token in text for token in (
        "agent", "filing", "file effort", "duration", "ticket picker", "wizard",
    )):
        preferred = ["agent@"]
    else:
        preferred = []
    for prefix in preferred:
        match = next((email for email in available if email.casefold().startswith(prefix)), "")
        if match:
            return match
    return available[0]


def discover_routes(page) -> list[str]:
    try:
        return list(page.evaluate(NAV_ROUTES_JS) or [])
    except Exception:
        return []


def gather_evidence(playwright, url: str, credentials_text: str,
                    viewports: list[tuple[int, int]], routes: list[str] | None,
                    shot_dir: Path) -> dict:
    """One browser session -> screenshots + styles + motion + a11y + console."""
    evidence: dict = {
        "url": url,
        "viewports": [f"{w}x{h}" for w, h in viewports],
        "routes_visited": [],
        "screenshots": [],
        "styles": {},
        "motion": {},
        "a11y": {},
        "focus_walk": [],
        "console": [],
        "failed_requests": [],
        "reduced_motion": {},
        "login_status": "",
    }
    if not viewports:
        viewports = [(1920, 1200)]
    primary_w, primary_h = viewports[0]

    recorder = Recorder()
    browser = playwright.chromium.launch(headless=True)
    try:
        context = browser.new_context(
            viewport={"width": primary_w, "height": primary_h},
            ignore_https_errors=True,
        )
        recorder.bind(context)
        page = context.new_page()
        page.set_default_timeout(ACTION_TIMEOUT_MS)

        try:
            page.goto(url, timeout=ACTION_TIMEOUT_MS, wait_until="domcontentloaded")
        except Exception as exc:
            print(f"  [warn] initial navigate failed: {exc}", file=sys.stderr)

        evidence["login_status"] = try_login(page, credentials_text, url)

        try:
            page.goto(url, timeout=ACTION_TIMEOUT_MS, wait_until="domcontentloaded")
        except Exception:
            pass

        if not routes:
            discovered = discover_routes(page)
            routes = ["/"] + [r for r in discovered if r not in ("/",)][:8]
        else:
            routes = ["/" if r == "" else r for r in routes]

        for i, route in enumerate(routes):
            try:
                target = url.rstrip("/") + (route if route.startswith("/") else "/" + route)
                page.goto(target, timeout=ACTION_TIMEOUT_MS, wait_until="domcontentloaded")
                evidence["routes_visited"].append(route)
                time.sleep(0.4)
            except Exception as exc:
                print(f"  [warn] route {route} failed: {exc}", file=sys.stderr)
                continue

            evidence["styles"][route] = cap_styles(page)
            evidence["motion"][route] = cap_motion(page)
            evidence["a11y"][route]   = cap_a11y(page)

            slug = re.sub(r"[^a-zA-Z0-9]+", "_", route).strip("_") or "root"
            for w, h in viewports:
                try:
                    page.set_viewport_size({"width": w, "height": h})
                    time.sleep(0.2)
                    shot_path = shot_dir / f"{i:02d}_{slug}_{w}x{h}.png"
                    path_str, b64 = cap_screenshot(page, shot_path)
                    evidence["screenshots"].append({
                        "path": path_str, "viewport": f"{w}x{h}",
                        "route": route, "b64": b64,
                    })
                except Exception as exc:
                    print(f"  [warn] shot {route} @ {w}x{h} failed: {exc}", file=sys.stderr)
            try:
                page.set_viewport_size({"width": primary_w, "height": primary_h})
            except Exception:
                pass

        evidence["focus_walk"] = focus_walk(page, presses=8)

        context.close()

        try:
            rm_ctx = browser.new_context(
                viewport={"width": primary_w, "height": primary_h},
                reduced_motion="reduce", ignore_https_errors=True,
            )
            rm_page = rm_ctx.new_page()
            rm_page.goto(url, timeout=ACTION_TIMEOUT_MS, wait_until="domcontentloaded")
            time.sleep(0.5)
            evidence["reduced_motion"]["/"] = cap_motion(rm_page)
            rm_ctx.close()
        except Exception as exc:
            evidence["reduced_motion"]["_error"] = str(exc)

        evidence["console"] = recorder.console[:80]
        evidence["failed_requests"] = recorder.failed_requests[:40]
    finally:
        try:
            browser.close()
        except Exception:
            pass

    return evidence


HUMAN_REVIEW_THRESHOLD = float(os.environ.get("DEKU_REVIEW_CONFIDENCE", "0.70"))

REPORT_TOOL = {
    "name": "report_dimension",
    "description": ("MANDATORY final call. Return whether the criterion is SATISFIED, your CONFIDENCE "
                    "in that score (0.0-1.0), a one-to-three sentence rationale, and at "
                    "least one concrete evidence reference (a screenshot filename, a "
                    "computed-style value, a console error string, or a specific route)."),
    "input_schema": {
        "type": "object",
        "properties": {
            "satisfied": {
                "type": "boolean",
                "description": (
                    "True only if the criterion is FULLY met as written. If any part "
                    "of it is unmet, or it is met only partly or only on some screens, "
                    "answer false and say which part failed in the rationale. Do not "
                    "round up a nearly-satisfied criterion, and do not answer true to "
                    "avoid being harsh -- a false with a clear reason is the useful "
                    "verdict. If you cannot tell either way, still answer, and report "
                    "LOW CONFIDENCE so it reaches a human instead of being scored."
                ),
            },
            "confidence": {
                "type": "number", "minimum": 0.0, "maximum": 1.0,
                "description": (
                    "How certain are you of the SCORE -- a separate question from how "
                    "good the app is. Report high confidence when the evidence settles "
                    "it either way: a computed style you read, a console error you saw, "
                    "an element plainly present or plainly absent. Report LOW confidence "
                    "(below 0.7) when the evidence cannot settle it -- the criterion "
                    "concerns motion or interaction you cannot observe in a still "
                    "screenshot, the relevant screen was unreachable, or you are "
                    "inferring rather than observing. A confident 0.0 is a real and "
                    "useful verdict; an uncertain 0.5 is not, and will be sent to a "
                    "human instead of being scored."
                ),
            },
            "rationale": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["satisfied", "confidence", "rationale", "evidence"],
    },
}


def split_by_confidence(graded: dict[str, dict]) -> tuple[dict[str, dict], list[dict]]:
    """Partition graded criteria into (scored, needs_review).

    A criterion with no confidence at all is treated as CONFIDENT, not uncertain:
    the field is required by the schema, so its absence means an older judge.json
    or a provider that dropped it, and silently routing every such criterion to
    review would empty the score rather than improve it.
    """
    scored: dict[str, dict] = {}
    review: list[dict] = []
    for key, d in graded.items():
        conf = d.get("confidence")
        if conf is not None and float(conf) < HUMAN_REVIEW_THRESHOLD:
            review.append({
                "criterion": key,
                "provisional_score": d.get("score"),
                "confidence": conf,
                "rationale": d.get("rationale", ""),
                "evidence": d.get("evidence", []),
                "reason": f"confidence {float(conf):.2f} < {HUMAN_REVIEW_THRESHOLD:.2f}",
            })
        else:
            scored[key] = d
    return scored, review


def _shortlist_styles(styles_by_route: dict, limit_routes: int = 3) -> dict:
    """Return only the first N routes to keep prompts small."""
    out: dict = {}
    for i, (route, styles) in enumerate(styles_by_route.items()):
        if i >= limit_routes:
            break
        out[route] = styles
    return out


def _shortlist_shots(shots: list[dict], limit: int = 6) -> list[dict]:
    """Pick a spread of screenshots that covers EVERY route.

    The previous version grouped by viewport and kept the first N of each. Since
    shots are captured route-by-route, that always kept the first N routes and
    silently dropped the rest -- with three routes and two per viewport, /trend
    never reached the judge. It then scored "renders the weekly trend" 0.00 with
    the rationale "no screenshots of the /trend page were provided", on a page the
    browser grader had just driven successfully (2026-08-06).

    Absence of evidence read as evidence of absence, caused by a silent truncation.

    Route coverage now comes first: one shot per route (widest viewport, where
    layout is most legible), then the remaining budget is spent on additional
    viewports round-robin so responsive checks still get material. A route is only
    dropped when there are more routes than `limit`, and that is a real cap rather
    than an accident of ordering.
    """
    if not shots:
        return []

    by_route: dict[str, list[dict]] = {}
    for s in shots:
        by_route.setdefault(s.get("route", "?"), []).append(s)

    def widest_first(lst: list[dict]) -> list[dict]:
        def width(s: dict) -> int:
            try:
                return int(str(s.get("viewport", "0x0")).split("x")[0])
            except ValueError:
                return 0
        return sorted(lst, key=width, reverse=True)

    ordered = {r: widest_first(lst) for r, lst in by_route.items()}

    picked: list[dict] = []
    for route, lst in ordered.items():
        if len(picked) >= limit:
            break
        picked.append(lst[0])

    depth = 1
    while len(picked) < limit and any(len(lst) > depth for lst in ordered.values()):
        for lst in ordered.values():
            if len(picked) >= limit:
                break
            if len(lst) > depth:
                picked.append(lst[depth])
        depth += 1

    return picked


def _image_blocks(shots: list[dict], limit: int = 6) -> list[dict]:
    """Turn screenshot records into Anthropic image content blocks."""
    blocks: list[dict] = []
    for s in shots[:limit]:
        media = "image/png" if s["path"].endswith(".png") else "image/jpeg"
        blocks.append({"type": "text",
                       "text": f"Screenshot: route={s['route']} viewport={s['viewport']} path={s['path']}"})
        blocks.append({"type": "image",
                       "source": {"type": "base64", "media_type": media, "data": s["b64"]}})
    return blocks


def grade_dimension(llm: JudgeAnthropic, name: str, asks: str,
                    evidence: dict, max_steps: int,
                    frames: list[dict] | None = None) -> dict:
    """One LLM call per dimension. The model is given the focused rubric plus
    the pre-gathered evidence, and returns a score via report_dimension.

    `asks` -- the criterion text plus its evaluation_rule, built by
    load_task_rubric from rubric.json -- is the WHOLE spec this judge sees.
    instruction.md is deliberately NOT read: a judge holding the prose brief can
    score against criteria the reviewed rubric never declared, and such a
    verdict is unauditable against traceability-matrix.csv. The graded artefacts
    are exactly three: workflows.yaml, rubric.json and test_output.py.
    """

    system = (
        "You are a rigorous UX/QA judge grading a deployed web app against a written spec.\n"
        f"You are scoring exactly ONE dimension: {name}.\n\n"
        f"What this dimension asks: {asks}\n\n"
        "Scoring guide:\n"
        "  1.0 = fully meets the spec on this dimension, no notable issues\n"
        "  0.8 = mostly meets, with one or two small gaps\n"
        "  0.5 = partially meets, real gaps against the spec\n"
        "  0.2 = barely present, wrong direction, or broken in most places\n"
        "  0.0 = absent, unreachable, throws, or blatantly wrong\n\n"
        "Rules:\n"
        "- Ground every claim in the evidence provided. Cite screenshot filenames, "
        "computed-style values, console errors, or specific routes.\n"
        "- Do NOT invent evidence. If evidence is thin, say so and score cautiously.\n"
        "- MISSING EVIDENCE IS NOT A FAILING APP. If the evidence bundle does not "
        "contain what this criterion needs -- no screenshot of the relevant route, "
        "no computed style for the element in question -- you have NOT observed a "
        "defect. Say plainly in the rationale that the criterion could not be "
        "assessed from the evidence, and score 0.5 rather than 0.0. Reserve 0.0 "
        "for a defect you can actually point at. Scoring an unobserved criterion "
        "as absent turns a gap in the harness into a mark against the app, and a "
        "route WAS reachable if it appears in routes_visited.\n"
        "- Score AGAINST WHAT THIS DIMENSION ASKS above, not a generic notion "
        "of good. The criterion and its evaluation rule are the entire spec; "
        "there is no brief to consult.\n"
        "- Call report_dimension exactly once. That call ends grading.\n"
    )

    console = evidence.get("console", [])[:20]
    failed = evidence.get("failed_requests", [])[:15]
    shots_summary = _shortlist_shots(evidence.get("screenshots", []))
    styles_summary = _shortlist_styles(evidence.get("styles", {}))
    motion_summary = evidence.get("motion", {})
    reduced_motion = evidence.get("reduced_motion", {})
    a11y_summary = evidence.get("a11y", {})
    focus = evidence.get("focus_walk", [])
    routes = evidence.get("routes_visited", [])

    evidence_json = {
        "app_url": evidence.get("url"),
        "viewports_tested": evidence.get("viewports"),
        "routes_visited": routes,
        "login_status": evidence.get("login_status"),
        "console_errors_and_warnings": console,
        "failed_or_5xx_requests": failed,
        "computed_styles_sample": styles_summary,
        "motion": motion_summary,
        "motion_with_reduced_motion": reduced_motion,
        "a11y_probes": a11y_summary,
        "focus_walk": focus,
        "screenshots_index": [{k: s[k] for k in ("path", "route", "viewport")}
                              for s in shots_summary],
    }
    first_content: list[dict] = [
        {"type": "text",
         "text": f"Grade dimension `{name}`. Evidence follows.\n\n"
                 f"```json\n{json.dumps(evidence_json, indent=2)[:20000]}\n```"},
    ]
    first_content.extend(_image_blocks(shots_summary))
    if frames:
        first_content.append({"type": "text", "text":
            f"\n=== RECORDED SEQUENCE ({len(frames)} frames, "
            f"{FRAME_INTERVAL_MS}ms apart, oldest first) ===\n"
            "These are consecutive moments of one interaction, not alternative "
            "views. Judge this criterion from what CHANGES between them -- what "
            "moves, in which order, and how far. If the sequence does not show "
            "the behaviour either way, say so and report low confidence rather "
            "than inferring it."})
        first_content.extend(frame_blocks(frames))
    first_content.append({"type": "text",
                          "text": "Now call report_dimension with score, rationale, evidence."})

    messages: list[dict] = [{"role": "user", "content": first_content}]
    tools = [REPORT_TOOL]

    for step in range(max_steps):
        resp = llm.message(system=system, messages=messages, tools=tools)
        content_blocks = resp.get("content", [])
        messages.append({"role": "assistant", "content": content_blocks})
        tool_uses = [b for b in content_blocks if b.get("type") == "tool_use"]
        if not tool_uses:
            text = " ".join(b.get("text", "") for b in content_blocks
                            if b.get("type") == "text")[:400]
            messages.append({"role": "user",
                             "content": "You must call report_dimension. Do it now."})
            if step >= 1:
                return {"score": 0.0, "confidence": 0.0,
                        "rationale": f"model refused to call report_dimension: {text!r}",
                        "evidence": []}
            continue
        for tu in tool_uses:
            if tu.get("name") == "report_dimension":
                inp = tu.get("input", {}) or {}
                satisfied = bool(inp.get("satisfied", False))
                return {
                    "satisfied": satisfied,
                    "score": 1.0 if satisfied else 0.0,
                    "confidence": (float(inp["confidence"])
                                   if inp.get("confidence") is not None else None),
                    "rationale": str(inp.get("rationale", "")),
                    "evidence": [str(x) for x in (inp.get("evidence") or [])],
                }
        messages.append({"role": "user",
                         "content": "Unknown tool. Call report_dimension."})

    return {"score": 0.0, "confidence": 0.0,
            "rationale": f"exceeded {max_steps} LLM steps without report_dimension",
            "evidence": []}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2) + "\n")
    tmp.replace(path)


def build_argparser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="run_rubric.py",
        description=(
            "Deku rubric judge -- ADVISORY / DIAGNOSTIC ONLY.\n\n"
            "Writes judge.json with a weighted `judge_score` and per-dimension "
            "breakdown. PLAN.md 1.4: this score is recorded but NEVER drives "
            "training. The binary substep grader (run_workflows.py + score.py) "
            "owns the RL reward; this tool is the human-facing quality read.\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--url", required=True,
                    help="Base URL of the deployed app.")
    ap.add_argument("--out", required=True, type=Path,
                    help="Where to write judge.json.")
    ap.add_argument("--credentials-path", default=DEFAULT_CREDENTIALS_PATH,
                    help="Path to USER_README.md with default credentials.")
    ap.add_argument("--screenshot-dir", type=Path, default=None,
                    help="Directory for screenshots (default: <out-dir>/shots/).")
    ap.add_argument("--max-steps", type=int, default=DEFAULT_MAX_STEPS,
                    help="Max LLM steps per dimension.")
    ap.add_argument("--rubric", required=True, type=Path,
                    help="tests/rubric.json -- the ONLY spec this judge grades "
                         "against. REQUIRED: there is no generic-dimension "
                         "fallback, because one answers different questions while "
                         "still emitting a normal-looking score. Still advisory -- "
                         "score.py never reads it into `reward`.")
    ap.add_argument("--browser-results", type=Path, default=None,
                    help="Path to browser_results.json from run_workflows.py. "
                         "Used by the evidence-first pipeline to consume shared "
                         "workflow evidence without re-visiting routes.")
    ap.add_argument("--ctrf", type=Path, default=None,
                    help="Path to ctrf.json from pytest. Used by the evidence-first "
                         "pipeline for pytest evidence.")
    ap.add_argument("--routes", default="",
                    help="Comma-separated routes to visit. Auto-discovered if empty.")
    ap.add_argument("--viewports", default=DEFAULT_VIEWPORTS,
                    help=f"Comma-separated WxH list (default: {DEFAULT_VIEWPORTS}). "
                         "First is primary.")
    return ap


def _file_digest(path) -> str:
    """sha256 of a file's bytes, or "" when it cannot be read.

    Never raises: this runs while assembling the metadata of a grading that has
    already happened, and a missing digest must not cost the verdict it
    describes.
    """
    if not path:
        return ""
    try:
        return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    except (OSError, TypeError, ValueError):
        return ""


def main() -> int:
    args = build_argparser().parse_args()

    if not args.rubric.exists():
        print(f"FATAL: {args.rubric} does not exist.\n"
              f"  The rubric judge grades ONLY tests/rubric.json and has no "
              f"generic fallback to degrade into.", file=sys.stderr)
        return 2
    try:
        task_criteria = load_task_rubric(args.rubric)
    except Exception as exc:
        print(f"FATAL: {args.rubric} is unreadable ({exc}).\n"
              f"  The task's own criteria cannot be loaded, and this judge has no "
              f"other spec to fall back on.\n"
              f"  Fix the file and re-run.",
              file=sys.stderr)
        return 2
    if not task_criteria:
        print(f"FATAL: {args.rubric} declares zero criteria; there is nothing "
              f"to grade against.", file=sys.stderr)
        return 2
    print(f"task rubric: {len(task_criteria)} criteria from {args.rubric}",
          file=sys.stderr)

    started = now_iso()
    shot_dir = args.screenshot_dir or (args.out.parent / "shots")
    viewports = parse_viewport_list(args.viewports)
    routes = [r.strip() for r in args.routes.split(",") if r.strip()] or None
    # `or` not a get() default: an empty forwarded value must fall back.
    model = os.environ.get("DEKU_JUDGE_MODEL") or DEFAULT_JUDGE_MODEL

    meta: dict = {
        "evaluated_by": f"llm:{model}",
        "grader_model": model,
        "judge_temperature": GRADER_TEMPERATURE,
        "judge_temperature_applied": _temperature_applied(model),
        "judge_seed": GRADER_SEED,
        "url": args.url,
        "viewports": [f"{w}x{h}" for w, h in viewports],
        "rubric_sha256": _file_digest(args.rubric),
        "started_at": started,
        "harness": "run_rubric.py",
    }
    payload: dict = {
        "judge_score": 0.0,
        "advisory": True,
        "note": ADVISORY_NOTE,
        "dimensions": {},
        "console_errors": [],
        "screenshots": [],
        "meta": meta,
    }
    _write_json(args.out, payload)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        meta["error"] = f"playwright not installed: {exc}"
        payload["meta"] = meta
        _write_json(args.out, payload)
        print(f"playwright not installed: {exc}; wrote zero-score judge.json",
              file=sys.stderr)
        return 0

    creds = read_credentials(args.credentials_path)

    print(f"gathering evidence @ {args.url} across {len(viewports)} viewport(s)",
          file=sys.stderr)
    evidence: dict
    try:
        with sync_playwright() as p:
            evidence = gather_evidence(p, args.url, creds, viewports, routes, shot_dir)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        meta["error"] = f"evidence gathering failed: {exc.__class__.__name__}: {exc}"
        evidence = {"url": args.url, "viewports": [f"{w}x{h}" for w, h in viewports],
                    "routes_visited": [], "screenshots": [], "styles": {},
                    "motion": {}, "a11y": {}, "focus_walk": [], "console": [],
                    "failed_requests": [], "reduced_motion": {},
                    "login_status": "n/a (crash)"}

    llm = _make_judge_llm(model)
    panel = [(short_model(m), _make_judge_llm(m)) for m in JUDGE_PANEL]
    dimensions: dict[str, dict] = {}


    evidence_first = os.environ.get("DEKU_RUBRIC_EVIDENCE_FIRST", "1").lower() in (
        "1", "true", "yes")

    if evidence_first and task_criteria:
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from evidence import (
                EvidenceClaim, load_workflow_evidence, load_pytest_evidence,
                merge_evidence)
            from claims import decompose_criterion
            from probes import run_all_probes
            from router import (
                plan_grading, summarize_plan, _find_matching_workflow_evidence,
                seed_workflow_evidence)
            from active_evidence import acquire_evidence, ActiveAcquisitionBudget
            from adjudicator import (
                MachineOutcome, Resolution, Verdict, adjudicate_all,
                resolved_weighted_score, summarize_verdicts,
                verdicts_to_judge_entries)
        except ImportError as exc:
            evidence_first = False
            print(f"  [warn] evidence-first modules unavailable ({exc}); "
                  "falling back to legacy council", file=sys.stderr)

    if evidence_first and task_criteria:
        print("evidence-first pipeline: ON", file=sys.stderr)
        meta.update({
            "rubric_source": str(args.rubric),
            "rubric_criteria": len(task_criteria),
            "evidence_first": True,
        })
        traces_dir = args.out.parent / "traces"
        traces_dir.mkdir(parents=True, exist_ok=True)

        browser_results_path = args.browser_results or Path("/logs/verifier/browser_results.json")
        ctrf_path = args.ctrf or Path("/logs/verifier/ctrf.json")
        wf_claims = load_workflow_evidence(browser_results_path)
        pt_claims = load_pytest_evidence(ctrf_path)
        evidence_bundle = merge_evidence(wf_claims, pt_claims, evidence)
        print(f"  shared evidence: {len(wf_claims)} workflow, {len(pt_claims)} pytest, "
              f"{len(evidence_bundle.routes_visited)} routes", file=sys.stderr)

        all_claims = [claim for criterion in task_criteria
                      for claim in decompose_criterion(criterion)]
        print(f"  compiled {len(all_claims)} typed claim(s)", file=sys.stderr)

        probe_results = []
        probe_trace = traces_dir / "rubric_probes.zip"
        try:
            with sync_playwright() as pw:
                browser_inst = pw.chromium.launch(headless=True, args=["--no-sandbox"])
                ctx = browser_inst.new_context(
                    viewport={"width": 1920, "height": 1200}, ignore_https_errors=True)
                ctx.tracing.start(screenshots=True, snapshots=True, sources=False)
                page = ctx.new_page()
                page.set_default_timeout(10000)
                login_status = try_login(page, creds, args.url)
                probe_results = run_all_probes(page, all_claims, args.url)
                ctx.tracing.stop(path=str(probe_trace))
                ctx.close()
                browser_inst.close()
                meta["probe_login_status"] = login_status
        except Exception as exc:
            print(f"  [warn] probe pass failed: {exc}", file=sys.stderr)
        print(f"  probes: {len(probe_results)} run, "
              f"{sum(result.satisfied is not None for result in probe_results)} settled",
              file=sys.stderr)

        carried_verdicts: dict = {}
        _resume_from = os.environ.get("DEKU_RUBRIC_RESUME_FROM", "").strip()
        if _resume_from:
            try:
                _prior = json.loads(Path(_resume_from).read_text())
                for _v in _prior.get("verdicts") or []:
                    if str(_v.get("outcome", "")).upper() in ("PASS", "FAIL"):
                        carried_verdicts[str(_v.get("criterion_number", ""))] = _v
                print(f"  resume: carrying {len(carried_verdicts)} settled criteria "
                      f"forward from {_resume_from}; re-judging the rest",
                      file=sys.stderr)
            except Exception as exc:
                print(f"  [warn] could not read {_resume_from} ({exc}); "
                      f"grading every criterion", file=sys.stderr)
                carried_verdicts = {}

        routing_decisions = plan_grading(
            task_criteria, evidence_bundle, probe_results, all_claims)
        plan_summary = summarize_plan(routing_decisions)
        meta["routing_plan"] = plan_summary
        print(f"  routing: {plan_summary}", file=sys.stderr)

        active_results = {}
        budget = ActiveAcquisitionBudget()
        for _acq_pass in (1, 2):
            if _acq_pass == 2:
                errored = [n for n, r in active_results.items()
                           if r.status == "evaluator_error"]
                missing = [str(d.criterion.get("number", ""))
                           for d in routing_decisions if d.needs_active
                           and str(d.criterion.get("number", "")) not in active_results]
                if not (errored or missing) or budget.remaining <= 0:
                    break
                budget.reset_breaker()
                print(f"  [retry] second pass: {len(errored)} errored, "
                      f"{len(missing)} unattempted, {budget.remaining} steps left",
                      file=sys.stderr)
            for decision in routing_decisions:
                if not decision.needs_active or not budget.can_acquire():
                    continue
                number_so_far = str(decision.criterion.get("number", ""))
                if number_so_far in carried_verdicts:
                    continue
                if _acq_pass == 2 and number_so_far in active_results \
                        and active_results[number_so_far].status != "evaluator_error":
                    continue
                if _acq_pass == 1 and number_so_far in active_results:
                    continue
                number = str(decision.criterion.get("number", ""))
                claim = decision.claims[0] if decision.claims else None
                if claim is None:
                    continue
                seeds = seed_workflow_evidence(decision.criterion, evidence_bundle)
                criterion_probes = [result.to_dict() for result in probe_results
                                    if result.claim.criterion_number == number]
                trace_slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", number) or "criterion"
                trace_path = traces_dir / f"rubric_{trace_slug}.zip"
                browser_inst = ctx = None
                tracing_started = False
                try:
                    with sync_playwright() as pw:
                        browser_inst = pw.chromium.launch(
                            headless=True, args=["--no-sandbox"])
                        ctx = browser_inst.new_context(
                            viewport={"width": 1440, "height": 900},
                            ignore_https_errors=True)
                        ctx.tracing.start(screenshots=True, snapshots=True, sources=False)
                        tracing_started = True
                        page = ctx.new_page()
                        page.set_default_timeout(10000)
                        selected_email = select_specialist_email(
                            decision.criterion, seeds, creds)
                        login_status = try_login(
                            page, creds, args.url, email_hint=selected_email)
                        authenticated_as = (
                            selected_email if login_status.startswith("logged in as ")
                            else login_status)
                        result = acquire_evidence(
                            page, claim, llm, base_url=args.url, credentials=creds,
                            max_steps=budget.steps_for_criterion(),
                            criterion=decision.criterion,
                            specialist=decision.specialist,
                            seed_evidence=seeds,
                            probe_evidence=criterion_probes,
                            trace_path=f"traces/{trace_path.name}",
                            authenticated_as=authenticated_as)
                        active_results[number] = result
                        budget.record_result(result)
                        ctx.tracing.stop(path=str(trace_path))
                        tracing_started = False
                        ctx.close()
                        browser_inst.close()
                except Exception as exc:
                    print(f"  [warn] active acquisition {number} failed: {exc}", file=sys.stderr)
                    if ctx is not None and tracing_started:
                        try:
                            ctx.tracing.stop(path=str(trace_path))
                        except Exception:
                            pass
                    for resource in (ctx, browser_inst):
                        try:
                            if resource is not None:
                                resource.close()
                        except Exception:
                            pass

        _needed_active = sum(1 for d in routing_decisions if d.needs_active)
        meta["active_acquisition"] = {
            "steps_spent": budget.steps_spent,
            "total_budget": budget.total_budget,
            "remaining": budget.remaining,
            "circuit_broken": budget.circuit_broken,
            "criteria_acquired": len(active_results),
            "criteria_needing_active": _needed_active,
            "criteria_unattempted": max(0, _needed_active - len(active_results)),
            "status_counts": {
                status: sum(1 for r in active_results.values() if r.status == status)
                for status in ("resolved", "partial", "insufficient_evidence",
                               "evaluator_error")
            },
        }
        print(f"  active: {len(active_results)} criteria, {budget.steps_spent} steps",
              file=sys.stderr)

        verdicts = adjudicate_all(
            task_criteria, evidence_bundle, probe_results,
            active_results, routing_decisions)

        if carried_verdicts:
            _restored = 0
            for _i, _v in enumerate(verdicts):
                _prior = carried_verdicts.get(str(_v.criterion_number))
                if not _prior:
                    continue
                try:
                    verdicts[_i] = Verdict(
                        criterion_number=str(_prior["criterion_number"]),
                        outcome=MachineOutcome(_prior["outcome"]),
                        satisfied=_prior.get("satisfied"),
                        confidence=float(_prior.get("confidence") or 0.0),
                        resolution=Resolution(_prior["resolution"]),
                        evidence=list(_prior.get("evidence") or []),
                        rationale=str(_prior.get("rationale") or ""),
                    )
                    _restored += 1
                except Exception as exc:
                    print(f"  [warn] could not carry {_v.criterion_number} "
                          f"forward ({exc}); using this pass's verdict",
                          file=sys.stderr)
            meta["rubric_resume"] = {
                "source": _resume_from,
                "carried_forward": _restored,
                "regraded": len(verdicts) - _restored,
                "carried_criteria": sorted(str(v.criterion_number) for v in verdicts
                                           if str(v.criterion_number) in carried_verdicts),
            }
            print(f"  resume: {_restored} carried forward, "
                  f"{len(verdicts) - _restored} re-judged this pass", file=sys.stderr)

        dimensions = verdicts_to_judge_entries(verdicts, task_criteria)
        machine_summary = summarize_verdicts(verdicts, task_criteria)
        rows = list(dimensions.values())
        payload["dimensions"] = dimensions
        payload["judge_score"] = resolved_weighted_score(dimensions)
        payload["criteria_total"] = len(rows)
        payload["criteria_passed"] = machine_summary["counts"][MachineOutcome.PASS.value]
        payload["criteria_failed"] = machine_summary["counts"][MachineOutcome.FAIL.value]
        payload["criteria_unresolved"] = machine_summary["criteria_unresolved"]
        payload["machine_resolution"] = machine_summary
        payload["machine_unresolved"] = [
            {"criterion": verdict.criterion_number,
             "status": verdict.outcome.value,
             "rationale": verdict.rationale,
             "evidence": verdict.evidence,
             "steps_used": getattr(
                 active_results.get(verdict.criterion_number), "steps_used", None),
             "budget_exhausted": getattr(
                 active_results.get(verdict.criterion_number), "budget_exhausted", None)}
            for verdict in verdicts
            if verdict.outcome in {
                MachineOutcome.INSUFFICIENT_EVIDENCE,
                MachineOutcome.EVALUATOR_ERROR,
            }
        ]
        payload["needs_human_eval"] = 0
        payload["evidence_first"] = True
        payload["review_queue"] = {"count": 0, "criteria": []}
        payload["needs_review"] = []

        resolution_counts = {}
        for verdict in verdicts:
            resolution_counts[verdict.resolution.value] = (
                resolution_counts.get(verdict.resolution.value, 0) + 1)
        meta["resolution_breakdown"] = resolution_counts
        meta["machine_resolution"] = machine_summary

        evidence_bundle.probe_results = [result.to_dict() for result in probe_results]
        evidence_bundle.active_results = [result.to_dict() for result in active_results.values()]
        evidence_bundle.verdicts = [verdict.to_dict() for verdict in verdicts]
        for result in probe_results:
            evidence_bundle.claims.append(EvidenceClaim(
                source="probe", substep_id=result.claim.criterion_number,
                route=result.claim.route, observation=result.evidence_text,
                passed=result.satisfied, evaluator_error=result.evaluator_error,
                trace_path="traces/rubric_probes.zip"))
        for result in active_results.values():
            evidence_bundle.routes_visited.update(result.visited_routes)
            evidence_bundle.claims.append(EvidenceClaim(
                source="active", substep_id=result.claim.criterion_number,
                route=(result.visited_routes[-1] if result.visited_routes else result.claim.route),
                observation=result.rationale, passed=result.satisfied,
                evaluator_error=(result.rationale if result.status == "evaluator_error" else ""),
                trace_path=result.trace_path,
                tools_used=[entry.get("tool", "") for entry in result.tool_log]))
        evidence_bundle.metrics = {
            "routing": plan_summary,
            "active_budget": meta["active_acquisition"],
            "machine_resolution": machine_summary,
            "resolution_breakdown": resolution_counts,
        }
        _write_json(args.out.parent / "evidence_bundle.json", evidence_bundle.to_dict())
        _write_json(args.out.parent / "review_queue.json", {"count": 0, "criteria": []})

        payload["console_errors"] = [
            item.get("text", "") for item in evidence.get("console", [])
            if item.get("type") in ("error", "pageerror")][:40]
        payload["screenshots"] = [item["path"] for item in evidence.get("screenshots", [])]
        meta["finished_at"] = now_iso()
        meta["routes_visited"] = sorted(evidence_bundle.routes_visited)
        meta["login_status"] = evidence.get("login_status", "")
        meta["judge_panel"] = ["evidence_first_specialists", "machine_adjudicator"]
        meta["judge_panel_source"] = "evidence_first_pipeline"
        try:
            usage = llm.usage_snapshot()
            if usage.get("calls"):
                meta["usage"] = usage
        except Exception:
            pass
        payload["meta"] = meta
        _write_json(args.out, payload)
        print(f"judge_score = {payload['judge_score']} (advisory, evidence-first; "
              f"coverage={machine_summary['coverage']:.1%}). wrote {args.out}",
              file=sys.stderr)
        return 0


    try:
        if task_criteria:
            meta["rubric_source"] = str(args.rubric)
            meta["rubric_criteria"] = len(task_criteria)

            captures: dict[str, list[dict]] = {}
            wanted = {capture_key(c["capture"]): c["capture"]
                      for c in task_criteria
                      if c.get("evaluation_target") == RECORDED_TARGET and c.get("capture")}
            if wanted:
                print(f"recording {len(wanted)} capture(s) for recorded_ui criteria",
                      file=sys.stderr)
                try:
                    from playwright.sync_api import sync_playwright
                    with sync_playwright() as _pw:
                        for k, cap in wanted.items():
                            frames = record_capture(
                                _pw, args.url, cap,
                                (args.screenshot_dir or Path("/logs/verifier/shots"))
                                / "captures" / re.sub(r"[^a-z0-9]+", "_", k.lower()),
                                credentials_text=creds)
                            captures[k] = frames
                            print(f"  {k}: {len(frames)} frame(s)", file=sys.stderr)
                except Exception as exc:
                    print(f"  [warn] capture session failed: {exc}", file=sys.stderr)
                meta["captures"] = {k: len(v) for k, v in captures.items()}
            for c in task_criteria:
                print(f"grading {c['number']} [{c['dimension']}/{c['importance']}"
                      f"{'' if c['is_positive'] else '/NEGATIVE'}] "
                      f"weight {c['weight']:.3f}", file=sys.stderr)
                votes = []
                for label, member in panel:
                    def _runner(_c=c, _m=member) -> dict:
                        strip = (captures.get(capture_key(_c["capture"]))
                                 if _c.get("evaluation_target") == RECORDED_TARGET
                                 and _c.get("capture") else None)
                        return grade_dimension(_m, _c["key"], _c["asks"],
                                               evidence, args.max_steps, frames=strip)
                    one = safe_dimension(c["key"], c["weight"], c["asks"], _runner)
                    votes.append({
                        "judge": label,
                        "satisfied": one.get("satisfied"),
                        "confidence": one.get("confidence"),
                        "rationale": one.get("rationale", ""),
                    })
                    print(f"    {label}: satisfied={one.get('satisfied')} "
                          f"confidence={one.get('confidence')}", file=sys.stderr)

                graded = council_verdict(votes, c["is_positive"], c["raw_weight"],
                                         c["criterion"], c["number"])
                graded.update({
                    "dimension": c["dimension"], "importance": c["importance"],
                    "asks": c["asks"],
                    "verdict": "pass" if graded["passed"] else "fail",
                })
                dimensions[c["key"]] = graded
                payload["dimensions"] = dimensions
                rows = list(dimensions.values())
                payload["judge_score"] = weighted_rubric_score(rows)
                payload["criteria_total"] = len(rows)
                payload["criteria_passed"] = sum(1 for r in rows if r["passed"])
                payload["criteria_failed"] = sum(1 for r in rows if not r["passed"])
                payload["needs_human_eval"] = sum(1 for r in rows
                                                  if r.get("human_eval") == "yes")
                payload["judge_council"] = {
                    "members": JUDGE_PANEL,
                    "aggregation": "unanimous_or_higher_confidence",
                    "human_eval_when": (
                        f"either member's confidence < {HUMAN_REVIEW_THRESHOLD}, "
                        f"or the members disagree"
                    ),
                }
                payload["needs_review"] = [
                    {"criterion": r["number"], "confidence_by_judge": r["confidence_by_judge"],
                     "resolved_by": r["resolved_by"], "satisfied": r["satisfied"],
                     "passed": r["passed"], "text": r["criterion"],
                     "rationales_by_judge": r["rationales_by_judge"]}
                    for r in rows if r.get("human_eval") == "yes"
                ]
                _write_json(args.out, payload)
    finally:
        try:
            llm.close()
        except Exception:
            pass

    payload["judge_score"] = compute_task_rubric_score(task_criteria, dimensions)
    payload["dimensions"] = dimensions
    payload["console_errors"] = [
        c.get("text", "") for c in evidence.get("console", []) if c.get("type") in
        ("error", "pageerror")
    ][:40]
    payload["screenshots"] = [s["path"] for s in evidence.get("screenshots", [])]
    meta["finished_at"] = now_iso()
    meta["routes_visited"] = evidence.get("routes_visited", [])
    meta["login_status"] = evidence.get("login_status", "")
    meta["judge_panel"] = list(JUDGE_PANEL)
    meta["judge_panel_source"] = (
        "DEKU_JUDGE_PANEL" if os.environ.get("DEKU_JUDGE_PANEL") else "committed default"
    )
    try:
        clients = [("legacy", llm)] + [(lbl, m) for lbl, m in panel]
        totals = {"calls": 0, "input_tokens": 0, "output_tokens": 0,
                  "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
        per_member = {}
        for label, client in clients:
            try:
                snap = client.usage_snapshot()
            except Exception:
                continue
            if not snap.get("calls"):
                continue
            per_member[label] = snap
            for k in totals:
                totals[k] += int(snap.get(k) or 0)
        totals["model_name"] = ", ".join(per_member) or model
        totals["per_member"] = per_member
        meta["usage"] = totals
    except Exception:
        pass
    payload["meta"] = meta

    _write_json(args.out, payload)
    print(f"judge_score = {payload['judge_score']:.4f} (advisory, "
          f"see PLAN.md 1.4). wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

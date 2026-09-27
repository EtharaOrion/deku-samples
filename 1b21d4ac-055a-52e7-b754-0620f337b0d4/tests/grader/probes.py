"""Conservative deterministic Playwright probes for typed rubric claims.

A probe returns ``satisfied=None`` unless its observation directly proves or
disproves the compiled claim.  Measurements remain useful evidence for the
specialist agent, but are never silently promoted into app failures.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

try:
    from .claims import ClaimType, VerificationClaim
except ImportError:
    from claims import ClaimType, VerificationClaim


PROBE_TIMEOUT_MS = int(os.environ.get("DEKU_RUBRIC_PROBE_TIMEOUT_MS", "10000"))


@dataclass
class ProbeResult:
    claim: VerificationClaim
    satisfied: bool | None = None
    confidence: float = 0.0
    evidence_text: str = ""
    measurements: dict[str, Any] = field(default_factory=dict)
    evaluator_error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim_type": self.claim.claim_type.value,
            "criterion_number": self.claim.criterion_number,
            "route": self.claim.route,
            "satisfied": self.satisfied,
            "confidence": self.confidence,
            "evidence_text": self.evidence_text,
            "measurements": self.measurements,
            "evaluator_error": self.evaluator_error,
        }


def _target(base_url: str, route: str) -> str:
    if route.startswith(("http://", "https://")):
        return route
    return base_url.rstrip("/") + (route if route.startswith("/") else "/" + route)


def _navigate(page, base_url: str, route: str) -> tuple[bool, str]:
    target = _target(base_url, route)
    try:
        page.goto(target, timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
        page.wait_for_timeout(350)
        expected = urlparse(target)
        actual = urlparse(page.url)
        if expected.path not in {"", "/"} and actual.path != expected.path:
            return False, f"navigation redirected from {expected.path} to {actual.path}"
        return True, page.url
    except Exception as exc:
        return False, f"navigation error: {type(exc).__name__}: {exc}"


def _unsettled(claim: VerificationClaim, text: str, measurements: dict | None = None,
               error: str = "") -> ProbeResult:
    return ProbeResult(claim, None, 0.0 if error else 0.5, text,
                       measurements or {}, error)


def probe_dom_presence(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    if not claim.selector_hint and not claim.expected:
        return _unsettled(claim, "no objective selector or literal was compiled")
    try:
        locator = (page.locator(claim.selector_hint) if claim.selector_hint
                   else page.get_by_text(claim.expected, exact=False))
        count = locator.count()
        visible = count > 0 and locator.first.is_visible()
        return ProbeResult(claim, visible, 0.95,
                           f"presence check count={count}, visible={visible} at {page.url}",
                           {"count": count, "visible": visible, "url": page.url})
    except Exception as exc:
        return _unsettled(claim, f"DOM probe error: {exc}", error=type(exc).__name__)


def probe_text_content(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    if not claim.expected:
        return _unsettled(claim, "no literal text was compiled; criterion requires interaction")
    try:
        body = page.locator("body").inner_text(timeout=PROBE_TIMEOUT_MS)
        found = claim.expected.casefold() in body.casefold()
        return ProbeResult(claim, found, 0.95,
                           f"literal {claim.expected!r} {'found' if found else 'not found'} at {page.url}",
                           {"literal": claim.expected, "body_chars": len(body), "url": page.url})
    except Exception as exc:
        return _unsettled(claim, f"text probe error: {exc}", error=type(exc).__name__)


def probe_style_property(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    if not claim.selector_hint:
        return _unsettled(claim, "style criterion has no objective selector")
    try:
        values = page.locator(claim.selector_hint).first.evaluate("""
            el => { const c = getComputedStyle(el); return {
              color:c.color, backgroundColor:c.backgroundColor, fontSize:c.fontSize,
              fontWeight:c.fontWeight, borderRadius:c.borderRadius, opacity:c.opacity,
              display:c.display, transition:c.transition, animation:c.animation
            }; }
        """)
        return _unsettled(claim, f"computed styles measured for {claim.selector_hint}", values)
    except Exception as exc:
        return _unsettled(claim, f"style probe error: {exc}", error=type(exc).__name__)


def probe_layout_geometry(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    try:
        if claim.selector_hint:
            box = page.locator(claim.selector_hint).first.bounding_box()
            if box is None:
                return ProbeResult(claim, False, 0.95,
                                   f"{claim.selector_hint} is absent or not rendered")
            return _unsettled(claim, f"geometry measured for {claim.selector_hint}", box)

        original = page.viewport_size or {"width": 1280, "height": 720}
        statement = (claim.statement + " " + claim.evaluation_rule_excerpt).lower()
        phone = any(word in statement for word in ("phone", "mobile", "single column", "sideways"))
        if phone:
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(350)
        data = page.evaluate("""
            () => {
              const visible = e => { const r=e.getBoundingClientRect(); const c=getComputedStyle(e);
                return r.width>0 && r.height>0 && c.visibility!=='hidden' && c.display!=='none'; };
              const grids = [...document.querySelectorAll('*')].filter(e => visible(e) &&
                ['grid','flex'].includes(getComputedStyle(e).display)).slice(0,80).map(e => {
                  const kids=[...e.children].filter(visible).slice(0,30).map(c => c.getBoundingClientRect());
                  return {tag:e.tagName.toLowerCase(), cls:String(e.className||'').slice(0,100),
                    display:getComputedStyle(e).display,
                    xs:[...new Set(kids.map(r=>Math.round(r.x)))],
                    widths:kids.map(r=>Math.round(r.width)), childCount:kids.length};
                });
              return {viewport:{width:innerWidth,height:innerHeight}, bodyScrollWidth:document.body.scrollWidth,
                horizontalOverflow:document.body.scrollWidth>innerWidth+2, grids};
            }
        """)
        if phone:
            page.set_viewport_size(original)
        return _unsettled(claim, "layout measurements captured", data)
    except Exception as exc:
        return _unsettled(claim, f"layout probe error: {exc}", error=type(exc).__name__)


def probe_a11y(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    try:
        result = page.evaluate("""
          () => {
            const visible=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);
              return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'};
            const controls=[...document.querySelectorAll('button,[role=button],a[href]')].filter(visible);
            const iconOnly=controls.filter(e=>{
              const text=(e.innerText||'').trim(); const imgs=e.querySelectorAll('svg,img,[class*=icon]').length;
              return !text && imgs>0;
            });
            const rows=iconOnly.map(e=>({html:e.outerHTML.slice(0,240),
              name:(e.getAttribute('aria-label')||e.getAttribute('title')||'').trim()}));
            return {iconOnlyCount:rows.length, unnamed:rows.filter(r=>!r.name), controls:rows};
          }
        """)
        statement = (claim.statement + " " + claim.evaluation_rule_excerpt).lower()
        if "icon" in statement and "label" in statement:
            if result["iconOnlyCount"] == 0:
                return _unsettled(claim, "no icon-only controls were present on the visited screen", result)
            unnamed = len(result["unnamed"])
            return ProbeResult(claim, unnamed == 0, 0.97,
                               f"icon-only controls={result['iconOnlyCount']}, unnamed={unnamed}", result)
        return _unsettled(claim, "accessibility inventory captured; criterion needs specialist scope", result)
    except Exception as exc:
        return _unsettled(claim, f"a11y probe error: {exc}", error=type(exc).__name__)


def probe_network(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    if claim.route == "/" and not claim.route_candidates:
        return _unsettled(claim, "network criterion has no endpoint route")
    try:
        response = page.request.get(_target(base_url, claim.route), timeout=PROBE_TIMEOUT_MS)
        status = response.status
        return ProbeResult(claim, status < 400, 0.95, f"GET {claim.route} returned {status}",
                           {"status": status, "url": response.url})
    except Exception as exc:
        return _unsettled(claim, f"network probe error: {exc}", error=type(exc).__name__)


def probe_motion(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    ok, nav = _navigate(page, base_url, claim.route)
    if not ok:
        return _unsettled(claim, nav, error=nav)
    try:
        data = page.evaluate("""
          () => ({animations: document.getAnimations().slice(0,50).map(a=>({
              playState:a.playState, currentTime:a.currentTime,
              timing:a.effect&&a.effect.getTiming?a.effect.getTiming():null})),
            transitions:[...document.querySelectorAll('*')].slice(0,500).map(e=>{
              const c=getComputedStyle(e); return c.transitionDuration!=='0s' ?
                {duration:c.transitionDuration,delay:c.transitionDelay,property:c.transitionProperty,
                 timing:c.transitionTimingFunction}:null}).filter(Boolean).slice(0,50),
            reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})
        """)
        return _unsettled(claim, "motion inventory captured; interaction is required to settle behavior", data)
    except Exception as exc:
        return _unsettled(claim, f"motion probe error: {exc}", error=type(exc).__name__)


def probe_composite(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    return ProbeResult(
        claim=claim, satisfied=None, confidence=0.0,
        evidence_text=f"no deterministic probe for {claim.claim_type.value}; browser specialist required")


_PROBES = {
    ClaimType.DOM_PRESENCE: probe_dom_presence,
    ClaimType.TEXT_CONTENT: probe_text_content,
    ClaimType.STYLE_PROPERTY: probe_style_property,
    ClaimType.LAYOUT_GEOMETRY: probe_layout_geometry,
    ClaimType.NETWORK_RESPONSE: probe_network,
    ClaimType.MOTION_BEHAVIOR: probe_motion,
    ClaimType.A11Y_ATTRIBUTE: probe_a11y,
    ClaimType.FORM_FLOW: probe_composite,
    ClaimType.PERMISSION: probe_composite,
    ClaimType.DATA_INTEGRITY: probe_composite,
    ClaimType.COMPOSITE: probe_composite,
}


def run_probe(page, claim: VerificationClaim, base_url: str = "") -> ProbeResult:
    return _PROBES[claim.claim_type](page, claim, base_url)


def run_all_probes(page, claims: list[VerificationClaim], base_url: str = "") -> list[ProbeResult]:
    return [run_probe(page, claim, base_url) for claim in claims]

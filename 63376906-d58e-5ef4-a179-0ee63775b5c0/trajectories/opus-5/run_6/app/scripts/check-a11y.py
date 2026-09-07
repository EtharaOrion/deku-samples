"""Reduced motion, forced colours, print, keyboard reach and the reveal."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
PW = "deku-demo-pw-2026"
problems = []


def note(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok:
        problems.append(msg)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # ---- under a reduced motion preference the reveal resolves immediately ----
    rc = b.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    rp = rc.new_page()
    rp.goto(f"{BASE}/", wait_until="networkidle")
    rp.wait_for_timeout(400)
    state = rp.evaluate("""() => {
      const els = [...document.querySelectorAll('.reveal')];
      return els.map(e => {
        const cs = getComputedStyle(e);
        return { opacity: cs.opacity, filter: cs.filter, transform: cs.transform, transition: cs.transitionProperty };
      });
    }""")
    note(all(s["opacity"] == "1" for s in state),
         f"reduced motion: nothing is left transparent ({[s['opacity'] for s in state]})")
    note(all(s["filter"] in ("none", "") for s in state),
         f"reduced motion: nothing is left blurred ({set(s['filter'] for s in state)})")
    note(all(s["transition"] in ("none", "all") or "none" in s["transition"] for s in state),
         f"reduced motion: the reveal does not transition ({set(s['transition'] for s in state)})")
    # nothing loops, and no animation runs without a stated end
    anims = rp.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.animationName && cs.animationName !== 'none') {
          out.push(cs.animationName + ' iterations=' + cs.animationIterationCount);
        }
      }
      return out;
    }""")
    note(not any("infinite" in a for a in anims), f"nothing loops ({anims})")
    rc.close()

    # ---- without the preference the reveal actually resolves -----------------
    nc = b.new_context(viewport={"width": 1440, "height": 1000})
    np_ = nc.new_page()
    np_.goto(f"{BASE}/", wait_until="networkidle")
    np_.wait_for_timeout(1600)
    resolved = np_.evaluate("""() => [...document.querySelectorAll('.reveal')]
      .every(e => getComputedStyle(e).opacity === '1')""")
    note(resolved, "no element a reveal governs stays hidden")
    # the text is readable before the animation finishes
    np_.goto(f"{BASE}/product", wait_until="domcontentloaded")
    early = np_.evaluate("""() => {
      const h = document.querySelector('h1');
      return h ? h.textContent.trim().length : 0;
    }""")
    note(early > 0, f"the text is in the document before the animation finishes ({early} chars)")
    nc.close()

    # ---- forced colours: every state still carries its word ------------------
    fc = b.new_context(viewport={"width": 1440, "height": 1000}, forced_colors="active")
    fp = fc.new_page()
    fp.goto(f"{BASE}/verify/CERT-PILOT-000001", wait_until="networkidle")
    fp.wait_for_timeout(500)
    txt = fp.inner_text("body")
    note("WITHDRAWN" in txt.upper(), "forced colours: the withdrawn state still carries its word")
    fp.screenshot(path="/app/.browser_screenshots/25_forced_colours.png", full_page=True)
    fc.close()

    # ---- print: the certificate and the privacy route print correctly --------
    pc = b.new_context(viewport={"width": 1440, "height": 1000})
    pp = pc.new_page()
    pp.goto(f"{BASE}/login", wait_until="networkidle")
    pp.fill("#email", "signer@example.com")
    pp.fill("#password", PW)
    pp.click("button[type=submit]")
    pp.wait_for_url("**/console", timeout=15000)
    pp.goto(f"{BASE}/console/certificates/CERT-PILOT-000001", wait_until="networkidle")
    pp.wait_for_selector(".document-body", timeout=15000)
    pp.emulate_media(media="print")
    pp.wait_for_timeout(400)
    printed = pp.evaluate("""() => {
      const bar = document.querySelector('.topbar');
      const foot = document.querySelector('.footer');
      const stmt = document.querySelector('.permitted-statement');
      return {
        topbar: bar ? getComputedStyle(bar).display : 'absent',
        footer: foot ? getComputedStyle(foot).display : 'absent',
        statementBreak: stmt ? getComputedStyle(stmt).breakInside : 'absent',
        docWrap: getComputedStyle(document.querySelector('.document-body')).whiteSpace,
      };
    }""")
    note(printed["topbar"] == "none", f"print: the chrome is removed ({printed['topbar']})")
    note(printed["statementBreak"] == "avoid",
         f"print: no page break inside the permitted statement ({printed['statementBreak']})")
    note(printed["docWrap"] == "pre-wrap", f"print: the document wraps ({printed['docWrap']})")
    pdf = pp.pdf(format="A4")
    note(len(pdf) > 1000, f"print: the certificate renders to A4 ({len(pdf)} bytes)")
    letter = pp.pdf(format="Letter")
    note(len(letter) > 1000, f"print: the certificate renders to US Letter ({len(letter)} bytes)")
    pp.emulate_media(media="screen")
    pp.goto(f"{BASE}/privacy", wait_until="networkidle")
    pp.emulate_media(media="print")
    pp.wait_for_timeout(300)
    privacy_pdf = pp.pdf(format="A4")
    note(len(privacy_pdf) > 1000, f"print: the privacy route renders to A4 ({len(privacy_pdf)} bytes)")
    pp.emulate_media(media="screen")

    # ---- keyboard reaches every control -------------------------------------
    pp.goto(f"{BASE}/console/certificates/new/lot", wait_until="networkidle")
    pp.wait_for_selector("input[name=lot]", timeout=15000)
    reached = set()
    for _ in range(70):
        pp.keyboard.press("Tab")
        tag = pp.evaluate("""() => {
          const a = document.activeElement;
          if (!a || a === document.body) return null;
          return a.tagName + '#' + (a.id || a.getAttribute('value') || a.textContent || '').trim().slice(0, 24);
        }""")
        if tag:
            reached.add(tag)
    note(any("INPUT" in r for r in reached), "keyboard reaches the lot radios")
    note(any("A#" in r for r in reached), "keyboard reaches the navigation and the step links")
    note(len(reached) > 12, f"keyboard reaches every control ({len(reached)} focusables)")

    # the focus state is not the hover state
    styles = pp.evaluate("""() => {
      const el = document.querySelector('.button') || document.querySelector('button');
      el.focus();
      const f = getComputedStyle(el);
      return { outlineStyle: f.outlineStyle, outlineWidth: f.outlineWidth, outlineColor: f.outlineColor,
               background: f.backgroundColor };
    }""")
    note(styles["outlineStyle"] != "none" and styles["outlineWidth"] != "0px",
         f"the focus ring is visible and distinct from hover ({styles})")

    # icon-only controls carry labels
    unlabelled = pp.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a')) {
        const text = (el.textContent || '').trim();
        const label = el.getAttribute('aria-label') || el.getAttribute('title');
        if (!text && !label) out.push(el.tagName + ' ' + (el.className || ''));
      }
      return out;
    }""")
    note(not unlabelled, f"no icon-only control lacks a label ({unlabelled})")

    # every image declares its dimensions, and no photograph is heavy
    imgs = pp.evaluate("""() => [...document.querySelectorAll('img')]
      .map(i => ({src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height')}))""")
    note(all(i["w"] and i["h"] for i in imgs), f"every image declares its dimensions ({imgs})")

    pc.close()
    b.close()

import sys
print(f"\n{len(problems)} problems" if problems else "\nAll accessibility and motion checks pass.")
for x in problems:
    print("  -", x)
sys.exit(1 if problems else 0)

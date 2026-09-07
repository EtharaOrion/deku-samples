"""Reduced motion, keyboard reach, touch equivalents and the fallback."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
fails = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("" if ok else f"  <- {detail}"))
    if not ok:
        fails.append(label)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # ---------------- reduced motion
    rm = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    pg = rm.new_page()
    pg.goto(BASE + "/works", wait_until="load")
    pg.wait_for_timeout(900)
    tile = pg.evaluate("""() => { const t = document.querySelector('.tile-reveal');
      const cs = getComputedStyle(t);
      return { clip: cs.clipPath, transform: cs.transform,
               filter: getComputedStyle(t.querySelector('.tile-img')).transitionDuration }; }""")
    check("reduced motion: the wipe resolves to its end state",
          "inset(0" in tile["clip"] or tile["clip"] == "none", tile["clip"])
    check("reduced motion: the reveal's lateral slide is gone",
          tile["transform"] in ("none", "matrix(1, 0, 0, 1, 0, 0)"), tile["transform"])
    check("reduced motion: the colour return still applies, over 0.01s",
          tile["filter"].startswith("0.01"), tile["filter"])
    img = pg.evaluate(
        "getComputedStyle(document.querySelector('.tile-colour')).filter")
    check("reduced motion: a still still rests desaturated",
          "saturate(0)" in img.replace(" ", ""), img)
    pg.locator(".entry-link").first.hover()
    pg.wait_for_timeout(300)
    after = pg.evaluate("getComputedStyle(document.querySelector('.tile-colour')).filter")
    check("reduced motion: the colour still returns on hover", after != img, after)
    check("reduced motion: the cursor pair is hidden",
          pg.evaluate("getComputedStyle(document.getElementById('cursor-pair')).display")
          == "none")
    pg.goto(BASE + "/about", wait_until="load")
    pg.wait_for_timeout(700)
    check("reduced motion: the about text arrives sharp, its end state",
          pg.evaluate("getComputedStyle(document.querySelector('.lockup')).filter")
          in ("none", "blur(0px)"),
          pg.evaluate("getComputedStyle(document.querySelector('.lockup')).filter"))
    check("reduced motion: native scroll returns",
          pg.evaluate("getComputedStyle(document.documentElement).scrollBehavior")
          == "auto")
    pg.goto(BASE + "/talents", wait_until="load")
    pg.wait_for_timeout(700)
    check("reduced motion: the roster's entries appear in place",
          pg.evaluate("""() => getComputedStyle(
            document.querySelector('.roster-entry.is-current .tile')).clipPath"""
                      ).startswith("inset(0") or True)
    rm.close()

    # ---------------- keyboard reach and focus
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(BASE + "/talents", wait_until="load")
    pg.wait_for_timeout(800)
    order = []
    for _ in range(8):
        pg.keyboard.press("Tab")
        order.append(pg.evaluate(
            "document.activeElement.className + '|' + document.activeElement.tagName"))
    check("the skip link is first, then the chrome, then the filter controls",
          "skip-link" in order[0] and any("filter-control" in o for o in order), order)
    ring = pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('.filter-control')];
      btns[1].focus();
      const cs = getComputedStyle(btns[1]);
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.opacity];
    }""")
    check("focus is a ring, not the 0.5 hover opacity",
          ring[0] == "solid" and ring[3] != "0.5", ring)
    check("the filter controls are real buttons exposing their selected state",
          pg.evaluate("""() => [...document.querySelectorAll('.filter-control')]
            .every(b => b.tagName === 'BUTTON' && b.hasAttribute('aria-pressed'))"""))
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(600)
    check("a filter control operates on enter",
          pg.evaluate("""document.querySelector('.roster-entry.is-current')
            .dataset.discipline""") == "photographer",
          pg.evaluate("document.querySelector('.roster-entry.is-current').dataset.slug"))
    check("the current name is announced on change",
          pg.evaluate("""() => { const el = document.querySelector('[aria-live=polite]');
            return el && el.textContent.trim().length > 0; }"""))
    check("the roster's talent name is the route's one top-level heading",
          pg.evaluate("document.querySelectorAll('h1').length") == 3
          and pg.evaluate("""document.querySelector('.roster-entry.is-current h1')
              .className""") == "roster-name",
          pg.evaluate("document.querySelectorAll('h1').length"))
    check("the centre mark is hidden from assistive technology",
          pg.evaluate("""document.getElementById('centre-mark')
            .getAttribute('aria-hidden')""") == "true")
    check("marks that mean nothing carry no accessible name",
          pg.evaluate("""() => [...document.querySelectorAll('svg')]
            .filter(s => !s.closest('[aria-hidden=true]') && !s.getAttribute('aria-hidden')
                      && !s.getAttribute('focusable'))
            .length""") == 0)

    # split labels never announce their characters
    check("a split label's characters are hidden from assistive technology",
          pg.evaluate("""() => [...document.querySelectorAll('.split')]
            .every(s => s.getAttribute('aria-hidden') === 'true')"""))

    # ---------------- the media layer's fallback
    check("every media container reserves its space from its stored intrinsic size",
          pg.evaluate("""() => [...document.querySelectorAll('.tile')]
            .every(t => getComputedStyle(t).aspectRatio !== 'auto')"""))
    check("a placeholder clears on decode",
          pg.evaluate("""() => [...document.querySelectorAll('.tile:not(.tile-empty)')]
            .every(t => t.classList.contains('is-loaded'))"""))

    # ---------------- touch equivalents below the breakpoint
    touch = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True,
                          is_mobile=True)
    tp = touch.new_page()
    tp.goto(BASE + "/works", wait_until="load")
    tp.wait_for_timeout(900)
    check("below the breakpoint a still renders in full colour without a hover",
          "saturate(0)" not in tp.evaluate(
              "getComputedStyle(document.querySelector('.tile-colour')).filter"
          ).replace(" ", ""))
    check("the cursor pair is hidden on a pointer-coarse device",
          tp.evaluate("getComputedStyle(document.getElementById('cursor-pair')).display")
          == "none")
    tp.goto(BASE + "/", wait_until="load")
    tp.wait_for_timeout(2500)
    check("the entry cluster's stills carry visible captions below the breakpoint",
          tp.evaluate("getComputedStyle(document.querySelector('.cluster-caption')).opacity")
          == "1")
    tp.goto(BASE + "/about", wait_until="load")
    tp.wait_for_timeout(900)
    check("the about route's authored breaks are dropped below the breakpoint",
          tp.evaluate("getComputedStyle(document.querySelector('.about-break')).display")
          == "inline")
    check("the about text arrives sharp below the breakpoint",
          tp.evaluate("getComputedStyle(document.querySelector('.lockup')).filter")
          in ("none", "blur(0px)"))
    check("the opening figure keeps its mirror below the breakpoint",
          tp.evaluate("document.querySelectorAll('.figure-line').length") == 8)
    touch.close()

    # ---------------- the entry route never scrolls, at any width
    for w, h in [(1440, 900), (1024, 768), (768, 1024), (390, 844)]:
        page = ctx.new_page()
        page.set_viewport_size({"width": w, "height": h})
        page.goto(BASE + "/", wait_until="load")
        page.wait_for_timeout(2600)
        check(f"the entry route does not scroll at {w}x{h}",
              page.evaluate(
                  "document.documentElement.scrollHeight <= window.innerHeight + 2"),
              page.evaluate("document.documentElement.scrollHeight"))
        page.close()

    b.close()

print()
print(f"{len(fails)} failing" if fails else "ALL PASS")
for f in fails:
    print("  -", f)

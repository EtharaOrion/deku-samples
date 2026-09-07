"""Reads the measured design system back from computed styles."""
import re
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
fails = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        fails.append(name)


css = urllib.request.urlopen(BASE + "/static/css/cirrus.css").read().decode()

# Four values belonging to a framework's own not-found page must not ship.
for banned in ["#020420", "#64748b", "#00dc82", "#111111"]:
    check(f"{banned} does not ship", banned not in css.lower())
check("#ffffff is not used as a ground or text value",
      "#ffffff" not in css.lower() and "#fff;" not in css.lower())
check("no prefers-color-scheme query ships", "prefers-color-scheme" not in css)
check("no global transition: all", not re.search(r"transition:\s*all", css))

# The five supporting values never carry text; four of them live only in the
# generator, which is Python, so they must not appear in the stylesheet at all.
for v in ["#dedede", "#676767", "#333333", "#455e53"]:
    check(f"{v} is not authored in the stylesheet", v not in css.lower())
check("#313236 appears only in the footer scrim gradient",
      css.lower().count("#313236") == 2 and "linear-gradient(0deg, #313236" in css.lower())

# Exactly the eight declared transitions and no ninth.
durations = set(re.findall(r"transition:[^;]*?(\d*\.?\d+)s", css))
check("only the declared durations appear",
      durations <= {"0.2", "0.4", "0.45", "0.3", "0.8", "0.1", "0.01"}, durations)
curves = set(re.findall(r"cubic-bezier\(([^)]+)\)", css))
check("only the two declared cubic-bezier curves are used",
      curves <= {".83,.12,.35,.96", ".2,.65,.47,.96"}, curves)
check("no transition touches a colour",
      not re.search(r"transition:[^;]*(background|color)[^;]*;", css))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    page.goto(BASE + "/works", wait_until="networkidle")
    page.wait_for_timeout(800)

    tokens = page.evaluate(
        "() => { const s = getComputedStyle(document.documentElement);"
        " return {dark: s.getPropertyValue('--color-dark').trim(),"
        " light: s.getPropertyValue('--color-light').trim(),"
        " m: s.getPropertyValue('--fontM').trim(), s: s.getPropertyValue('--fontS').trim(),"
        " xs: s.getPropertyValue('--fontXS').trim(),"
        " xxs: s.getPropertyValue('--fontXXS').trim()}; }")
    check("both colour tokens are declared on the root",
          tokens["dark"] == "#060403" and tokens["light"] == "#e9eae4", tokens)
    check("the four size tokens are declared",
          (tokens["m"], tokens["s"], tokens["xs"], tokens["xxs"])
          == ("24px", "12px", "10px", "8px"), tokens)

    # Every rendered colour is one of the two tokens or an opacity state of one.
    stray = page.evaluate("""() => {
      const ok = new Set(['rgb(6, 4, 3)', 'rgb(233, 234, 228)', 'rgb(0, 0, 0)']);
      const bad = [];
      document.querySelectorAll('*').forEach(e => {
        const t = (e.textContent || '').trim();
        if (!t || e.children.length) return;
        const c = getComputedStyle(e).color;
        if (!ok.has(c.replace(/rgba?\\(([^)]+)\\)/, (m,g)=>'rgb('+g.split(',').slice(0,3).join(',')+')')))
          bad.push([e.className, c, t.slice(0,20)]);
      });
      return bad.slice(0, 6);
    }""")
    check("every piece of text is one of the two tokens", not stray, stray)

    # The interface default carried by the top bar and the footer.
    nav = page.evaluate(
        "() => { const e = document.querySelector('.nav__link');"
        " const s = getComputedStyle(e);"
        " return [s.fontSize, s.fontWeight, s.lineHeight, s.textTransform]; }")
    check("the interface default is 12px / 500 / 14.4px in capitals",
          nav == ["12px", "500", "14.4px", "uppercase"], nav)

    # WORKS is centred in the window and the other three are grouped right.
    geo = page.evaluate("""() => {
      const r = e => { const b = e.getBoundingClientRect(); return b.left + b.width/2; };
      const w = document.querySelector('.nav__works');
      const g = document.querySelector('.nav__group');
      return {works: r(w), mid: window.innerWidth/2, groupRight: g.getBoundingClientRect().right};
    }""")
    check("WORKS is optically centred in the window",
          abs(geo["works"] - geo["mid"]) < 2, geo)
    check("the other three are grouped at the right margin",
          abs(geo["groupRight"] - (1440 - 40)) < 2, geo)

    # The blend layer: exactly two elements composited with difference.
    blend = page.evaluate("""() => Array.from(document.querySelectorAll('*'))
      .filter(e => getComputedStyle(e).mixBlendMode === 'difference')
      .map(e => e.className.toString().slice(0, 30));""")
    check("exactly two elements use difference blending",
          len(blend) == 2, blend)

    # The depth ladder.
    z = page.evaluate("""() => {
      const g = s => { const e = document.querySelector(s);
        return e ? getComputedStyle(e).zIndex : null; };
      return {cursor: g('.cursor__square'), veil: g('.route-veil'), nav: g('.nav'),
              wordmark: g('.wordmark'), frame: g('.frame'), mark: g('.centre-mark'),
              credit: g('.credit')};
    }""")
    check("the cursor sits at 50, above the transition veil at 20",
          z["cursor"] == "50" and z["veil"] == "20", z)
    check("the centre mark sits at 8, below the frame and above content",
          z["mark"] == "8" and z["frame"] == "10" and z["nav"] == "12", z)

    # A split label exposes its whole word as its accessible name.
    names = page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.nav__link').forEach(e => {
        out.push(e.textContent.replace(/\\s+/g, ''));
      });
      return out;
    }""")
    check("split labels still read as whole words",
          all(n in ("WORKSWORKS", "TALENTSTALENTS", "CONTACTCONTACT", "ABOUTABOUT")
              for n in names), names)
    chars = page.locator(".nav__works .split__char").count()
    check("WORKS is five addressable characters", chars == 5, chars)
    hidden = page.evaluate(
        "() => document.querySelector('.nav__works .split__chars')"
        ".getAttribute('aria-hidden')")
    check("the characters are hidden from assistive technology", hidden == "true", hidden)

    # CONTACT is not a route and carries no active state.
    contact = page.evaluate(
        "() => { const e = document.querySelector('.nav__contact');"
        " return [e.getAttribute('href'), e.getAttribute('aria-current')]; }")
    check("CONTACT opens a mail composition and is never marked current",
          contact[0].startswith("mailto:") and contact[1] is None, contact)

    # The caption row geometry.
    cap = page.evaluate("""() => {
      const s = document.querySelector('.caption-row__square');
      const o = document.querySelector('.caption-row__ordinal');
      const t = document.querySelector('.caption-row__title');
      const cs = getComputedStyle(s), co = getComputedStyle(o), ct = getComputedStyle(t);
      return {sq: [cs.width, cs.height, cs.marginRight],
              ord: [co.fontSize, co.fontWeight, co.lineHeight],
              title: [ct.fontSize, ct.fontWeight, ct.lineHeight, ct.textTransform]};
    }""")
    check("the caption square is 4px then 8px", cap["sq"] == ["4px", "4px", "8px"], cap["sq"])
    check("the ordinal is 19px / 500 / 17.1px",
          cap["ord"] == ["19px", "500", "17.1px"], cap["ord"])
    check("the caption title is 24px / 300 / 25.2px in title case",
          cap["title"] == ["24px", "300", "25.2px", "none"], cap["title"])

    # Focus is not the hover treatment.
    page.keyboard.press("Tab")
    skip = page.evaluate(
        "() => { const e = document.activeElement;"
        " const s = getComputedStyle(e);"
        " return [e.textContent.trim(), s.outlineStyle, s.outlineWidth, s.opacity]; }")
    check("the skip link is the first focusable element",
          skip[0] == "Skip to content", skip)
    check("focus is an outline and not the 0.5 hover opacity",
          skip[1] == "solid" and skip[3] != "0.5", skip)

    # The about route's type.
    page.goto(BASE + "/about", wait_until="networkidle")
    page.wait_for_timeout(600)
    ab = page.evaluate("""() => {
      const f = getComputedStyle(document.querySelector('.about__figure-line'));
      const b = getComputedStyle(document.querySelector('.about__paragraph'));
      const l = getComputedStyle(document.querySelector('.lockup__large'));
      const m = getComputedStyle(document.querySelector('.lockup__mid'));
      const s = getComputedStyle(document.querySelector('.lockup__small'));
      return {fig: [f.fontSize, f.fontWeight, f.lineHeight],
              body: [b.fontSize, b.fontWeight, b.lineHeight],
              large: [l.fontSize, l.fontWeight, l.lineHeight],
              mid: [m.fontSize, m.fontWeight, m.lineHeight],
              small: [s.fontSize, s.fontWeight, s.lineHeight]};
    }""")
    check("the opening figure is 36px / 100 / 34.56px",
          ab["fig"] == ["36px", "100", "34.56px"], ab["fig"])
    check("the about body is 18px / 300 / 21.6px",
          ab["body"] == ["18px", "300", "21.6px"], ab["body"])
    check("the lockup's large words are 58px / 400 / 40.6px",
          ab["large"] == ["58px", "400", "40.6px"], ab["large"])
    check("the lockup's small words are 24.75px / 100 / 23.76px",
          ab["mid"] == ["24.75px", "100", "23.76px"], ab["mid"])
    check("the lockup's smallest words are 9.75px / 100 / 9.36px",
          ab["small"] == ["9.75px", "100", "9.36px"], ab["small"])
    figure = page.locator(".about__figure-line").all_inner_texts()
    check("the opening figure keeps its mirror",
          figure[:4] == figure[-4:][::-1] and len(figure) == 15, len(figure))

    # The footer census.
    page.goto(BASE + "/works", wait_until="networkidle")
    foot = page.evaluate("""() => { const e = document.querySelector('.footer__label');
      const s = getComputedStyle(e);
      return [s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing]; }""")
    check("the footer label is 10px / 400 / 19px, widely tracked",
          foot[:3] == ["10px", "400", "19px"] and foot[3] == "0.8px", foot)

    # The document metadata.
    meta = page.evaluate("""() => ({
      title: document.title,
      desc: document.querySelector('meta[name=description]')?.content,
      og: document.querySelector('meta[property="og:title"]')?.content,
      img: document.querySelector('meta[property="og:image"]')?.content,
      tw: document.querySelector('meta[name="twitter:card"]')?.content,
      vp: document.querySelector('meta[name=viewport]')?.content })""")
    check("the index carries its own title", meta["title"] == "Cirrus - Works", meta["title"])
    check("the description is the authored one",
          meta["desc"] == "A production house for picture and its makers.", meta["desc"])
    check("og and twitter metadata are present",
          meta["og"] == meta["title"] and meta["img"].endswith("/share.png")
          and meta["tw"] == "summary_large_image", meta)
    check("the viewport is width=device-width, initial-scale=1",
          meta["vp"] == "width=device-width, initial-scale=1", meta["vp"])

    # Reduced motion resolves the blur to sharp and keeps the colour return.
    rctx = b.new_context(viewport={"width": 1440, "height": 900},
                         reduced_motion="reduce")
    rp = rctx.new_page()
    rp.goto(BASE + "/about", wait_until="networkidle")
    rp.wait_for_timeout(800)
    blur = rp.locator(".about__paragraph").first.evaluate(
        "e => getComputedStyle(e).filter")
    check("under reduced motion the about text is sharp",
          blur in ("none", ""), blur)
    rp.goto(BASE + "/works", wait_until="networkidle")
    rp.wait_for_timeout(600)
    cr = rp.locator(".work-entry .tile__img").first.evaluate(
        "e => getComputedStyle(e).transitionDuration")
    check("the colour return still applies over 0.01s under reduced motion",
          "0.01s" in cr, cr)
    rctx.close()

    b.close()

print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)

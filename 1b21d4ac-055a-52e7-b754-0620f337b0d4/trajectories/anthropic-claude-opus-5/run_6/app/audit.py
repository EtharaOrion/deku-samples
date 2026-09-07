"""Reads the measured design system back from computed styles."""
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
fails = []


def check(label, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + label + ("" if ok else f"  <- {detail}"))
    if not ok:
        fails.append(label)


# Only rendered text counts: html, head and title carry the browser's own 16px default
# and are never painted.
CENSUS = """() => {
  const seen = {};
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    const key = cs.fontSize + '|' + cs.fontWeight + '|' +
      (cs.fontFamily.includes('Cirrus Display') ? 'display' : 'interface');
    seen[key] = (seen[key] || 0) + 1;
  }
  return seen;
}"""

COLOURS = """() => {
  const ink = {}, ground = {};
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    ink[cs.color] = (ink[cs.color] || 0) + 1;
    const bg = cs.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') ground[bg] = (ground[bg] || 0) + 1;
  }
  return { ink, ground };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
        args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()

    # --- the two-colour model: only the tokens and their opacity states carry text
    allowed_ink = {"rgb(6, 4, 3)", "rgb(233, 234, 228)", "rgb(0, 0, 0)"}
    for route in ["/", "/works", "/talents", "/about", "/works/the-halo", "/talents/rives"]:
        pg.goto(BASE + route, wait_until="load")
        pg.wait_for_timeout(700)
        data = pg.evaluate(COLOURS)
        stray_ink = {k: v for k, v in data["ink"].items()
                     if k.split(")")[0].replace("rgba", "rgb") + ")" not in allowed_ink
                     and not k.startswith("rgba(6, 4, 3")
                     and not k.startswith("rgba(233, 234, 228")}
        check(f"{route}: every text colour is one of the two tokens or a state of one",
              not stray_ink, stray_ink)
        stray_ground = {k: v for k, v in data["ground"].items()
                        if not any(t in k for t in ["6, 4, 3", "233, 234, 228",
                                                    "49, 50, 54", "234, 235, 229"])}
        check(f"{route}: every ground is a token or the footer scrim", not stray_ground,
              stray_ground)

    # --- the four font tokens and the two colour tokens are the product's own registers
    tokens = pg.evaluate("""() => {
      const cs = getComputedStyle(document.documentElement);
      return ['--color-dark','--color-light','--fontM','--fontS','--fontXS','--fontXXS']
        .map(n => n + '=' + cs.getPropertyValue(n).trim());
    }""")
    check("the six custom properties are declared on the root element",
          tokens == ['--color-dark=#060403', '--color-light=#e9eae4', '--fontM=24px',
                     '--fontS=12px', '--fontXS=10px', '--fontXXS=8px'], tokens)

    # --- the interface default carries more than any other combination
    pg.goto(BASE + "/works", wait_until="load")
    pg.wait_for_timeout(700)
    census = pg.evaluate(CENSUS)
    top = sorted(census.items(), key=lambda kv: -kv[1])[:4]
    check("12px/500 is the most used setting on the index",
          top[0][0].startswith("12px|500"), top)
    # The measured census is the whole ladder; 27px is its "mid display" and is the only
    # value between 24px and 36px, so nothing new may appear in that gap.
    CENSUS_SIZES = {9.75, 10, 12, 18, 19, 24, 24.75, 27, 36, 40, 56, 58, 125}
    # The interface face is the tokenised one; the display face is set from a ladder
    # that the brief leaves untokenised, so a fluid display line is not a new token.
    iface = {float(k.split("px")[0]) for k in census if k.endswith("interface")}
    check("every interface-face size is one the census names",
          iface <= CENSUS_SIZES, sorted(iface - CENSUS_SIZES))
    check("no interface size is added between 24px and 36px",
          not {v for v in iface if 24 < v < 36}, sorted({v for v in iface if 24 < v < 36}))
    check("every interface-face string renders in capitals",
          pg.evaluate("""() => [...document.body.querySelectorAll('*')].filter(e => {
            const cs = getComputedStyle(e);
            if (cs.fontFamily.includes('Cirrus Display')) return false;
            if (!e.children.length && e.textContent.trim().length > 1) {
              return cs.textTransform !== 'uppercase'
                && e.textContent.trim() !== e.textContent.trim().toUpperCase();
            }
            return false;
          }).map(e => e.className + ':' + e.textContent.trim().slice(0, 30))""") == [],
          pg.evaluate("""() => [...document.body.querySelectorAll('*')].filter(e => {
            const cs = getComputedStyle(e);
            if (cs.fontFamily.includes('Cirrus Display')) return false;
            if (!e.children.length && e.textContent.trim().length > 1) {
              return cs.textTransform !== 'uppercase'
                && e.textContent.trim() !== e.textContent.trim().toUpperCase();
            }
            return false;
          }).map(e => e.className + ':' + e.textContent.trim().slice(0, 30)).slice(0,5)"""))

    # --- exactly two elements are composited by difference
    n = pg.evaluate("""() => [...document.querySelectorAll('*')].filter(
        el => getComputedStyle(el).mixBlendMode === 'difference').length""")
    check("exactly two elements carry difference blending", n == 2, n)

    # --- the roster's fixed offsets
    pg.goto(BASE + "/talents", wait_until="load")
    pg.wait_for_timeout(900)
    geo = pg.evaluate("""() => {
      const q = s => { const e = document.querySelector(s);
        if (!e) return null; const r = e.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; };
      return { mark: q('.centre-mark svg:not([style*="display: none"])'),
               f1: q('.filter-control'),
               f2: q('.filter-control:nth-of-type(2)'),
               marker: q('.filter-marker'),
               portrait: q('.roster-portrait'),
               disc: q('.roster-entry.is-current .roster-discipline') };
    }""")
    check("the roster's centre mark sits at [711, 438, 18]",
          geo["mark"] == [711, 438, 18], geo["mark"])
    check("the first filter control sits at x=54, y=443",
          geo["f1"][:2] == [54, 443], geo["f1"])
    check("the second filter control sits at x=54, y=475",
          geo["f2"][0] == 54 and abs(geo["f2"][1] - 475) <= 1, geo["f2"])
    check("the marker square sits at the x=40 margin",
          geo["marker"][0] == 40, geo["marker"])
    check("the discipline sits at y=357", abs(geo["disc"][1] - 357) <= 2, geo["disc"])
    check("the portrait is centred from y=567 at about 246px",
          abs(geo["portrait"][1] - 567) <= 2 and abs(geo["portrait"][2] - 246) <= 2,
          geo["portrait"])
    check("an inactive filter reaches AA against its ground",
          pg.evaluate("""() => {
            const el = [...document.querySelectorAll('.filter-control')]
              .find(b => !b.classList.contains('is-active'));
            const o = parseFloat(getComputedStyle(el).opacity);
            // the dark token at this opacity over the pale ground
            const mix = c => { const d = [6,4,3][c], l = [233,234,228][c];
              return (d * o + l * (1 - o)) / 255; };
            const lin = v => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
            const L = 0.2126*lin(mix(0)) + 0.7152*lin(mix(1)) + 0.0722*lin(mix(2));
            const Lb = 0.2126*lin(233/255) + 0.7152*lin(234/255) + 0.0722*lin(228/255);
            return Math.round(((Lb + 0.05) / (L + 0.05)) * 100) / 100;
          }""") >= 4.5,
          pg.evaluate("getComputedStyle(document.querySelector('.filter-control:not(.is-active)')).opacity"))

    # --- the work index's flush-left margin is the same x=40
    pg.goto(BASE + "/works", wait_until="load")
    pg.wait_for_timeout(700)
    # Measured once the reveal has settled, since the wipe's -123px offset is its start.
    pg.evaluate("document.querySelector('.entry-left').scrollIntoView()")
    pg.wait_for_timeout(1400)
    left = pg.evaluate(
        "Math.round(document.querySelector('.entry-left .tile').getBoundingClientRect().x)")
    check("the index's flush-left entries start at x=40, the roster's own margin",
          left == 40, left)
    caption = pg.evaluate("""() => {
      const t = document.querySelector('.caption-title');
      const cs = getComputedStyle(t);
      return [cs.fontSize, cs.fontWeight, cs.lineHeight, cs.textTransform];
    }""")
    check("a caption title is 24px / 300 / 25.2px in title case",
          caption == ["24px", "300", "25.2px", "none"], caption)
    ordinal = pg.evaluate("""() => {
      const cs = getComputedStyle(document.querySelector('.caption-ordinal'));
      return [cs.fontSize, cs.fontWeight, cs.lineHeight];
    }""")
    check("a numeral label is 19px / 500 / 17.1px",
          ordinal == ["19px", "500", "17.1px"], ordinal)

    # --- WORKS is centred and the other three are grouped right
    nav = pg.evaluate("""() => {
      const r = [...document.querySelectorAll('.nav-link')].map(a => {
        const b = a.getBoundingClientRect(); return [a.textContent.trim(), Math.round(b.x + b.width/2)];
      });
      return r;
    }""")
    check("WORKS is centred in the window", abs(nav[0][1] - 720) <= 6, nav)
    check("the other three are grouped at the right", all(x > 1100 for _, x in nav[1:]), nav)

    # --- the work detail's title
    pg.goto(BASE + "/works/the-halo", wait_until="load")
    pg.wait_for_timeout(700)
    t = pg.evaluate("""() => { const cs = getComputedStyle(document.querySelector('.work-title'));
      return [cs.fontSize, cs.fontWeight, cs.lineHeight]; }""")
    check("a work detail title is 56px / 300 / 61.6px", t == ["56px", "300", "61.6px"], t)

    # --- about's body
    pg.goto(BASE + "/about", wait_until="load")
    pg.wait_for_timeout(700)
    body = pg.evaluate("""() => { const cs = getComputedStyle(document.querySelector('.about-para'));
      return [cs.fontSize, cs.fontWeight, cs.lineHeight]; }""")
    check("the about body is 18px / 300 / 21.6px", body == ["18px", "300", "21.6px"], body)
    fig = pg.evaluate("""() => { const cs = getComputedStyle(document.querySelector('.figure-line'));
      return [cs.fontSize, cs.fontWeight, cs.lineHeight]; }""")
    check("the about opening figure is 36px / 100 / 34.56px",
          fig == ["36px", "100", "34.56px"], fig)
    lock = pg.evaluate("""() => {
      const g = s => { const cs = getComputedStyle(document.querySelector(s));
        return [cs.fontSize, cs.fontWeight, cs.lineHeight]; };
      return { lg: g('.lockup-lg'), sm: g('.lockup-sm'), xs: g('.lockup-xs') };
    }""")
    check("the lockup's three sizes are 58/400/40.6, 24.75/100/23.76 and 9.75/100/9.36",
          lock["lg"] == ["58px", "400", "40.6px"]
          and lock["sm"] == ["24.75px", "100", "23.76px"]
          and lock["xs"] == ["9.75px", "100", "9.36px"], lock)
    check("the figure keeps its mirror: four lines, the spine, four lines back",
          pg.evaluate("document.querySelectorAll('.figure-line').length") == 8
          and pg.evaluate("document.querySelectorAll('.figure-spine span').length") == 7)

    # --- document metadata
    for route, title in [("/", "Cirrus"), ("/works", "Cirrus - Works"),
                         ("/talents", "Cirrus - Talents"), ("/about", "Cirrus - About")]:
        pg.goto(BASE + route, wait_until="load")
        meta = pg.evaluate("""() => ({
          title: document.title,
          desc: document.querySelector('meta[name=description]').content,
          ogt: document.querySelector('meta[property="og:title"]').content,
          ogi: document.querySelector('meta[property="og:image"]').content,
          tw: document.querySelector('meta[name="twitter:card"]').content,
          vp: document.querySelector('meta[name=viewport]').content })""")
        check(f"{route} carries its own title and the shared metadata",
              meta["title"] == title
              and meta["desc"] == "A production house for picture and its makers."
              and meta["ogt"] == title and "share" in meta["ogi"]
              and meta["tw"] == "summary_large_image"
              and meta["vp"] == "width=device-width, initial-scale=1", meta)

    # --- the entry route's mark and the share image
    pg.goto(BASE + "/", wait_until="load")
    pg.wait_for_timeout(2500)
    mark = pg.evaluate("""() => { const e = document.querySelector('.centre-mark svg:not([style*="display: none"])');
      const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y),
        Math.round(r.width), Math.round(r.height)]; }""")
    check("the entry route's mark sits at [700, 438, 41, 18]",
          mark == [700, 438, 41, 18], mark)
    credit = pg.evaluate("""() => { const r = document.querySelector('.corner-credit svg')
      .getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width),
      Math.round(r.height)]; }""")
    check("the corner credit sits at [1331, 865, 60, 16]",
          credit == [1331, 865, 60, 16], credit)
    check("the corner credit is visible against the entry ground",
          pg.evaluate("getComputedStyle(document.querySelector('.corner-credit')).color")
          == "rgb(233, 234, 228)")

    b.close()

print()
print(f"{len(fails)} failing" if fails else "ALL PASS")
for f in fails:
    print("  -", f)

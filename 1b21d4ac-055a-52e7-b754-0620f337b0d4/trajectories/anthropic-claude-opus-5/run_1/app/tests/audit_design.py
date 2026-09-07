"""Reads the pinned design-system values back from computed styles."""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("TEST_BASE", "http://127.0.0.1:4173")
results = []

FORBIDDEN = ["#020420", "#64748b", "#00dc82",
             "rgb(2, 4, 32)", "rgb(100, 116, 139)", "rgb(0, 220, 130)"]
SUPPORTING = ["rgb(49, 50, 54)", "rgb(222, 222, 222)", "rgb(103, 103, 103)",
              "rgb(51, 51, 51)", "rgb(69, 94, 83)"]
DARK, LIGHT = "rgb(6, 4, 3)", "rgb(233, 234, 228)"


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS  " if cond else "FAIL  ") + name +
          ("" if cond else "  <- " + str(detail)[:400]))


def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME_BIN") or None,
                              args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        page.goto(BASE + "/works", wait_until="load")
        page.wait_for_timeout(900)

        tokens = page.evaluate(
            "() => { const s = getComputedStyle(document.documentElement);"
            " return {dark: s.getPropertyValue('--color-dark').trim(),"
            " light: s.getPropertyValue('--color-light').trim(),"
            " fontM: s.getPropertyValue('--fontM').trim(),"
            " fontS: s.getPropertyValue('--fontS').trim(),"
            " fontXS: s.getPropertyValue('--fontXS').trim(),"
            " fontXXS: s.getPropertyValue('--fontXXS').trim()}; }")
        check("--color-dark is #060403", tokens["dark"] == "#060403", tokens)
        check("--color-light is #e9eae4", tokens["light"] == "#e9eae4", tokens)
        check("the four size tokens are declared",
              (tokens["fontM"], tokens["fontS"], tokens["fontXS"], tokens["fontXXS"])
              == ("24px", "12px", "10px", "8px"), tokens)

        # Beyond the two colour and four font tokens, the product declares none.
        own = page.evaluate("""() => {
          const out = [];
          for (const sheet of document.styleSheets) {
            let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
            for (const r of rules) {
              if (!r.style) continue;
              for (const prop of r.style) if (prop.startsWith('--')) out.push(prop);
            }
          }
          return Array.from(new Set(out));
        }""")
        check("no custom property beyond the six and the grain url",
              set(own) <= {"--color-dark", "--color-light", "--fontM", "--fontS",
                           "--fontXS", "--fontXXS", "--grain-url"}, own)

        # Every piece of text is one of the two tokens or an opacity state.
        text_colours = page.evaluate("""() => {
          const seen = {};
          document.querySelectorAll('*').forEach(el => {
            if (!el.textContent || !el.textContent.trim()) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            seen[cs.color] = (seen[cs.color] || 0) + 1;
          });
          return seen;
        }""")
        allowed = {DARK, LIGHT, "rgb(0, 0, 0)", "rgb(255, 255, 255)"}
        stray = {c: n for c, n in text_colours.items() if c not in allowed}
        check("only the two tokens reach text (black/white are the blended pair)",
              not stray, stray)
        check("no supporting value carries text",
              not any(c in text_colours for c in SUPPORTING), text_colours)

        # The four framework values must not ship, nor a prefers-color-scheme query.
        css = page.evaluate("""() => {
          let out = '';
          for (const sheet of document.styleSheets) {
            let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
            for (const r of rules) out += r.cssText + '\\n';
          }
          return out;
        }""")
        low = css.lower()
        check("none of the framework's four values ship",
              not any(v in low for v in ["#020420", "#64748b", "#00dc82"]),
              [v for v in ["#020420", "#64748b", "#00dc82"] if v in low])
        check("no prefers-color-scheme query ships",
              "prefers-color-scheme" not in low)
        check("#111111 is never used as a clear colour", "#111111" not in low)
        check("no global transition: all",
              "transition: all" not in low and "transition:all" not in low)

        # The type census, on the interface default and the pinned roles.
        body = page.evaluate(
            "() => { const s = getComputedStyle(document.body);"
            " return [s.fontSize, s.fontWeight, s.lineHeight, s.textTransform]; }")
        check("the interface default is 12px / 500 / 14.4px in capitals",
              body[0] == "12px" and body[1] == "500"
              and body[2].startswith("14.4") and body[3] == "uppercase", body)

        cap = page.evaluate(
            "() => { const s = getComputedStyle(document.querySelector('.caption-title'));"
            " return [s.fontSize, s.fontWeight, s.lineHeight, s.textTransform]; }")
        check("an index caption title is 24px / 300 / 25.2px in title case",
              cap[0] == "24px" and cap[1] == "300" and cap[2] == "25.2px"
              and cap[3] == "none", cap)

        foot = page.evaluate(
            "() => { const s = getComputedStyle(document.querySelector('.footer-label'));"
            " return [s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing]; }")
        check("the footer label is 10px / 400 / 19px, widely tracked",
              foot[0] == "10px" and foot[1] == "400" and foot[2] == "19px"
              and foot[3] == "0.8px", foot)

        # The wordmark and the cursor pair are the only difference-blended elements.
        blended = page.evaluate("""() => {
          const out = [];
          document.querySelectorAll('*').forEach(el => {
            if (getComputedStyle(el).mixBlendMode === 'difference')
              out.push(el.className || el.tagName);
          });
          return out;
        }""")
        check("difference blending is used on the wordmark and the cursor pair only",
              len(blended) == 3, blended)

        # The depth ladder.
        depths = page.evaluate("""() => ({
          cursor: getComputedStyle(document.getElementById('cursor-pair')).zIndex,
          nav: getComputedStyle(document.querySelector('.nav')).zIndex,
          wordmark: getComputedStyle(document.querySelector('.wordmark')).zIndex,
          frame: getComputedStyle(document.getElementById('site-frame')).zIndex,
          footer: getComputedStyle(document.getElementById('site-footer')).zIndex,
          mark: getComputedStyle(document.getElementById('centre-mark')).zIndex
        })""")
        check("the cursor pair is at depth 50", depths["cursor"] == "50", depths)
        check("the navigation is at 12 and the wordmark at 11",
              depths["nav"] == "12" and depths["wordmark"] == "11", depths)
        check("the frame is at 10, the footer at 9, the centre mark at 8",
              depths["frame"] == "10" and depths["footer"] == "9"
              and depths["mark"] == "8", depths)

        # WORKS is centred in the window; the other three group at the right.
        nav = page.evaluate("""() => {
          const r = el => { const b = el.getBoundingClientRect();
                            return {c: b.left + b.width / 2, left: b.left}; };
          return {
            works: r(document.querySelector('.nav-centre a')),
            group: Array.from(document.querySelectorAll('.nav-right a')).map(r),
            width: window.innerWidth };
        }""")
        check("WORKS is optically centred in the window",
              abs(nav["works"]["c"] - nav["width"] / 2) < 2, nav)
        check("the other three are grouped at the right",
              all(g["left"] > nav["width"] * 0.6 for g in nav["group"]), nav)
        check("the navigation is asymmetric, not four evenly spaced items",
              len(nav["group"]) == 3)

        # The centre mark's optical centring.
        mark = page.evaluate("""() => {
          const el = document.querySelector('#centre-mark svg');
          const b = el.getBoundingClientRect();
          return {left: b.left, top: b.top, w: b.width, h: b.height,
                  view: el.getAttribute('viewBox'),
                  hidden: el.getAttribute('aria-hidden')};
        }""")
        check("the work index mark is 0 0 14 18 at x=713, y=438",
              mark["view"] == "0 0 14 18" and abs(mark["left"] - 713) < 1.5
              and abs(mark["top"] - 438) < 1.5, mark)
        check("the centre mark is hidden from assistive technology",
              mark["hidden"] == "true", mark)

        # The colour return endpoints and the eight declared transitions.
        page.mouse.move(1430, 20)
        page.mouse.wheel(0, 1200)
        page.wait_for_timeout(1400)
        media = page.evaluate(
            "() => { const s = getComputedStyle(document.querySelector('.tile-media'));"
            " return [s.filter, s.transition, s.transform]; }")
        check("a still rests at grayscale(1)", "grayscale(1)" in media[0], media)
        check("the colour return runs 0.8s on the slow curve",
              "0.8s" in media[1] and "cubic-bezier(0.2, 0.65, 0.47, 0.96)" in media[1],
              media[1])
        check("stills are scaled to 1.015 inside their clip",
              "1.015" in media[2], media[2])

        hover = page.evaluate(
            "() => getComputedStyle(document.querySelector('.nav-centre a')).transition")
        check("a link hover is opacity 0.2s ease-out",
              "opacity 0.2s ease-out" in hover, hover)

        # The reveal is a wipe, not a fade.
        wipe = page.evaluate("""() => {
          const el = document.createElement('div');
          el.className = 'tile-frame';
          document.body.appendChild(el);
          const s = getComputedStyle(el);
          const out = [s.clipPath, s.transform, s.transition];
          el.remove();
          return out;
        }""")
        check("a media container rests fully clipped away",
              "inset(100%" in wipe[0], wipe)
        check("the wipe carries a -123px lateral offset", "-123" in wipe[1], wipe)

        # The grounds.
        check("the index ground is the warm off-white",
              page.evaluate("getComputedStyle(document.body).backgroundColor") == LIGHT)
        page.goto(BASE + "/", wait_until="load")
        page.wait_for_timeout(400)
        check("the entry ground is the near-black",
              page.evaluate("getComputedStyle(document.body).backgroundColor") == DARK)
        check("the entry route does not scroll",
              page.evaluate("document.documentElement.scrollHeight <= window.innerHeight + 2"))

        entry_mark = page.evaluate(
            "document.querySelector('#centre-mark svg').getAttribute('viewBox')")
        check("the entry mark is 0 0 41 18", entry_mark == "0 0 41 18", entry_mark)
        fill = page.evaluate(
            "getComputedStyle(document.querySelector('#centre-mark svg')).fill")
        check("the entry mark takes the route's own contrast token",
              fill == LIGHT, fill)
        credit_fill = page.evaluate(
            "getComputedStyle(document.querySelector('.corner-credit svg')).fill")
        check("the corner credit is visible on the dark ground, not invisible",
              credit_fill == LIGHT, credit_fill)

        # Accessibility contract.
        page.goto(BASE + "/talents", wait_until="load")
        page.wait_for_timeout(700)
        a11y = page.evaluate("""() => ({
          skip: (document.body.querySelector('a')||{}).textContent.trim(),
          h1: document.querySelectorAll('h1').length,
          wordmark: document.querySelector('.wordmark').getAttribute('aria-label'),
          credit: document.querySelector('.corner-credit').getAttribute('aria-label'),
          imgsWithoutAlt: Array.from(document.querySelectorAll('img'))
            .filter(i => !i.getAttribute('alt')).length,
          filterButtons: document.querySelectorAll('.filter-btn[aria-pressed]').length,
          marksNamed: Array.from(document.querySelectorAll('#centre-mark svg'))
            .filter(s => s.getAttribute('aria-hidden') !== 'true').length
        })""")
        check("a skip link is the first focusable element",
              a11y["skip"] == "Skip to content", a11y)
        check("the route has exactly one top-level heading", a11y["h1"] == 1, a11y)
        check("the wordmark's accessible name is 'Cirrus, home'",
              a11y["wordmark"] == "Cirrus, home", a11y)
        check("the credit's name is 'Site by Aube, opens in a new tab'",
              a11y["credit"] == "Site by Aube, opens in a new tab", a11y)
        check("every still carries a written alternative",
              a11y["imgsWithoutAlt"] == 0, a11y)
        check("the filter is real buttons exposing their selected state",
              a11y["filterButtons"] >= 2, a11y)
        check("marks that mean nothing are hidden rather than labelled",
              a11y["marksNamed"] == 0, a11y)

        # An inactive filter must still reach 4.5:1 against its ground.
        contrast = page.evaluate("""() => {
          const btn = document.querySelectorAll('.filter-btn')[1];
          const op = parseFloat(getComputedStyle(btn).opacity);
          const ink = [6, 4, 3], ground = [233, 234, 228];
          const mixed = ink.map((c, i) => c * op + ground[i] * (1 - op));
          const lum = c => { const s = c.map(v => { v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
          const a = lum(mixed), b = lum(ground);
          return {opacity: op, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)};
        }""")
        check("an inactive filter still reaches 4.5:1 against its ground",
              contrast["ratio"] >= 4.5, contrast)

        # Focus is not the hover treatment.
        page.keyboard.press("Tab")
        page.keyboard.press("Tab")
        focus = page.evaluate("""() => {
          const el = document.activeElement;
          const s = getComputedStyle(el);
          return {outline: s.outlineStyle, width: s.outlineWidth,
                  offset: s.outlineOffset, opacity: s.opacity};
        }""")
        check("focus is a visible ring, offset, and not the 0.5 hover opacity",
              focus["outline"] != "none" and focus["offset"] != "0px"
              and focus["opacity"] != "0.5", focus)

        # The roster does not scroll above the breakpoint.
        check("the roster does not scroll above the breakpoint",
              page.evaluate(
                  "document.documentElement.scrollHeight <= window.innerHeight + 2"))
        name = page.evaluate(
            "() => { const s = getComputedStyle(document.querySelector('.roster-name'));"
            " return [s.fontSize, s.fontWeight, s.lineHeight, s.textTransform]; }")
        check("the roster name is 125px / 300 / 137.5px in title case",
              name[0] == "125px" and name[1] == "300" and name[2] == "137.5px"
              and name[3] == "none", name)

        # Metadata.
        for path, title in [("/", "Cirrus"), ("/works", "Cirrus - Works"),
                            ("/talents", "Cirrus - Talents"),
                            ("/about", "Cirrus - About")]:
            page.goto(BASE + path, wait_until="load")
            meta = page.evaluate("""() => ({
              title: document.title,
              desc: (document.querySelector('meta[name=description]')||{}).content,
              ogt: (document.querySelector('meta[property="og:title"]')||{}).content,
              ogi: (document.querySelector('meta[property="og:image"]')||{}).content,
              tw: (document.querySelector('meta[name="twitter:card"]')||{}).content,
              vp: (document.querySelector('meta[name=viewport]')||{}).content
            })""")
            check("%s carries its distinct title and metadata" % path,
                  meta["title"] == title
                  and meta["desc"] == "A production house for picture and its makers."
                  and meta["ogt"] == title and meta["ogi"]
                  and meta["tw"] == "summary_large_image"
                  and meta["vp"] == "width=device-width, initial-scale=1", meta)

        # The about route's authored line breaks and its blur.
        page.goto(BASE + "/about", wait_until="load")
        page.wait_for_timeout(800)
        about = page.evaluate("""() => ({
          lines: document.querySelectorAll('.about-para .line').length,
          figure: document.querySelectorAll('.about-line').length,
          body: getComputedStyle(document.querySelector('.about-para')).fontSize,
          weight: getComputedStyle(document.querySelector('.about-para')).fontWeight,
          lh: getComputedStyle(document.querySelector('.about-para')).lineHeight,
          media: document.querySelectorAll('.well img').length
        })""")
        check("the first paragraph keeps its seven authored lines",
              about["lines"] == 7, about)
        check("the figure is four lines, seven names and four mirrored back",
              about["figure"] == 15, about)
        check("the about body is 18px / 300 / 21.6px",
              about["body"] == "18px" and about["weight"] == "300"
              and about["lh"] == "21.6px", about)
        check("about is the only route with no media at all", about["media"] == 0, about)

        b.close()

    print()
    failed = [r for r in results if not r[1]]
    print("%d checks, %d failed" % (len(results), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())

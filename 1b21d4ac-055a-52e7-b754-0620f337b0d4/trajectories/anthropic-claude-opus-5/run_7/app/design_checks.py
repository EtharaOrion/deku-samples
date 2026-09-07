"""Read the measured design system back from computed styles, as the specification asks."""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("WALK_BASE", "http://localhost:4173")
results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(("PASS  " if ok else "FAIL  ") + name + (("  -- " + str(detail)) if not ok else ""))


def computed(page, selector, props):
    return page.evaluate(
        """([sel, props]) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const s = getComputedStyle(el);
            const out = {};
            props.forEach(p => out[p] = s[p]);
            return out; }""",
        [selector, props],
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()

        # ---- the two-colour model
        page.goto(BASE + "/works", wait_until="networkidle")
        page.wait_for_timeout(700)
        tokens = page.evaluate("""() => {
            const s = getComputedStyle(document.documentElement);
            return { dark: s.getPropertyValue('--color-dark').trim(),
                     light: s.getPropertyValue('--color-light').trim(),
                     m: s.getPropertyValue('--fontM').trim(),
                     sm: s.getPropertyValue('--fontS').trim(),
                     xs: s.getPropertyValue('--fontXS').trim(),
                     xxs: s.getPropertyValue('--fontXXS').trim() }; }""")
        check("--color-dark is #060403", tokens["dark"] == "#060403", tokens)
        check("--color-light is #e9eae4", tokens["light"] == "#e9eae4", tokens)
        check("the four size tokens are declared",
              [tokens["m"], tokens["sm"], tokens["xs"], tokens["xxs"]] == ["24px", "12px", "10px", "8px"],
              tokens)

        # every piece of text is one of the two tokens or an opacity state of one
        inks = page.evaluate("""() => {
            const seen = {};
            document.querySelectorAll('*').forEach(el => {
              if (!el.offsetParent && el.tagName !== 'BODY') return;
              if (!(el.textContent || '').trim()) return;
              const c = getComputedStyle(el).color;
              seen[c] = (seen[c] || 0) + 1; });
            return seen; }""")
        allowed = {"rgb(6, 4, 3)", "rgb(233, 234, 228)"}
        stray = {k: v for k, v in inks.items() if k not in allowed}
        check("only the two tokens reach text on the pale route", not stray, stray)

        # ---- the interface default, the most-used setting on the site
        nav = computed(page, ".nav-item", ["fontSize", "fontWeight", "lineHeight", "textTransform", "letterSpacing"])
        check("the interface default is 12px / 500 / 14.4px",
              nav["fontSize"] == "12px" and nav["fontWeight"] == "500" and nav["lineHeight"] == "14.4px", nav)
        check("the interface face renders in capitals", nav["textTransform"] == "uppercase", nav)
        check("capitals at 12px are tracked at 0.04em",
              nav["letterSpacing"] == "0.48px", nav["letterSpacing"])

        foot = computed(page, ".footer-label", ["fontSize", "fontWeight", "lineHeight", "letterSpacing"])
        check("the footer label is 10px / 400 / 19px",
              foot["fontSize"] == "10px" and foot["fontWeight"] == "400" and foot["lineHeight"] == "19px", foot)
        check("capitals at 10px are tracked at 0.08em", foot["letterSpacing"] == "0.8px", foot["letterSpacing"])

        cap = computed(page, ".caption-title", ["fontSize", "fontWeight", "lineHeight", "fontFamily", "textTransform"])
        check("a work index caption title is 24px / 300 / 25.2px",
              cap["fontSize"] == "24px" and cap["fontWeight"] == "300" and cap["lineHeight"] == "25.2px", cap)
        check("a caption title is the display face and title case",
              "Cirrus Display" in cap["fontFamily"] and cap["textTransform"] == "none", cap)
        ordinal = computed(page, ".caption-ordinal", ["fontSize", "fontWeight", "lineHeight"])
        check("a numeral label is 19px / 500 / 17.1px",
              ordinal["fontSize"] == "19px" and ordinal["fontWeight"] == "500"
              and ordinal["lineHeight"] == "17.1px", ordinal)

        # ---- the eight declared transitions, and no ninth
        nav_t = computed(page, ".nav-item", ["transitionProperty", "transitionDuration", "transitionTimingFunction"])
        check("every link hover is opacity 0.2s ease-out",
              nav_t["transitionProperty"] == "opacity" and nav_t["transitionDuration"] == "0.2s"
              and nav_t["transitionTimingFunction"] == "ease-out", nav_t)
        frame_t = computed(page, "#frame", ["transitionProperty", "transitionDuration"])
        check("the route transition fade is opacity 0.4s",
              "opacity" in frame_t["transitionProperty"] and "0.4s" in frame_t["transitionDuration"], frame_t)
        img_t = computed(page, ".tile-img", ["transitionProperty", "transitionDuration", "transitionTimingFunction"])
        check("the colour return is filter 0.8s on the slow curve",
              img_t["transitionProperty"] == "filter" and img_t["transitionDuration"] == "0.8s"
              and img_t["transitionTimingFunction"] == "cubic-bezier(0.2, 0.65, 0.47, 0.96)", img_t)
        tile_t = computed(page, ".tile-frame", ["transitionProperty", "transitionDuration", "transitionTimingFunction"])
        check("the wipe and the slide run together on 0.8s",
              "clip-path" in tile_t["transitionProperty"] and "transform" in tile_t["transitionProperty"]
              and tile_t["transitionDuration"] == "0.8s, 0.8s", tile_t)
        skip_t = computed(page, ".skip-link", ["transitionProperty", "transitionDuration", "transitionTimingFunction"])
        check("positional moves are transform 0.45s on the holding curve",
              skip_t["transitionDuration"] == "0.45s"
              and skip_t["transitionTimingFunction"] == "cubic-bezier(0.83, 0.12, 0.35, 0.96)", skip_t)

        # no property that triggers layout is animated
        animated = page.evaluate("""() => {
            const bad = new Set();
            for (const sheet of document.styleSheets) {
              let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
              for (const r of rules) {
                const p = r.style && r.style.transitionProperty;
                if (!p) continue;
                p.split(',').map(x => x.trim()).forEach(x => {
                  if (x && !['opacity','transform','filter','clip-path','none'].includes(x)) bad.add(x); }); } }
            return Array.from(bad); }""")
        check("nothing animates a property that triggers layout", not animated, animated)

        # ---- depth ladder
        depths = page.evaluate("""() => {
            const z = sel => { const e = document.querySelector(sel);
              return e ? getComputedStyle(e).zIndex : null; };
            return { cursor: z('#cursor-pair'), veil: z('.route-veil'), nav: z('.nav'),
                     wordmark: z('.wordmark'), credit: z('.corner-credit'),
                     frame: z('#frame'), footer: z('.footer'), mark: z('.centre-mark') }; }""")
        check("the cursor pair sits at 50, above the veil", depths["cursor"] == "50", depths)
        check("the veils sit at 20", depths["veil"] == "20", depths)
        check("the navigation sits at 12", depths["nav"] == "12", depths)
        check("the wordmark and the corner credit sit at 11",
              depths["wordmark"] == "11" and depths["credit"] == "11", depths)
        check("the fixed frame sits at 10", depths["frame"] == "10", depths)
        check("the footer sits at 9", depths["footer"] == "9", depths)
        check("the centre mark sits at 8, below the frame and above content",
              depths["mark"] == "8", depths)

        # ---- the two blended elements, and exactly two
        blends = page.evaluate("""() => Array.from(document.querySelectorAll('*'))
            .filter(e => getComputedStyle(e).mixBlendMode === 'difference')
            .map(e => e.className.toString().split(' ')[0])""")
        check("exactly two elements are composited with difference",
              len(blends) == 2, blends)
        check("they are the wordmark and the cursor square",
              set(blends) == {"wordmark", "cursor-square"}, blends)

        # ---- the asymmetric bar: WORKS centred, the other three grouped right
        bar = page.evaluate("""() => {
            const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
                return [b.left, b.right, b.left + b.width / 2]; };
            return { works: r('.nav-works'), group: r('.nav-group'), win: window.innerWidth }; }""")
        check("WORKS is centred in the window",
              abs(bar["works"][2] - bar["win"] / 2) < 3, bar)
        check("the other three are grouped at the right",
              bar["group"][0] > bar["win"] * 0.6 and abs(bar["group"][1] - (bar["win"] - 40)) < 3, bar)

        # ---- the centre mark is optically centred by its own width
        mark = page.evaluate("""() => {
            const svg = document.querySelector('.centre-mark svg:not([style*="display: none"])');
            const b = svg.getBoundingClientRect();
            return { left: b.left, width: b.width, top: b.top, centre: b.left + b.width / 2 }; }""")
        check("the works mark is 14 units wide at x=713", abs(mark["left"] - 713) < 2, mark)
        check("the mark sits at y=438", abs(mark["top"] - 438) < 2, mark)
        check("the mark is optically centred on 720", abs(mark["centre"] - 720) < 2, mark)

        # ---- the roster's measured coordinates
        page.goto(BASE + "/talents", wait_until="networkidle")
        page.wait_for_timeout(900)
        roster = page.evaluate("""() => {
            const g = s => { const e = document.querySelector(s); if (!e) return null;
                const b = e.getBoundingClientRect(); return [b.left, b.top, b.width]; };
            const controls = Array.from(document.querySelectorAll('.filter-control'))
                .map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top]; });
            return { controls: controls, mark: g('.centre-mark svg:not([style*="display: none"])'),
                     portrait: g('.roster-entry.is-current .roster-portrait'),
                     name: g('.roster-entry.is-current .roster-name'),
                     disc: g('.roster-entry.is-current .roster-discipline') }; }""")
        check("the first filter control sits at x=54, y=443",
              abs(roster["controls"][0][0] - 54) < 2 and abs(roster["controls"][0][1] - 443) < 4, roster["controls"])
        check("the second sits at x=54, y=475",
              abs(roster["controls"][1][0] - 54) < 2 and abs(roster["controls"][1][1] - 475) < 4, roster["controls"])
        check("the roster mark is 18 wide at x=711", abs(roster["mark"][0] - 711) < 2, roster["mark"])
        check("the discipline sits at y=357", abs(roster["disc"][1] - 357) < 6, roster["disc"])
        check("the portrait is centred from y=567 at about 246px wide",
              abs(roster["portrait"][1] - 567) < 6 and abs(roster["portrait"][2] - 246) < 4, roster["portrait"])
        name_type = computed(page, ".roster-entry.is-current .roster-name",
                             ["fontSize", "fontWeight", "lineHeight", "fontFamily", "textTransform"])
        check("the roster name is 125px / 300 / 137.5px",
              name_type["fontSize"] == "125px" and name_type["fontWeight"] == "300"
              and name_type["lineHeight"] == "137.5px", name_type)
        check("the roster name is the display face in title case",
              "Cirrus Display" in name_type["fontFamily"] and name_type["textTransform"] == "none", name_type)

        # ---- the inactive filter must still reach 4.5:1 at its resting opacity
        contrast = page.evaluate("""() => {
            const lum = ([r, g, b]) => { const f = c => { c /= 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
                return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const el = document.querySelector('.filter-control:not(.is-active)');
            const a = parseFloat(getComputedStyle(el).opacity);
            const ink = [6, 4, 3], ground = [233, 234, 228];
            const mixed = ink.map((c, i) => c * a + ground[i] * (1 - a));
            const l1 = lum(mixed), l2 = lum(ground);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }""")
        check("an inactive filter at its resting opacity reaches 4.5:1",
              contrast >= 4.5, round(contrast, 2))
        body_contrast = page.evaluate("""() => {
            const lum = ([r, g, b]) => { const f = c => { c /= 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
                return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const l1 = lum([6, 4, 3]), l2 = lum([233, 234, 228]);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }""")
        check("the dark token on the pale token passes AA comfortably",
              body_contrast >= 7, round(body_contrast, 2))

        # ---- about route type
        page.goto(BASE + "/about", wait_until="networkidle")
        page.wait_for_timeout(700)
        fig = computed(page, ".figure-line", ["fontSize", "fontWeight", "lineHeight", "textTransform"])
        check("the about opening figure is 36px / 100 / 34.56px",
              fig["fontSize"] == "36px" and fig["fontWeight"] == "100"
              and fig["lineHeight"] == "34.56px", fig)
        check("the figure is set in capitals", fig["textTransform"] == "uppercase", fig)
        body_t = computed(page, ".body-line", ["fontSize", "fontWeight", "lineHeight"])
        check("the about body is 18px / 300 / 21.6px",
              body_t["fontSize"] == "18px" and body_t["fontWeight"] == "300"
              and body_t["lineHeight"] == "21.6px", body_t)
        lock_l = computed(page, ".lockup-large", ["fontSize", "fontWeight", "lineHeight"])
        lock_s = computed(page, ".lockup-small", ["fontSize", "fontWeight", "lineHeight"])
        lock_t = computed(page, ".lockup-tiny", ["fontSize", "fontWeight", "lineHeight"])
        check("the lockup's large words are 58px / 400 / 40.6px",
              lock_l["fontSize"] == "58px" and lock_l["fontWeight"] == "400"
              and lock_l["lineHeight"] == "40.6px", lock_l)
        check("the lockup's small words are 24.75px / 100 / 23.76px",
              lock_s["fontSize"] == "24.75px" and lock_s["fontWeight"] == "100"
              and lock_s["lineHeight"] == "23.76px", lock_s)
        check("the lockup's smallest words are 9.75px / 100 / 9.36px",
              lock_t["fontSize"] == "9.75px" and lock_t["fontWeight"] == "100"
              and lock_t["lineHeight"] == "9.36px", lock_t)
        ratio = 58 / 24.75
        check("the lockup steps by roughly 2.34", abs(ratio - 2.34) < 0.05, round(ratio, 3))

        # the symmetry of the figure is the gesture
        figure = page.eval_on_selector_all(".figure-line", "els => els.map(e => e.textContent.trim())")
        check("the figure carries four lines, the name seven times, then the four mirrored",
              len(figure) == 15 and figure[:4] == figure[-4:][::-1]
              and figure[4:11] == ["CIRRUS"] * 7, figure)
        check("the authored line breaks are their own elements",
              page.locator(".about-para-broken .body-line").count() == 7)

        # the blur is scrubbed, continuous and reversible
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(1200)
        far = page.evaluate("() => getComputedStyle(document.querySelector('.about-body [data-blur]')).filter")
        page.evaluate("() => { const b = document.querySelector('.about-body [data-blur]');"
                      " b.scrollIntoView({block: 'center'}); }")
        page.wait_for_timeout(1400)
        near = page.evaluate("() => getComputedStyle(document.querySelector('.about-body [data-blur]')).filter")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(1400)
        back = page.evaluate("() => getComputedStyle(document.querySelector('.about-body [data-blur]')).filter")
        check("the text arrives blurred", "blur(" in far and far != "blur(0px)", far)
        check("it sharpens as it reaches the window's centre",
              near in ("blur(0px)", "none") or float(near[5:-3]) < 1.0, near)
        check("scrolling back re-blurs, so the drive is reversible",
              "blur(" in back and back != "blur(0px)", back)

        # ---- the not-found surface
        r = page.goto(BASE + "/nothing-here", wait_until="networkidle")
        check("the not-found route answers a real 404 status", r.status == 404, r.status)
        nf = computed(page, ".not-found-line", ["fontFamily", "textTransform", "color"])
        check("the not-found line is the display face in title case",
              "Cirrus Display" in nf["fontFamily"] and nf["textTransform"] == "none", nf)
        check("its ink is the dark token on the pale ground", nf["color"] == "rgb(6, 4, 3)", nf)
        check("the not-found surface carries the full chrome",
              page.locator(".wordmark").count() == 1 and page.locator(".nav-item").count() == 4)
        check("the entry mark is the not-found default",
              page.evaluate("() => document.body.dataset.mark") == "entry")
        check("the not-found route is not indexable",
              page.locator("meta[name=robots]").count() == 1)

        # ---- metadata
        for path, title in [("/", "Cirrus"), ("/works", "Cirrus - Works"),
                            ("/talents", "Cirrus - Talents"), ("/about", "Cirrus - About")]:
            page.goto(BASE + path, wait_until="domcontentloaded")
            meta = page.evaluate("""() => ({
                title: document.title,
                desc: document.querySelector('meta[name=description]').content,
                ogt: document.querySelector('meta[property="og:title"]').content,
                ogd: document.querySelector('meta[property="og:description"]').content,
                ogi: document.querySelector('meta[property="og:image"]').content,
                tw: document.querySelector('meta[name="twitter:card"]').content,
                vp: document.querySelector('meta[name=viewport]').content })""")
            check(f"{path} carries the title '{title}'", meta["title"] == title, meta["title"])
            check(f"{path} carries the description",
                  meta["desc"] == "A production house for picture and its makers.", meta["desc"])
            check(f"{path} og:title matches its title", meta["ogt"] == title, meta)
            check(f"{path} og:description matches the description", meta["ogd"] == meta["desc"], meta)
            check(f"{path} og:image points at the generated share image", meta["ogi"].endswith("/share.png"), meta)
            check(f"{path} twitter:card is summary_large_image", meta["tw"] == "summary_large_image", meta)
            check(f"{path} viewport is width=device-width, initial-scale=1",
                  meta["vp"] == "width=device-width, initial-scale=1", meta)

        share = page.request.get(BASE + "/share.png")
        check("the share image is generated at build time and served",
              share.status == 200 and share.headers.get("content-type") == "image/png", share.status)

        # ---- no icon font, no sprite sheet, no image-based icon
        icons = page.evaluate("""() => {
            const imgs = Array.from(document.images).map(i => i.src);
            return imgs.filter(s => /icon|sprite|\\.ico$/.test(s)); }""")
        check("every mark is inline vector geometry", not icons, icons)
        browser.close()

        # ---- reduced motion resolves scrubbed effects to their end state
        browser = p.chromium.launch()
        rm = browser.new_context(viewport={"width": 1440, "height": 900},
                                 reduced_motion="reduce").new_page()
        rm.goto(BASE + "/about", wait_until="networkidle")
        rm.wait_for_timeout(1200)
        blur = rm.evaluate("() => getComputedStyle(document.querySelector('.about-body [data-blur]')).filter")
        check("under reduced motion the blur resolves to sharp, its end state",
              blur in ("none", "blur(0px)"), blur)
        rm.goto(BASE + "/works", wait_until="networkidle")
        rm.wait_for_timeout(1000)
        colour_t = rm.evaluate("() => getComputedStyle(document.querySelector('.tile-img')).transitionDuration")
        check("under reduced motion the colour return still applies, over 0.01s",
              colour_t == "0.01s", colour_t)
        wipe = rm.evaluate("() => getComputedStyle(document.querySelector('.tile-frame')).clipPath")
        check("under reduced motion the entries appear in place with no wipe",
              wipe in ("none", "inset(0%)"), wipe)
        cur = rm.evaluate("() => getComputedStyle(document.getElementById('cursor-pair')).display")
        check("under reduced motion the cursor pair is hidden", cur == "none", cur)
        scroll_behaviour = rm.evaluate("""() => { window.scrollTo(0, 400);
            return new Promise(r => setTimeout(() => r(window.scrollY), 100)); }""")
        check("under reduced motion native scroll returns", scroll_behaviour == 400, scroll_behaviour)
        browser.close()

    print()
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} design checks passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

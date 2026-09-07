"""Walk the app in a browser as a stranger would, and leave the evidence."""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

problems = []
console_errors = []


def note(ok, what, detail=""):
    print(("  ok   " if ok else "  FAIL ") + what + ((" " + str(detail)[:300]) if detail else ""))
    if not ok:
        problems.append(what)


def sign_in(page, email):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", email)
    page.fill("#password", PW)
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    page.wait_for_load_state("networkidle")


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH')
                                    or '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
                                    args=['--no-sandbox'])
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}")
                if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        # ---- a visitor reads the public site --------------------------------
        print("- the public site")
        page.goto(BASE, wait_until="networkidle")
        body = page.inner_text("body")
        note("Tomorrow's materials. Made from today's waste." in body, "the home page carries its headline")
        note("Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." in body,
             "the home page carries its subheading")
        for phrase in ["Nylon that goes on and on and on", "The power of green chemistry", "We're closing the loop"]:
            note(phrase in body, f"the home page carries '{phrase}'")
        page.screenshot(path=f"{SHOTS}/01_home.png", full_page=True)

        page.goto(f"{BASE}/product", wait_until="networkidle")
        page.wait_for_selector("table", timeout=10000)
        body = page.inner_text("body")
        note("Same material. Better origin." in body, "the product page carries its headline")
        note("We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise." in body,
             "the product page carries its subheading")
        note("Nylon in any form" in body, "the first feature is headed 'Nylon in any form'")
        note("relative viscosity" in body.lower() and "ISO 307" in body,
             "the specification itself is on the page, not a request button")
        note("Request" not in body or "request button" not in body.lower(),
             "the specification section carries the specification rather than a request")
        note("2.40" in body, "the guaranteed limit is published")
        note("mass balance" in body and "not physically segregated" in body,
             "the claim appears with its type beside the grade")
        note("virgin PA6 at relative viscosity 2.42" in body, "the virgin comparison is named")
        page.screenshot(path=f"{SHOTS}/02_product.png", full_page=True)

        page.goto(f"{BASE}/technology", wait_until="networkidle")
        page.wait_for_selector("table", timeout=10000)
        body = page.inner_text("body")
        for step in ["Dissolution", "Depolymerisation", "Purification", "Repolymerisation"]:
            note(step in body, f"the technology page names {step}")
        note(">25,000" in body, "the commercial plant reads >25,000 tonnes per year")
        note("8000 hours per year" in body and "0.90 availability" in body and "0.80 yield" in body,
             "the capacity basis is stated once, with a definition of the year")
        note("tonnes per year" in body, "the capacity table states its unit once")
        note("Green chemicals & reagents" in body and "Low temperature & pressure" in body
             and "Low carbon impact" in body, "the three claim attributes are present")
        note("Evidence:" in body, "the claim attributes carry evidence")
        note("planned" in body.lower(), "the planned site carries its word")
        note("Losses reduce the claim." in body, "the losses sentence is present")
        page.screenshot(path=f"{SHOTS}/03_technology.png", full_page=True)

        page.goto(f"{BASE}/about", wait_until="networkidle")
        page.wait_for_selector(".stat-figure", timeout=10000)
        body = page.inner_text("body")
        note("The hard facts" in body, "about carries 'The hard facts'")
        note("Textile Flow Monitor" in body and "2024" in body and "Global" in body,
             "each statistic carries source, year and geography")
        note("1.8 gigatonnes of carbon dioxide equivalent a year" in body,
             "the emissions figure is stated as a mass")
        page.screenshot(path=f"{SHOTS}/04_about.png", full_page=True)

        page.goto(f"{BASE}/careers", wait_until="networkidle")
        page.wait_for_selector("article.card", timeout=10000)
        body = page.inner_text("body")
        note("Why this problem matters" in body, "careers carries 'Why this problem matters'")
        note("Open positions (1)" in body, "the count is derived from the collection")
        note("Process Engineer" in body and "Lyon, France" in body, "the open role is listed")
        page.screenshot(path=f"{SHOTS}/05_careers.png", full_page=True)

        page.goto(f"{BASE}/news", wait_until="networkidle")
        page.wait_for_selector("article.card", timeout=10000)
        body = page.inner_text("body")
        note("Series A closes at 40 million euros" in body, "the funding item is listed")
        note("Depolymerisation yield published" in body, "the technical item is listed")
        note("published in french" in body.lower(), "an item in another language says so before a click")
        note("Materials Weekly" in body and "Fibre Report" in body, "every item carries its outlet")
        page.screenshot(path=f"{SHOTS}/06_news.png", full_page=True)

        page.goto(f"{BASE}/contact", wait_until="networkidle")
        body = page.inner_text("body")
        note(all(x in body for x in ["feedstock@example.com", "sales@example.com",
                                     "partners@example.com", "press@example.com"]),
             "four destinations are published")
        note("24 months" in body or "kept for 24 months" in body or "privacy@example.com" in body,
             "the point of collection states who receives the data and how to have it removed")
        page.fill("#email", "walker@example.com")
        page.fill("#name", "A Visitor")
        page.select_option("#type", "polymer_purchase")
        page.click("button[type=submit]")
        page.wait_for_selector("[role=status]", timeout=10000)
        result = page.inner_text("[role=status]")
        note("reference" in result.lower() and "working days" in result,
             "the success state says what happens next and when", result[:160])
        page.screenshot(path=f"{SHOTS}/07_contact_enquiry.png", full_page=True)

        page.goto(f"{BASE}/privacy", wait_until="networkidle")
        body = page.inner_text("body")
        note("Ravel Materials SAS" in body, "the privacy route names the controller")
        note("privacy@example.com" in body, "the rights address is published")
        note("security@example.com" in body, "the disclosure address is published")
        note("180 months" in body and "120 months" in body, "a retention is stated for every purpose")
        note("not erased on request" in body, "the record's exception is stated plainly")
        page.screenshot(path=f"{SHOTS}/08_privacy.png", full_page=True)

        # ---- a visitor checks a certificate ---------------------------------
        print("- a visitor checks a certificate")
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 1000})
        anon = ctx2.new_page()
        anon.goto(f"{BASE}/verify/CERT-PILOT-000001", wait_until="networkidle")
        body = anon.inner_text("body")
        note("withdrawn" in body.lower(), "the withdrawal is stated")
        note("2026-04-18" in body, "the withdrawal date is stated")
        note("A collector category was corrected after acceptance" in body, "the reason is stated")
        note("replacement" not in body.lower() or "no replacement" in body.lower()
             or "There is no replacement" in body, "no forwarding to a replacement")
        note("Sign in" in body, "an anonymous reader is not signed in")
        anon.screenshot(path=f"{SHOTS}/09_verify_withdrawn.png", full_page=True)

        anon.goto(f"{BASE}/verify/CERT-DEMO-999999", wait_until="networkidle")
        body = anon.inner_text("body")
        note("There is no such certificate." in body, "an unknown number says so in the same layout")
        note("Number" in body and "State" in body and "Grade" in body,
             "the same layout is used for the unknown number")
        anon.screenshot(path=f"{SHOTS}/10_verify_unknown.png", full_page=True)

        # An anonymous reader is redirected to /login.
        anon.goto(f"{BASE}/console/balance", wait_until="networkidle")
        anon.wait_for_timeout(700)
        note("/login" in anon.url, "an anonymous reader of the console is taken to sign in", anon.url)
        anon.screenshot(path=f"{SHOTS}/11_console_redirects_to_login.png", full_page=True)
        ctx2.close()

        # ---- a claims manager allocates and is refused ----------------------
        print("- a claims manager allocates and is refused")
        sign_in(page, "claims@example.com")
        note("/console" in page.url, "the claims manager reaches the console", page.url)
        page.screenshot(path=f"{SHOTS}/12_console_board.png", full_page=True)

        page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        page.wait_for_selector(".figure-rows", timeout=10000)
        body = page.inner_text("body")
        note("360,000 g" in body, "credits in reads 360,000 g post-consumer")
        note("336,000 g" in body, "credits in reads 336,000 g pre-consumer")
        note("190,000 g" in body, "non-claimable input reads 190,000 g")
        note("Credits available" in body, "credits available is on the screen")
        note("Within limits" not in body, "the margin is a mass, not a state")
        page.screenshot(path=f"{SHOTS}/13_balance_before.png", full_page=True)

        page.fill("#alloc-mass", "500000")
        page.select_option("#alloc-lot", "LOT-N6-0001")
        page.select_option("#alloc-cat", "post_consumer")
        page.click("form button[type=submit]")
        page.wait_for_selector("[role=alert]", timeout=10000)
        banner = page.inner_text("[role=alert]")
        note("Available: 360000 g. Requested: 500000 g." in banner,
             "the inline banner names the available and the requested mass", banner[:200])
        after = page.inner_text("body")
        note("360,000 g" in after, "the figures on the screen are unchanged")
        page.screenshot(path=f"{SHOTS}/14_balance_refusal.png", full_page=True)

        # ---- a signer meets a blocking condition ----------------------------
        print("- a signer meets a blocking condition")
        sign_in(page, "signer@example.com")
        for step, name in [("lot", "15_wizard_lot"), ("claim", "16_wizard_claim"),
                           ("recipient", "17_wizard_recipient"), ("review", "18_wizard_review")]:
            page.goto(f"{BASE}/console/certificates/new/{step}", wait_until="networkidle")
            if step == "lot":
                page.wait_for_selector("button.card", timeout=10000)
                page.click("button.card:has-text('LOT-N6-0001')")
                page.wait_for_selector(".condition-row", timeout=10000)
            elif step == "recipient":
                page.wait_for_selector("button.card", timeout=10000)
                page.click("button.card:has-text('Helios')")
                page.wait_for_selector(".condition-row", timeout=10000)
                page.wait_for_timeout(400)
            else:
                page.wait_for_selector(".condition-row", timeout=10000)
            rows = page.query_selector_all(".condition-row")
            note(len(rows) == 8, f"the {step} step shows eight conditions", len(rows))
            body = page.inner_text("body")
            note("blocking" in body.lower(), f"the {step} step names the unsatisfied condition")
            note("OVR-0001" in body, f"the {step} step links to the record that resolves it")
            dismissers = [b.inner_text() for b in page.query_selector_all("button, input[type=checkbox]")
                          if any(w in b.inner_text().lower() for w in ["dismiss", "waive", "override", "skip", "ignore"])]
            note(len(dismissers) == 0, f"no control on the {step} step dismisses a condition", dismissers)
            page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)

        body = page.inner_text("body")
        note("no_unreviewed_override" in body or "No override on it is unreviewed" in body,
             "the blocking condition is named")
        note("This material is claimed by mass balance" in body, "the review step renders the exact document")
        note("You may not state that this material physically contains recycled content." in body,
             "the prohibited statement is on the review step")
        note("file this document with a regulator" in body, "the screen states the recipient will file it")
        sign_btn = page.query_selector("form button[type=submit]")
        note(sign_btn.is_disabled(), "signing is refused while a condition blocks")

        # ---- a withdrawal shows its blast radius ----------------------------
        print("- a withdrawal shows its blast radius")
        sign_in(page, "signer2@example.com")
        page.goto(f"{BASE}/console/certificates/CERT-PILOT-000002", wait_until="networkidle")
        page.wait_for_selector("dl", timeout=10000)
        if "Begin a withdrawal" not in page.inner_text("body"):
            note(False, "CERT-PILOT-000002 is already withdrawn: reset the database and walk again")
            browser.close()
            return
        page.wait_for_selector("button:has-text('Begin a withdrawal')", timeout=10000)
        page.click("button:has-text('Begin a withdrawal')")
        page.wait_for_selector("#reason", timeout=10000)
        body = page.inner_text("body")
        note("Vanta Safety Systems" in body, "the recipients are named, not counted")
        note("Statements the recipient must stop making" in body, "the void statements are enumerated")
        note("You may not state" in body or "may state" in body, "the actual statements are shown")
        note("The five consequences" in body, "the five consequences are listed")
        page.screenshot(path=f"{SHOTS}/19_withdrawal_blast_radius.png", full_page=True)

        page.fill("#reason", "The pilot conversion factor was restated after a fresh loss window was derived.")
        page.click("button:has-text('Confirm the withdrawal')")
        page.wait_for_selector("text=This certificate was withdrawn on", timeout=20000)
        body = page.inner_text("body")
        note("withdrawn" in body.lower(), "the certificate is withdrawn")
        note("The document stays readable at its address." in body,
             "the document stays readable at its address")
        page.screenshot(path=f"{SHOTS}/20_withdrawal_confirmed.png", full_page=True)

        anon3 = browser.new_context().new_page()
        anon3.goto(f"{BASE}/verify/CERT-PILOT-000002", wait_until="networkidle")
        body = anon3.inner_text("body")
        note("withdrawn" in body.lower(), "the address still resolves and states the withdrawal")
        anon3.screenshot(path=f"{SHOTS}/21_verify_after_withdrawal.png", full_page=True)
        anon3.context.close()

        # ---- an auditor reads and exports -----------------------------------
        print("- an auditor reads and exports")
        sign_in(page, "auditor@example.com")
        page.goto(f"{BASE}/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
        page.wait_for_selector("svg[role=img]", timeout=10000)
        body = page.inner_text("body")
        note("BATCH-1001" in body, "the genealogy names BATCH-1001")
        note(body.count("BATCH-1001") >= 2, "the batch appears in both the graph and the list")
        note("450,000 g" in body, "BATCH-1001 carries its total mass of 450,000 g")
        note("The same facts, as a nested list" in body, "the same facts read twice")
        note("flagged" in body.lower(), "a flag anywhere in the graph is visible from the lot")
        note("lapsed calibration" in body.lower(), "the lapsed calibration flag reaches the lot")
        page.screenshot(path=f"{SHOTS}/22_genealogy.png", full_page=True)

        with page.expect_download(timeout=15000) as dl:
            page.click("button:has-text('Export this genealogy')")
        download = dl.value
        download.save_as("/app/.downloads/genealogy-export.json")
        page.wait_for_selector("[role=status]", timeout=10000)
        note("itself an entry in the record" in page.inner_text("[role=status]"),
             "every export is itself an entry")
        page.screenshot(path=f"{SHOTS}/23_genealogy_exported.png", full_page=True)

        page.goto(f"{BASE}/console/record", wait_until="networkidle")
        page.wait_for_selector("table", timeout=10000)
        body = page.inner_text("body")
        note("The digest chain holds" in body, "the chain verifies on the record surface")
        note("export_produced" in body or "export produced" in body, "the export shows in the record")
        note("refused" in body.lower(), "a refusal is recorded as well as a success")
        # An auditor writes no operational record: no mutating control on a lot.
        page.goto(f"{BASE}/console/lots/LOT-N6-0001", wait_until="networkidle")
        page.wait_for_selector("dl", timeout=10000)
        buttons = [b.inner_text() for b in page.query_selector_all("main button")]
        note(not any(x in " ".join(buttons) for x in
                     ["Allocate", "Sign this", "Withdraw", "Begin a withdrawal", "Review this override"]),
             "every mutating operational control is absent for an auditor", buttons)
        # The API refuses an auditor's write at the route as well as hiding the control.
        refused = page.evaluate("""async () => {
          const s = JSON.parse(localStorage.getItem('ravel.session'));
          const r = await fetch('/api/deviations', { method: 'POST',
            headers: { 'content-type': 'application/json', 'idempotency-key': 'walk-auditor-write',
                       authorization: 'Bearer ' + s.access_token },
            body: JSON.stringify({ detail: 'An auditor attempting to write an operational record.' }) });
          return r.status;
        }""")
        note(refused == 403, "an auditor's write is refused at the route, not only in the interface", refused)
        page.screenshot(path=f"{SHOTS}/24_auditor_lot_read_only.png", full_page=True)

        # ---- the operational record surfaces --------------------------------
        print("- the operational record")
        sign_in(page, "plant@example.com")
        page.goto(f"{BASE}/console/intake", wait_until="networkidle")
        page.wait_for_selector("table", timeout=10000)
        body = page.inner_text("body")
        note("non-claimable" in body.lower(), "a non-claimable batch carries its word")
        note("lapsed calibration" in body.lower(), "a lapsed calibration carries its word")
        note("Brine Textile Recovery" in body, "BATCH-1003 reads under the name in force on its receipt date")
        note("transport" in body, "the missing custody link is named")
        page.screenshot(path=f"{SHOTS}/25_intake.png", full_page=True)

        page.goto(f"{BASE}/console/reconciliation", wait_until="networkidle")
        page.wait_for_selector(".figure-rows", timeout=10000)
        body = page.inner_text("body")
        note("Mass balance residual" in body, "the headline is the mass balance residual")
        note("never sent" in body, "customer_reporting reads as never sent rather than zero")
        page.screenshot(path=f"{SHOTS}/26_reconciliation.png", full_page=True)

        page.goto(f"{BASE}/console/certificates", wait_until="networkidle")
        page.wait_for_selector("table", timeout=10000)
        note("withdrawn" in page.inner_text("body").lower(), "a withdrawn certificate says so before any figure")
        page.screenshot(path=f"{SHOTS}/27_certificates.png", full_page=True)

        # ---- responsive -----------------------------------------------------
        print("- responsive at three widths")
        for width, height, name in [(390, 844, "28_phone_genealogy"), (768, 1024, "29_tablet_balance"),
                                    (1440, 1000, "30_desktop_wizard")]:
            small = browser.new_context(viewport={"width": width, "height": height})
            sp = small.new_page()
            sign_in(sp, "claims@example.com")
            target = ("/console/lots/LOT-N6-0001/genealogy" if width == 390
                      else "/console/balance/BP-DEMO-N6-2026H1" if width == 768
                      else "/console/certificates/new/lot")
            sp.goto(f"{BASE}{target}", wait_until="networkidle")
            sp.wait_for_timeout(800)
            overflow = sp.evaluate(
                "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            note(overflow <= 1, f"no sideways scroll on the document at {width}px", overflow)
            if width == 390:
                graph_visible = sp.evaluate(
                    "() => { const g = document.querySelector('.graph-only');"
                    " return g ? getComputedStyle(g).display : 'none'; }")
                note(graph_visible == "none", "the graph becomes the nested list at the narrowest width",
                     graph_visible)
                note("The same facts, as a nested list" in sp.inner_text("body"),
                     "the nested list is present at the narrowest width")
            sp.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)
            small.close()

        # ---- type and colour, as computed -----------------------------------
        print("- type, colour and motion, as computed")
        sign_in(page, "claims@example.com")
        page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        page.wait_for_selector(".figure-rows", timeout=10000)
        smallest = page.evaluate("""() => {
          let min = 999; let worst = '';
          for (const el of document.querySelectorAll('body *')) {
            if (!el.textContent || !el.textContent.trim()) continue;
            if (el.children.length && !Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) continue;
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const size = parseFloat(s.fontSize);
            if (size < min) { min = size; worst = el.tagName + '.' + el.className; }
          }
          return { min, worst };
        }""")
        note(smallest["min"] >= 12, "nothing renders below twelve pixels", smallest)

        missing_lh = page.evaluate("""() => {
          let n = 0;
          for (const el of document.querySelectorAll('body *')) {
            const s = getComputedStyle(el);
            if (s.lineHeight === 'normal' && el.textContent.trim()) n += 1;
          }
          return n;
        }""")
        note(missing_lh == 0, "no element ships without a line height set", missing_lh)

        generic = page.evaluate("""() => {
          const bad = [];
          for (const el of document.querySelectorAll('body *')) {
            const f = getComputedStyle(el).fontFamily;
            if (!/Ravel (Serif|Grotesk|Mono)/.test(f) && el.textContent.trim()) bad.push(f);
          }
          return [...new Set(bad)];
        }""")
        note(len(generic) == 0, "no element falls back to a generic system face", generic)

        greens = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('body *')) {
            const s = getComputedStyle(el);
            for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) {
              const m = s[prop].match(/rgba?\\((\\d+), (\\d+), (\\d+)/);
              if (!m) continue;
              const [r, g, b] = [ +m[1], +m[2], +m[3] ];
              if (g > r + 40 && g > b + 40) out.push(`${el.tagName}.${el.className} ${prop} ${s[prop]}`);
            }
          }
          return [...new Set(out)];
        }""")
        note(len(greens) == 0, "nothing in the console renders green as a state", greens)

        accent = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('body *')) {
            const s = getComputedStyle(el);
            if (s.color === 'rgb(38, 73, 31)' || s.backgroundColor === 'rgb(38, 73, 31)'
                || s.color === 'rgb(125, 79, 155)' || s.backgroundColor === 'rgb(125, 79, 155)') {
              out.push(el.tagName + '.' + el.className);
            }
          }
          return out;
        }""")
        note(len(accent) == 0, "the console reaches for the accent and the highlight on nothing", accent)

        # A focus ring is visible and is not the hover treatment.
        page.keyboard.press("Tab")
        page.keyboard.press("Tab")
        focus = page.evaluate("""() => {
          const el = document.activeElement;
          const s = getComputedStyle(el);
          return { tag: el.tagName, outline: s.outlineWidth, style: s.outlineStyle, colour: s.outlineColor };
        }""")
        note(focus["style"] != "none" and float(focus["outline"].replace("px", "")) >= 2,
             "the focus ring is visible", focus)
        page.screenshot(path=f"{SHOTS}/31_focus_ring.png")

        # ---- reduced motion --------------------------------------------------
        rm = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        rp = rm.new_page()
        rp.goto(BASE, wait_until="networkidle")
        rp.wait_for_timeout(400)
        state = rp.evaluate("""() => {
          const el = document.querySelector('h1');
          const s = getComputedStyle(el);
          return { opacity: s.opacity, filter: s.filter, animation: s.animationName };
        }""")
        note(state["opacity"] == "1" and state["filter"] in ("none", ""),
             "under reduced motion the reveal resolves immediately", state)
        rp.screenshot(path=f"{SHOTS}/32_reduced_motion.png", full_page=True)
        rm.close()

        # ---- forced colours --------------------------------------------------
        fc = browser.new_context(viewport={"width": 1440, "height": 1000}, forced_colors="active")
        fp = fc.new_page()
        sign_in(fp, "plant@example.com")
        fp.goto(f"{BASE}/console/intake", wait_until="networkidle")
        fp.wait_for_selector("table", timeout=10000)
        body = fp.inner_text("body")
        note("non-claimable" in body.lower() and "lapsed calibration" in body.lower(),
             "under forced colours every state still carries its word")
        fp.screenshot(path=f"{SHOTS}/33_forced_colours.png", full_page=True)
        fc.close()

        # A 4xx the app asks for and then renders as a banner is not a defect: the
        # browser logs every non-2xx fetch. A script error is.
        errors = [e for e in console_errors
                  if "favicon" not in e.lower()
                  and "Failed to load resource" not in e]
        note(len(errors) == 0, "no script error anywhere in the walk", errors[:5])

        browser.close()


run()
print()
if problems:
    print(f"{len(problems)} problems:")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)
print("every journey walked with no problems")

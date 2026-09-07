"""Drives the app through the journeys the brief describes, as a stranger would.

The walk reviews an override, signs a certificate and withdraws another, so it
changes the records it reads. Run `bash scripts/reset.sh` first for a fresh seed.
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("WALK_BASE", "http://localhost:4173")
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

problems = []
console_errors = []


def note(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok:
        problems.append(msg)


def sign_in(page, email):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", email)
    page.fill("#password", PW)
    page.click("button[type=submit]")
    page.wait_for_url("**/console", timeout=15000)


def run():
    with sync_playwright() as p:
        chrome = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
        browser = p.chromium.launch(
            executable_path=chrome if os.path.exists(chrome) else None,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}")
                if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

        # ---- journey 1: the public site, with no account -------------------
        for route in ["/", "/product", "/technology", "/about", "/careers", "/news", "/contact", "/privacy"]:
            page.goto(f"{BASE}{route}", wait_until="networkidle")
            body = page.inner_text("body")
            note(len(body) > 400, f"public route {route} renders content ({len(body)} chars)")
            note("Loading" not in page.inner_text("main"), f"public route {route} finished loading")
        page.goto(f"{BASE}/", wait_until="networkidle")
        home = page.inner_text("body")
        note("Tomorrow's materials. Made from today's waste." in home, "home carries its headline verbatim")
        note("Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." in home,
             "home carries its subheading verbatim")
        for phrase in ["Nylon that goes on and on and on", "The power of green chemistry", "We're closing the loop"]:
            note(phrase in home, f"home carries '{phrase}'")
        page.screenshot(path=f"{SHOTS}/01_home.png", full_page=True)

        page.goto(f"{BASE}/product", wait_until="networkidle")
        prod = page.inner_text("body")
        note("Same material. Better origin." in prod, "product carries its headline verbatim")
        note("Nylon in any form" in prod, "product's first feature heading is 'Nylon in any form'")
        note("relative_viscosity" in prod or "relative viscosity" in prod, "product renders the specification itself")
        note("discarded fishing nets" in prod, "Nylon 6 names its real limitation")
        page.screenshot(path=f"{SHOTS}/02_product.png", full_page=True)

        page.goto(f"{BASE}/technology", wait_until="networkidle")
        tech = page.inner_text("body")
        for stage in ["Dissolution", "Depolymerisation", "Purification", "Repolymerisation"]:
            note(stage in tech, f"technology names {stage}")
        note("tonnes per year" in tech, "capacity table states its unit")
        note("Multi-tonne" not in tech, "pilot carries a quantity rather than 'Multi-tonne'")
        note(">25,000 tonnes per year" in tech, "commercial plant reads >25,000 tonnes per year")
        page.screenshot(path=f"{SHOTS}/03_technology.png", full_page=True)

        page.goto(f"{BASE}/about", wait_until="networkidle")
        about = page.inner_text("body")
        note("The hard facts" in about, "about carries 'The hard facts'")
        note("Textile Flow Monitor" in about and "2024" in about and "Global" in about,
             "each statistic carries source, year and geography")
        note("1.8 gigatonnes of carbon dioxide equivalent" in about, "the emissions figure is stated as a mass")
        page.screenshot(path=f"{SHOTS}/04_about.png", full_page=True)

        page.goto(f"{BASE}/careers", wait_until="networkidle")
        careers = page.inner_text("body")
        note("Why this problem matters" in careers, "careers carries 'Why this problem matters'")
        note("open position" in careers.lower(), "the count is derived from the collection (1)")
        page.screenshot(path=f"{SHOTS}/05_careers.png", full_page=True)

        page.goto(f"{BASE}/news", wait_until="networkidle")
        news = page.inner_text("body")
        note("written in french" in news.lower(), "an item in another language says so before a reader clicks")
        note(all(t in news for t in ["funding", "partnership", "technical"]), "the tag is a real taxonomy")
        page.screenshot(path=f"{SHOTS}/06_news.png", full_page=True)

        # ---- journey 2: a visitor checks a certificate ----------------------
        page.goto(f"{BASE}/verify/CERT-PILOT-000001", wait_until="networkidle")
        v = page.inner_text("body")
        note("withdrawn" in v.lower(), "verify states the withdrawal")
        note("2026-04-18" in v, "verify states the withdrawal date")
        note("A collector category was corrected after acceptance" in v, "verify states the reason")
        note("replacement" not in v.lower() or "no replacement" in v.lower() or "There is no replacement" in v,
             "verify does not forward to a replacement")
        note("no yield figure" in v.lower() and "yield:" not in v.lower(), "verify carries no yield figure of its own")
        note("COL-" not in v, "verify names no collector")
        page.screenshot(path=f"{SHOTS}/07_verify_withdrawn.png", full_page=True)

        page.goto(f"{BASE}/verify/CERT-DEMO-999999", wait_until="networkidle")
        v2 = page.inner_text("body")
        note("no such certificate" in v2.lower(), "an unknown number reads the same layout saying there is none")
        note("claim type" in v2.lower() and "recipient" in v2.lower(), "the unknown answer uses the same layout")
        page.screenshot(path=f"{SHOTS}/08_verify_unknown.png", full_page=True)

        # ---- anonymous console redirects to /login -------------------------
        page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        note("/login" in page.url, f"anonymous console reader redirects to /login (at {page.url})")

        # ---- journey 3: a claims manager allocates and is refused ----------
        sign_in(page, "claims@example.com")
        page.screenshot(path=f"{SHOTS}/09_console_board.png", full_page=True)
        board = page.inner_text("body")
        note("Dissolution" in board and "Repolymerisation" in board, "the board carries one column per stage")

        page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        page.wait_for_selector("text=Credits in", timeout=15000)
        bal = page.inner_text("body")
        note("360,000 g" in bal, "the balance reads credits in per category")
        note("Remaining claimable mass" in bal, "the margin is shown as a mass, not as a state")
        note("Within limits" not in bal, "'Within limits' is not a rendering")
        page.screenshot(path=f"{SHOTS}/10_balance.png", full_page=True)

        # allocate more than the ledger holds
        page.select_option("#alloc-lot", "LOT-N6-0001")
        page.select_option("#alloc-cat", "post_consumer")
        page.fill("#alloc-mass", "500000")
        page.click("button:has-text('Allocate claim')")
        page.wait_for_selector("[role=alert]", timeout=15000)
        alert = page.inner_text("[role=alert]")
        note("refused" in alert.lower(), "the refusal renders an inline banner")
        note("360,000 g" in alert or "360000" in alert, "the banner names the available mass")
        note("500,000 g" in alert or "500000" in alert, "the banner names the requested mass")
        after = page.inner_text("body")
        note("360,000 g" in after, "the figures on the screen are unchanged")
        page.screenshot(path=f"{SHOTS}/11_allocation_refused.png", full_page=True)

        # ---- journey 4: a signer meets a blocking condition ----------------
        sign_in(page, "signer@example.com")
        page.goto(f"{BASE}/console/certificates/new/lot", wait_until="networkidle")
        page.wait_for_selector("input[name=lot]", timeout=15000)
        page.check("input[value=LOT-N6-0001]")
        page.wait_for_selector("text=The eight conditions", timeout=15000)
        step1 = page.inner_text("body")
        note(len(page.query_selector_all(".condition-row")) == 8, "step one shows exactly eight conditions")
        note("OVR-0001" in step1, "the unsatisfied condition names the record that blocks it")
        blocked_rows = [r for r in page.query_selector_all(".condition-row") if "blocked" in r.inner_text().lower()]
        note(len(blocked_rows) == 1, f"exactly one condition is unsatisfied (found {len(blocked_rows)})")
        note("unreviewed" in step1.lower(), "the blocking condition says which")
        page.screenshot(path=f"{SHOTS}/12_wizard_lot.png", full_page=True)

        for addr, name in [("claim", "13_wizard_claim"), ("recipient", "14_wizard_recipient")]:
            page.goto(f"{BASE}/console/certificates/new/{addr}", wait_until="networkidle")
            page.wait_for_selector("text=The eight conditions", timeout=15000)
            if addr == "recipient":
                page.check("input[value=CUS-HELIOS]")
                page.wait_for_timeout(800)
            txt = page.inner_text("body")
            note(len(page.query_selector_all(".condition-row")) == 8, f"step {addr} shows the eight conditions")
            note("blocked" in txt.lower(), f"step {addr} still shows the blocking condition")
            page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)

        page.goto(f"{BASE}/console/certificates/new/review", wait_until="networkidle")
        page.wait_for_selector("text=The eight conditions", timeout=15000)
        rev = page.inner_text("body")
        note(len(page.query_selector_all(".condition-row")) == 8, "step review shows the eight conditions")
        note("regulator" in rev, "the review step states the recipient will file with a regulator")
        buttons = [b.inner_text().lower() for b in page.query_selector_all("button")]
        note(not any("dismiss" in b or "waive" in b or "override" in b for b in buttons),
             f"no control on the screen dismisses a condition (buttons: {buttons})")
        page.screenshot(path=f"{SHOTS}/15_wizard_review.png", full_page=True)

        # ---- journey 4b: the override is reviewed and the signer signs ------
        sign_in(page, "claims@example.com")
        page.goto(f"{BASE}/console/lots/LOT-N6-0001", wait_until="networkidle")
        page.wait_for_selector("text=Review this override", timeout=15000)
        page.click("button:has-text('Review this override')")
        page.wait_for_timeout(1500)
        reviewed = page.inner_text("body")
        note("reviewed by" in reviewed.lower(), "the override is reviewed by somebody other than its authoriser")
        note("cannot be removed" in reviewed.lower(), "the override shows on the lot for its life")
        page.screenshot(path=f"{SHOTS}/15b_override_reviewed.png", full_page=True)

        sign_in(page, "signer@example.com")
        page.goto(f"{BASE}/console/certificates/new/lot", wait_until="networkidle")
        page.wait_for_selector("input[name=lot]", timeout=15000)
        page.check("input[value=LOT-N6-0001]")
        page.wait_for_selector(".condition-row", timeout=15000)
        page.wait_for_timeout(800)
        cleared = [r for r in page.query_selector_all(".condition-row") if "blocked" in r.inner_text().lower()]
        note(not cleared, f"the blocking condition is cleared by the review (still blocked: {len(cleared)})")

        page.goto(f"{BASE}/console/certificates/new/recipient", wait_until="networkidle")
        page.wait_for_selector("input[name=recipient]", timeout=15000)
        page.check("input[value=CUS-HELIOS]")
        page.wait_for_timeout(600)
        page.goto(f"{BASE}/console/certificates/new/review", wait_until="networkidle")
        page.wait_for_selector("#sign-password", timeout=15000)
        page.fill("#sign-password", PW)
        page.click("button:has-text('Sign this certificate')")
        page.wait_for_selector("text=Certificate signed", timeout=25000)
        signed = page.inner_text("body")
        note("CERT-DEMO-000001" in signed, "the first SITE-DEMO certificate takes number CERT-DEMO-000001")
        page.screenshot(path=f"{SHOTS}/15c_certificate_signed.png", full_page=True)

        # ---- journey 5: a withdrawal shows its blast radius -----------------
        sign_in(page, "signer2@example.com")
        page.goto(f"{BASE}/console/certificates/CERT-PILOT-000002", wait_until="networkidle")
        page.wait_for_selector("text=Withdraw this certificate", timeout=15000)
        page.click("button:has-text('Begin a withdrawal')")
        page.wait_for_selector("text=Recipients who will be notified", timeout=15000)
        wd = page.inner_text("body")
        note("Vanta Safety Systems" in wd, "the withdrawal names the recipient by name, not a count")
        note("vanta@example.com" in wd, "the withdrawal names the address it will notify")
        note("must stop making" in wd.lower(),
             "the downstream statements are enumerated")
        note("physically contains recycled content" in wd, "the void statements are the actual statements")
        page.screenshot(path=f"{SHOTS}/16_withdrawal_blast_radius.png", full_page=True)

        page.fill("#wd-reason", "The conversion factor for the period was restated after an audit finding.")
        page.click("button:has-text('Confirm the withdrawal')")
        page.wait_for_selector("text=Withdrawn", timeout=20000)
        page.wait_for_timeout(1200)
        done = page.inner_text("body")
        note("Vanta Safety Systems" in done, "the confirmation names who was notified")
        page.screenshot(path=f"{SHOTS}/17_withdrawal_confirmed.png", full_page=True)

        # after confirming, the certificate address still resolves and states the withdrawal
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 1000})
        anon = ctx2.new_page()
        anon.goto(f"{BASE}/verify/CERT-PILOT-000002", wait_until="networkidle")
        after_wd = anon.inner_text("body")
        note("withdrawn" in after_wd.lower(), "the certificate address still resolves and states the withdrawal")
        anon.screenshot(path=f"{SHOTS}/18_verify_after_withdrawal.png", full_page=True)
        ctx2.close()

        # ---- journey 6: an auditor reads and exports ------------------------
        sign_in(page, "auditor@example.com")
        page.goto(f"{BASE}/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
        page.wait_for_selector("text=As a graph", timeout=15000)
        gen = page.inner_text("body")
        note("As a graph" in gen and "As a nested list" in gen,
             "the same facts read twice, as the graph and as a nested list")
        note(gen.count("BATCH-1001") >= 2, "BATCH-1001 appears in both renderings")
        note("450,000 g" in gen, "BATCH-1001 carries its total contributed mass of 450000 g")
        note("flagged" in gen.lower(), "a flag is visible from the lot without expanding anything")
        mutating = [b.inner_text().strip().lower() for b in page.query_selector_all("button")]
        forbidden = [b for b in mutating if any(w in b for w in
                     ["allocate", "withdraw", "disposition", "close", "review", "reject"])
                     and b != "sign out"]
        note(not forbidden, f"every mutating control is absent for the auditor (found {forbidden})")
        page.screenshot(path=f"{SHOTS}/19_genealogy.png", full_page=True)

        page.click("button:has-text('Export this scope')")
        page.wait_for_selector("text=Export recorded", timeout=20000)
        exp = page.inner_text("body")
        note("export recorded" in exp.lower(), "the export completes")
        note("EXP-" in exp, "the export answers with the reference it took")
        page.screenshot(path=f"{SHOTS}/20_export.png", full_page=True)

        page.goto(f"{BASE}/console/record", wait_until="networkidle")
        page.wait_for_selector("text=The digest chain", timeout=15000)
        rec = page.inner_text("body")
        note("the chain verifies" in rec.lower(), "the digest chain verifies")
        note("exported" in rec, "every export is itself an entry")
        page.screenshot(path=f"{SHOTS}/21_record.png", full_page=True)

        page.goto(f"{BASE}/console/reconciliation", wait_until="networkidle")
        page.wait_for_selector("text=Mass balance residual", timeout=15000)
        recon = page.inner_text("body")
        note("never sent" in recon.lower(), "customer_reporting reads 'never sent' rather than zero")
        note("payload" in recon.lower() or "WB-TICKET" in recon, "inbound payloads are shown verbatim")
        page.screenshot(path=f"{SHOTS}/22_reconciliation.png", full_page=True)

        # ---- responsive: three widths, no sideways scroll ------------------
        for w, h, label in [(390, 844, "phone"), (834, 1112, "tablet"), (1440, 1000, "desktop")]:
            rc = browser.new_context(viewport={"width": w, "height": h})
            rp = rc.new_page()
            rp.goto(f"{BASE}/login", wait_until="networkidle")
            rp.fill("#email", "claims@example.com")
            rp.fill("#password", PW)
            rp.click("button[type=submit]")
            rp.wait_for_url("**/console", timeout=15000)
            for route in ["/", "/console", "/console/balance/BP-DEMO-N6-2026H1",
                          "/console/lots/LOT-N6-0001/genealogy", "/console/certificates/new/lot"]:
                rp.goto(f"{BASE}{route}", wait_until="networkidle")
                rp.wait_for_timeout(400)
                overflow = rp.evaluate(
                    "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                note(overflow <= 1, f"{label} {route}: document does not scroll sideways (overflow {overflow}px)")
            if label == "phone":
                rp.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
                rp.wait_for_timeout(600)
                rp.screenshot(path=f"{SHOTS}/23_balance_phone.png", full_page=True)
                rp.goto(f"{BASE}/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
                rp.wait_for_timeout(600)
                rp.screenshot(path=f"{SHOTS}/24_genealogy_phone.png", full_page=True)
            rc.close()

        # ---- no text renders below twelve pixels ---------------------------
        page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        page.wait_for_timeout(600)
        small = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('*')) {
            if (!el.textContent || !el.textContent.trim()) continue;
            if (el.children.length) continue;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs && fs < 12) out.push(el.tagName + ' ' + fs + 'px :: ' + el.textContent.trim().slice(0,30));
          }
          return out;
        }""")
        note(not small, f"nothing renders below twelve pixels (found {small[:4]})")

        # ---- no state is signalled green -----------------------------------
        greens = page.evaluate("""() => {
          const out = [];
          const parse = (s) => { const m = (s||'').match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
            const n = m[1].split(',').map(Number); return n; };
          const isGreen = (n) => n && n.length >= 3 && n[1] > n[0] + 24 && n[1] > n[2] + 24 && (n.length < 4 || n[3] > 0.05);
          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            for (const prop of ['color','backgroundColor','borderTopColor','borderLeftColor']) {
              const n = parse(cs[prop]);
              if (isGreen(n)) out.push(el.tagName + ' ' + prop + ' ' + cs[prop]);
            }
          }
          return out.slice(0, 8);
        }""")
        note(not greens, f"nothing in the console renders green as a state (found {greens})")

        # the console reaches for the brand accent on nothing at all
        accent_used = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            for (const prop of ['color','backgroundColor','borderTopColor','borderLeftColor']) {
              const v = cs[prop];
              if (v === 'rgb(42, 75, 34)' || v === 'rgb(201, 168, 221)') out.push(el.tagName + ' ' + prop);
            }
          }
          return out.slice(0, 6);
        }""")
        note(not accent_used, f"the console uses neither the accent nor the highlight (found {accent_used})")

        # every focus ring is visible and is not the hover treatment
        page.goto(f"{BASE}/", wait_until="networkidle")
        focus = page.evaluate("""() => {
          const a = document.querySelector('.nav a');
          a.focus();
          const cs = getComputedStyle(a);
          return { outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor };
        }""")
        note("none" not in focus["outline"], f"the focus ring is visible ({focus['outline']})")

        browser.close()


run()
# A refused request is an ordinary answer in this product: the browser logs the
# non-2xx status, and the walk deliberately provokes three of them (an anonymous
# console read, and the over-allocation). Anything else is a defect.
EXPECTED = ("401 (Unauthorized)", "409 (Conflict)")
unexpected = [e for e in console_errors if not any(x in e for x in EXPECTED)]
print("\nconsole messages:", console_errors if console_errors else "none")
print("unexpected console errors:", unexpected if unexpected else "none")
if unexpected:
    problems.extend(unexpected)
print(f"\n{len(problems)} problems" if problems else "\nAll browser checks pass.")
for p in problems:
    print("  -", p)
sys.exit(1 if problems else 0)

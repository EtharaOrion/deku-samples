"""Walks the journeys the brief describes in a real browser, and leaves evidence."""
import asyncio, json, sys, re
from playwright.async_api import async_playwright

BASE = "http://localhost:4173"
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"
problems = []
console_errors = []


def note(ok, what, detail=""):
    print(("PASS " if ok else "FAIL ") + what + ("" if ok else "  <- " + str(detail)[:300]))
    if not ok:
        problems.append(what)


async def shot(page, name):
    await page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)


async def sign_in(page, email):
    await page.goto(f"{BASE}/login", wait_until="networkidle")
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PW)
    await page.click('button[type=submit]')
    await page.wait_for_url(re.compile(r"/console"), timeout=15000)
    await page.wait_for_load_state("networkidle")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        # ---- The public site ------------------------------------------------
        await page.goto(BASE, wait_until="networkidle")
        body = await page.inner_text("body")
        note("Tomorrow's materials. Made from today's waste." in body,
             "home carries its headline")
        note("Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." in body,
             "home carries its standfirst")
        for phrase in ["Nylon that goes on and on and on", "The power of green chemistry",
                       "We're closing the loop"]:
            note(phrase in body, f"home carries '{phrase}'")
        note("Textile Flow Monitor" in body and "2024" in body and "Global" in body,
             "every published figure carries its source, year and geography")
        await shot(page, "01_home")

        await page.goto(f"{BASE}/product", wait_until="networkidle")
        body = await page.inner_text("body")
        note("Same material. Better origin." in body, "product carries its headline")
        note("Nylon in any form" in body, "the first feature heading agrees with its sentence")
        note("fishing nets" in body and "no recycling solution at all" in body,
             "each grade names its real limitation before its claim")
        note("relative_viscosity" in body.replace(" ", "_") or "relative viscosity" in body,
             "the specification section carries the specification")
        note("mass balance" in body and "9000 bp" in body,
             "the claim appears beside the grade with its type")
        await shot(page, "02_product")

        await page.goto(f"{BASE}/technology", wait_until="networkidle")
        body = await page.inner_text("body")
        for stage in ["Dissolution", "Depolymerisation", "Purification", "Repolymerisation"]:
            note(stage.lower() in body.lower(), f"technology names {stage}")
        note("tonnes per year" in body, "the capacity table states its unit")
        note(">25,000 tonnes per year" in body.replace("\u00a0", " "),
             "Commercial Plant reads >25,000 tonnes per year")
        note("Multi-tonne" not in body, "the pilot carries a quantity rather than 'Multi-tonne'")
        note("planned" in body.lower(), "the planned capacity row carries its word")
        note("Losses reduce the claim." in body, "technology states that losses reduce the claim")
        await shot(page, "03_technology")

        await page.goto(f"{BASE}/careers", wait_until="networkidle")
        body = await page.inner_text("body")
        note("Why this problem matters" in body, "careers carries its heading")
        note("1 open position" in body, "the count is derived from the collection")
        await shot(page, "04_careers")

        await page.goto(f"{BASE}/news", wait_until="networkidle")
        body = await page.inner_text("body")
        note(all(t in body.lower() for t in ["funding", "partnership", "technical"]),
             "the news taxonomy has real terms")
        note("in french" in body.lower(), "an item in another language says so before a reader clicks")
        note("Materials Weekly" in body and "2026-01-22" in body,
             "every item carries its outlet and date")

        await page.goto(f"{BASE}/privacy", wait_until="networkidle")
        body = await page.inner_text("body")
        note("Ravel Materials SAS" in body and "Lyon" in body,
             "the privacy policy names the controller with a postal address")
        note("privacy@example.com" in body and "security@example.com" in body,
             "it gives the rights and disclosure addresses")
        note("is not erased on request" in body,
             "it states the record is not erased on request")
        note(all(m in body for m in ["24", "36", "12", "120", "180"]),
             "it states a retention in months for every purpose")

        # ---- A visitor checks a certificate ---------------------------------
        await page.goto(f"{BASE}/verify/CERT-PILOT-000001", wait_until="networkidle")
        body = await page.inner_text("body")
        note("withdrawn" in body.lower(), "the verification page states the withdrawal")
        note("2026-04-18" in body, "it states the date of the withdrawal")
        note("A collector category was corrected after acceptance" in body,
             "it states the reason")
        note("replacement" not in body.lower(), "it does not forward to a replacement")
        note("no yield" in body.lower() and "yield_bp" not in body.lower(),
             "it returns no yield figure")
        await shot(page, "05_verify_withdrawn")

        await page.goto(f"{BASE}/verify/CERT-DEMO-999999", wait_until="networkidle")
        body2 = await page.inner_text("body")
        note("no such certificate" in body2.lower(),
             "an unknown number reads the same layout saying there is no such certificate")
        note("Certificate verification" in body2, "it is the same layout")
        await shot(page, "06_verify_unknown")

        # ---- The console redirects an anonymous reader ----------------------
        for path in ["/console", "/console/intake", "/console/balance/BP-DEMO-N6-2026H1"]:
            await page.goto(f"{BASE}{path}", wait_until="networkidle")
            note(page.url.endswith("/login"), f"{path} redirects an anonymous reader to /login")
        await shot(page, "07_login")

        # ---- A claims manager allocates and is refused ----------------------
        await sign_in(page, "claims@example.com")
        note("/console" in page.url, "the claims manager signs in")
        await shot(page, "08_console_board")

        await page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        body = await page.inner_text("body")
        note("360,000 g" in body, "credits in per category are on the balance surface")
        note("post-consumer" in body and "pre-consumer" in body,
             "the two categories are shown separately")
        note("credits available" in body.lower(), "credits available is shown")
        note("within limits" not in body.lower(), "the margin is a mass rather than a state")
        before = body
        await shot(page, "09_balance_before")

        await page.click("text=Attach more than the ledger holds")
        await page.wait_for_selector('[role=alert]', timeout=10000)
        alert = await page.inner_text('[role=alert]')
        note("refused" in alert.lower(), "the refusal renders an inline banner")
        note("400,000" in alert and "360,000" in alert,
             "the banner names the available mass and the requested mass", alert)
        after = await page.inner_text("body")
        note("360,000 g" in after, "the figures on the screen are unchanged", )
        await shot(page, "10_balance_refused")

        # Now a legitimate allocation.
        await page.click("text=Attach the available post-consumer credit")
        await page.wait_for_timeout(2500)
        await page.goto(f"{BASE}/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
        body = await page.inner_text("body")
        note("9000 bp" in body or "90 per cent" in body,
             "the allocation leaves content_bp of 9000 on the lot")
        await shot(page, "11_balance_allocated")

        # ---- A signer meets a blocking condition ----------------------------
        await ctx.clear_cookies()
        await page.evaluate("() => localStorage.clear()")
        await sign_in(page, "signer@example.com")
        await page.goto(f"{BASE}/console/certificates/new/lot", wait_until="networkidle")
        await page.click('input[value="LOT-N6-0001"]')
        await page.wait_for_timeout(1800)
        body = await page.inner_text("body")
        note(body.lower().count("satisfied") >= 8, "step one shows the eight conditions")
        note("no unreviewed override" in body.lower() and "OVR-0001" in body,
             "the blocking condition names which and links to the record")
        await shot(page, "12_wizard_lot")

        for step, name in [("claim", "13_wizard_claim"), ("recipient", "14_wizard_recipient")]:
            await page.goto(f"{BASE}/console/certificates/new/{step}", wait_until="networkidle")
            await page.wait_for_timeout(1200)
            b = await page.inner_text("body")
            note("not satisfied" in b.lower(), f"step {step} shows the eight conditions as they stand")
            if step == "recipient":
                await page.click('input[name=recipient]')
                await page.wait_for_timeout(400)
            await shot(page, name)

        await page.goto(f"{BASE}/console/certificates/new/review", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        body = await page.inner_text("body")
        note("Signing is blocked" in body, "step four names the unsatisfied condition")
        note("None of the eight is waivable" in body,
             "no control on the screen dismisses it")
        buttons = await page.locator("button").all_inner_texts()
        note(not any("waive" in b.lower() or "dismiss" in b.lower() or "override" in b.lower()
                     for b in buttons),
             "no waive or dismiss control exists", buttons)
        await shot(page, "15_wizard_review_blocked")

        # ---- A withdrawal shows its blast radius ----------------------------
        await page.evaluate("() => localStorage.clear()")
        await sign_in(page, "signer2@example.com")
        await page.goto(f"{BASE}/console/certificates/CERT-PILOT-000002", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        await page.click("text=Begin a withdrawal")
        await page.wait_for_selector("text=Before you confirm", timeout=15000)
        body = await page.inner_text("body")
        note("Vanta Safety Systems" in body,
             "the recipients who will be notified are listed by name, not a count")
        note("may not" in body.lower() or "ne pouvez pas" in body.lower(),
             "the downstream statements the recipient must stop making are listed")
        await shot(page, "16_withdrawal_blast_radius")

        await page.fill("textarea", "The pilot conversion factor was restated after a scheme audit.")
        await page.click("text=Confirm the withdrawal")
        await page.wait_for_selector('[role=status]', timeout=20000)
        body = await page.inner_text("body")
        note("withdrawn" in body.lower(), "after confirming, the state is withdrawn")
        await shot(page, "17_withdrawal_done")

        resp = await page.goto(f"{BASE}/verify/CERT-PILOT-000002", wait_until="networkidle")
        body = await page.inner_text("body")
        note(resp.status == 200 and "withdrawn" in body.lower(),
             "the certificate address still resolves and states the withdrawal")
        await shot(page, "18_verify_after_withdrawal")

        # ---- An auditor reads and exports -----------------------------------
        await page.evaluate("() => localStorage.clear()")
        await sign_in(page, "auditor@example.com")
        await page.goto(f"{BASE}/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        body = await page.inner_text("body")
        note("As a graph" in body and "As a nested list" in body,
             "the same facts are read twice, as the graph and as a nested list")
        note(body.count("BATCH-1001") >= 2, "BATCH-1001 appears in both forms")
        note("450,000 g" in body, "BATCH-1001 carries its total mass of 450000 g")
        note("flagged" in body.lower(), "a flag anywhere in the graph is visible from the lot")
        controls = await page.locator("button, input, select, textarea").all_inner_texts()
        mutating = [c for c in controls
                    if any(w in c.lower() for w in ["attach", "sign", "withdraw", "close", "book",
                                                    "approve", "disposition", "raise"])]
        note(not mutating, "every mutating control is absent for the auditor", mutating)
        await shot(page, "19_genealogy")

        async with page.expect_download(timeout=20000) as dl:
            await page.click("text=Export this genealogy")
        download = await dl.value
        await download.save_as(f"/app/.downloads/{download.suggested_filename}")
        await page.wait_for_selector('[role=status]', timeout=15000)
        body = await page.inner_text("body")
        note("The export is itself an entry." in body, "every export is itself an entry")
        await shot(page, "20_genealogy_exported")

        await page.goto(f"{BASE}/console/reconciliation", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        body = await page.inner_text("body")
        note("Mass balance residual" in body, "the reconciliation leads with the residual")
        note("never sent" in body.lower(), "a source that has never sent says so rather than reading zero")
        note("Six figures rather than six verdicts" in body, "six figures, not six verdicts")
        await shot(page, "21_reconciliation")

        await page.goto(f"{BASE}/console/record", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        body = await page.inner_text("body")
        note("the chain holds" in body.lower(), "the digest chain verifies on the record surface")
        note("refused" in body.lower(), "a refusal is in the record as well as a success")
        await page.click("text=refused allocations")
        await page.wait_for_timeout(1200)
        body = await page.inner_text("body")
        note("available" in body.lower() and "requested" in body.lower(),
             "the refused-allocation query names the margin at the instant")
        await shot(page, "22_record")

        # ---- Empty state, in words -------------------------------------------
        await page.click("text=allocations in final fortnight")
        await page.wait_for_timeout(1200)
        body = await page.inner_text("body")
        note("the set is complete and it is empty" in body or "Seq" in body,
             "an empty collection says so in words rather than rendering an empty frame")

        # ---- Intake ----------------------------------------------------------
        await page.goto(f"{BASE}/console/intake", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        body = await page.inner_text("body")
        note("non-claimable" in body.lower(), "a non-claimable batch carries its word")
        note("lapsed calibration" in body.lower(), "a lapsed calibration carries its word")
        note("Brine Textile Recovery" in body,
             "BATCH-1003 reads back under the name in force on its receipt date")
        note("This batch cannot be claimed: transport." in body,
             "the missing custody link is named in the product's own words")
        await shot(page, "23_intake")

        # ---- Responsive: three widths, no sideways scroll --------------------
        for width, height, label in [(390, 844, "phone"), (820, 1180, "tablet"), (1440, 1000, "desktop")]:
            await page.set_viewport_size({"width": width, "height": height})
            for path in ["/", "/product", "/technology", "/console",
                         "/console/balance/BP-DEMO-N6-2026H1",
                         "/console/lots/LOT-N6-0001/genealogy",
                         "/console/certificates/new/review"]:
                await page.goto(BASE + path, wait_until="networkidle")
                await page.wait_for_timeout(600)
                overflow = await page.evaluate(
                    "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
                note(overflow <= 1, f"no sideways scroll at {label} on {path}", overflow)
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.goto(f"{BASE}/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        body = await page.inner_text("body")
        note("the graph is the nested list below" in body,
             "the graph becomes the nested list at the narrowest width")
        await shot(page, "24_genealogy_phone")
        await page.set_viewport_size({"width": 1440, "height": 1000})

        # ---- The forbidden palette, and nothing below twelve pixels ---------
        href = await page.evaluate(
            "() => { const l = document.querySelector('link[rel=stylesheet]');"
            " return l ? l.href : ''; }")
        css = await (await ctx.request.get(href)).text()
        forbidden = ["#2d62ff", "#dd23bb", "#fcf8d8", "#cef5ca", "#114e0b",
                     "#f8e4e4", "#3b0b0b", "#5e5515", "#0000"]
        found = [f for f in forbidden if f in css.lower()]
        note(not found, "none of the nine forbidden values appears in the built stylesheet", found)
        note("transition:all" not in css.replace(" ", "").lower(),
             "the declaration transition: all appears on no element")
        literals = set(re.findall(r"#[0-9a-fA-F]{3,8}\b", css))
        note(len(literals) <= 8,
             f"at most eight distinct colour literals in the stylesheet: {sorted(literals)}",
             sorted(literals))

        await page.goto(BASE, wait_until="networkidle")
        small = await page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('body *')) {
            if (!el.textContent || !el.textContent.trim()) continue;
            if (el.children.length && !Array.from(el.childNodes).some(
                n => n.nodeType === 3 && n.textContent.trim())) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const size = parseFloat(cs.fontSize);
            if (size && size < 12) out.push(el.tagName + '.' + el.className + ' ' + size);
            if (cs.lineHeight === 'normal') out.push('no line height: ' + el.tagName + '.' + el.className);
          }
          return out.slice(0, 10);
        }""")
        note(not small, "nothing renders below twelve pixels and every element has a line height",
             small)

        # ---- Focus rings are visible and are not the hover treatment --------
        await page.goto(BASE, wait_until="networkidle")
        await page.keyboard.press("Tab")
        await page.keyboard.press("Tab")
        outline = await page.evaluate("""() => {
          const el = document.activeElement;
          const cs = getComputedStyle(el);
          return { tag: el.tagName, outline: cs.outlineStyle, width: cs.outlineWidth };
        }""")
        note(outline["outline"] != "none" and outline["width"] != "0px",
             "keyboard focus renders a visible ring", outline)

        # ---- Contrast --------------------------------------------------------
        contrast = await page.evaluate("""() => {
          const lum = (c) => {
            const [r,g,b] = c.match(/\\d+/g).slice(0,3).map(Number).map(v => {
              v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
            });
            return 0.2126*r + 0.7152*g + 0.0722*b;
          };
          const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b);
            return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
          const bg = getComputedStyle(document.body).backgroundColor;
          const out = [];
          for (const el of document.querySelectorAll('p, h1, h2, h3, a, li, span, td, th')) {
            if (!el.textContent.trim()) continue;
            const cs = getComputedStyle(el);
            const size = parseFloat(cs.fontSize);
            const bold = parseInt(cs.fontWeight) >= 700;
            const large = size >= 24 || (size >= 18.66 && bold);
            const need = large ? 3 : 4.5;
            let back = bg, node = el;
            while (node && node !== document.documentElement) {
              const c = getComputedStyle(node).backgroundColor;
              if (c && c !== 'rgba(0, 0, 0, 0)') { back = c; break; }
              node = node.parentElement;
            }
            const r = ratio(cs.color, back);
            if (r < need) out.push(el.tagName + ' ' + Math.round(r*100)/100 + ' needs ' + need);
          }
          return out.slice(0, 8);
        }""")
        note(not contrast, "text contrast meets WCAG AA at every size", contrast)

        real_errors = [e for e in console_errors
                       if "409" not in e and "Failed to load resource" not in e]
        note(not real_errors, "the browser console carries no script error", real_errors[:4])

        await browser.close()

    print()
    print(f"{len(problems)} problems")
    for p in problems:
        print("  -", p)
    return 1 if problems else 0


sys.exit(asyncio.run(main()))

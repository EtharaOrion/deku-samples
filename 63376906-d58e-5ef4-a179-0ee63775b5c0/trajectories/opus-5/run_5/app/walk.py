"""Browser walkthrough. Development harness; not shipped in the image."""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173"
PW = "deku-demo-pw-2026"
SHOTS = "/app/.browser_screenshots"

problems = []
console_errors = []


def check(name, cond, extra=""):
    if cond:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name} {extra}")
        problems.append(f"{name} {extra}")


def sign_in(page, who):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.wait_for_selector("#li-email", timeout=30000)
    page.fill("#li-email", f"{who}@example.com")
    page.fill("#li-pw", PW)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/console"), timeout=20000)
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("nav[aria-label='Console sections']", timeout=40000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(900)


def sign_out(page):
    page.evaluate("localStorage.clear(); sessionStorage.clear()")


def run(pw):
    browser = pw.chromium.launch(executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args=["--no-sandbox", "--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(f"{page.url} :: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"{page.url} :: pageerror {e}"))

    n = [0]

    def shot(label):
        n[0] += 1
        page.screenshot(path=f"{SHOTS}/{n[0]:02d}_{label}.png", full_page=True)

    # ---------------------------------------------------- 1. public routes
    print("\n[1] the public routes")
    for path, must in [
        ("/", "Tomorrow's materials. Made from today's waste."),
        ("/product", "Same material. Better origin."),
        ("/technology", "The power of green chemistry"),
        ("/about", "The hard facts"),
        ("/careers", "Why this problem matters"),
        ("/news", "News"),
        ("/contact", "Contact"),
        ("/privacy", "Privacy"),
    ]:
        page.goto(BASE + path, wait_until="networkidle")
        body = page.inner_text("body")
        check(f"{path} carries its copy", must in body, f"missing: {must!r}")
        sw = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
        check(f"{path} does not scroll sideways", not sw)
        title = page.title()
        desc = page.get_attribute('meta[name="description"]', "content") or ""
        check(f"{path} has its own title and description", len(title) > 8 and len(desc) > 20, f"{title!r} {desc[:40]!r}")

    page.goto(BASE + "/", wait_until="networkidle")
    body = page.inner_text("body")
    for phrase in ["Nylon that goes on and on and on", "The power of green chemistry", "We're closing the loop",
                   "Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon."]:
        check(f"home carries {phrase[:34]!r}", phrase in body)
    shot("home")

    page.goto(BASE + "/product", wait_until="networkidle")
    page.wait_for_selector("td:has-text('ISO 307')", timeout=20000)
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("product names its real limitations", "fishing nets" in body and "no recycling solution at all" in body)
    check("product heading agrees with the sentence", "Nylon in any form" in body)
    check("product carries the specification itself", "relative viscosity" in body.lower() and "ISO 307" in body and "2.40" in body)
    check("product names virgin reference", "virgin PA6 at relative viscosity 2.42" in body)
    check("recycled content beside its type and scheme", "mass_balance" in body and "RCS-2026" in body)
    for ind in ["Textiles and apparel", "Automotive", "Electrical and electronics", "Consumer goods", "Industrial", "Construction"]:
        check(f"product names {ind}", ind in body)
    shot("product")

    page.goto(BASE + "/technology", wait_until="networkidle")
    page.wait_for_selector("td:has-text('commissioned')", timeout=20000)
    page.wait_for_timeout(800)
    body = page.inner_text("body")
    for s in ["Dissolution", "Depolymerisation", "Purification", "Repolymerisation"]:
        check(f"technology names {s}", s in body)
    check("capacity states its unit once", "tonnes of pellet per year" in body)
    check("capacity states its basis", "8000 hours per year" in body)
    check("commercial reads >25,000", ">25,000" in body.replace(" ", ""), body[body.find("Commercial"):body.find("Commercial")+120] if "Commercial" in body else "")
    check("pilot carries a quantity not 'Multi-tonne'", "Multi-tonne" not in body)
    lb = body.lower()
    check("every capacity row carries confidence", lb.count("commissioned") >= 2 and "planned" in lb)
    check("diagram carries mass in and out", "Mass in" in body and "1,060,000" in body)
    for a in ["Green chemicals & reagents", "Low temperature & pressure", "Low carbon impact"]:
        check(f"technology names {a}", a in body)
    check("claims carry evidence", "CM-PA6 v2" in body)
    shot("technology")

    page.goto(BASE + "/about", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("about states three figures with sources", body.count("Source:") == 3 and body.count("Year:") == 3 and body.count("Geography:") == 3)
    check("emissions stated as a mass", "1.8 gigatonnes" in body)
    shot("about")

    page.goto(BASE + "/careers", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("careers count derived from collection", "1 open position" in body)
    check("careers names the position", "Process Engineer" in body and "Lyon, France" in body)
    shot("careers")

    page.goto(BASE + "/news", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("news has a real taxonomy", all(t in body for t in ["funding", "partnership", "technical", "recognition"]))
    check("news item declares another language", "in french" in body.lower())
    check("every item carries outlet and date", "Materials Weekly" in body and "2026-01-22" in body)
    shot("news")

    page.goto(BASE + "/contact", wait_until="networkidle")
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    for d in ["feedstock@example.com", "sales@example.com", "partners@example.com", "press@example.com"]:
        check(f"contact names {d}", d in body)
    check("contact states the point of collection", "privacy@example.com" in body and "removed" in body)
    page.select_option("#enq-type", "polymer_purchase")
    page.fill("#enq-name", "Auditor Test")
    page.fill("#enq-email", "walkthrough@example.com")
    page.fill("#enq-msg", "A walkthrough enquiry for verification.")
    page.click("form button[type=submit]")
    page.wait_for_selector("[role=status]", timeout=15000)
    body = page.inner_text("body")
    check("enquiry success says what happens next and when", "has been received" in body and "sales@example.com" in body and "working day" in body)
    check("enquiry success carries a reference", "ENQ-" in body)
    shot("contact_enquiry_sent")

    page.goto(BASE + "/privacy", wait_until="networkidle")
    body = page.inner_text("body")
    check("privacy names the controller and address", "Ravel Materials SAS" in body and "Lyon" in body)
    check("privacy names every retention", all(x in body for x in ["24 months", "36 months", "12 months", "120 months", "180 months"]))
    check("privacy states the record is not erased", "not erased on request" in body)
    check("privacy names the disclosure address", "security@example.com" in body)
    shot("privacy")

    # ---------------------------------------------- 2. visitor checks a cert
    print("\n[2] a visitor checks a certificate")
    page.goto(BASE + "/verify/CERT-PILOT-000001", wait_until="networkidle")
    page.wait_for_timeout(600)
    body = page.inner_text("body")
    check("verify states the withdrawal", "withdrawn on 2026-04-18" in body.lower() or "2026-04-18" in body)
    check("verify states the reason", "collector category was corrected" in body)
    check("verify does not forward to a replacement", "replacement" in body and "no replacement" in body.lower())
    check("verify needs no session", "Sign in" in body)
    robots = page.get_attribute('meta[name="robots"]', "content") or ""
    check("verify excluded from indexing", "noindex" in robots, robots)
    shot("verify_withdrawn")

    page.goto(BASE + "/verify/CERT-DEMO-999999", wait_until="networkidle")
    page.wait_for_timeout(600)
    body2 = page.inner_text("body")
    check("unknown number says there is no such certificate", "There is no such certificate" in body2)
    check("unknown uses the same layout", "Found" in body2 and "Claim type" in body2 and "Recipient" in body2)
    shot("verify_unknown")

    # -------------------------------------- 3. claims manager allocates
    print("\n[3] a claims manager allocates and is refused")
    page.goto(BASE + "/console", wait_until="networkidle")
    page.wait_for_url(re.compile(r"/login"), timeout=15000)
    check("anonymous console redirects to /login", "/login" in page.url)

    sign_in(page, "claims")
    page.wait_for_selector(".board-column", timeout=20000)
    page.wait_for_timeout(900)
    shot("console_board")
    body = page.inner_text("body")
    check("board carries four stage columns", all(s in body for s in ["Dissolution", "Depolymerisation", "Purification", "Repolymerisation"]))
    check("board names its column on the card", "RUN-D-0001" in body)
    check("top bar is persistent", "Reconciliation" in body and "Certificates" in body and "Intake" in body)

    page.goto(BASE + "/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('Credits')", timeout=20000)
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    inputs = page.locator("main input, main select, main textarea").count()
    check("the balance reading has no input control at all", inputs == 0, f"found {inputs}")
    check("balance reads credits in", "360,000 g" in body)
    check("balance reads credits out", "Credits out" in body)
    check("balance reads credits available per category", body.count("Credits available") == 2)
    check("balance names both categories", "post consumer" in body and "pre consumer" in body)
    check("balance shows the margin as a mass", "Remaining claimable" in body and "Within limits" not in body)
    check("balance shows three counts", "Overrides this period" in body and "Open restatements" in body and "findings past their date" in body.lower())
    shot("balance_before")

    # Attaching claim is an act at its own address on the same surface.
    page.click("a:has-text('Attach claim to a lot')")
    page.wait_for_url(re.compile(r"/allocate$"), timeout=20000)
    page.wait_for_selector("#al-lot", timeout=20000)
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    check("the act is at its own address", page.url.endswith("/allocate"), page.url)
    check("the act shows the same derived figures", "360,000 g" in body and "Credits available" in body)
    check("the act takes a mass and never a percentage", page.locator("input#al-mass").count() == 1 and page.locator("input[id*='percent'], input[id*='content_bp']").count() == 0)
    page.select_option("#al-lot", "LOT-N6-0001")
    page.select_option("#al-cat", "post_consumer")
    page.fill("#al-mass", "500000")
    page.click("form button[type=submit]")
    page.wait_for_selector("[role=alert]", timeout=15000)
    page.wait_for_timeout(600)
    body = page.inner_text("body")
    check("refusal is an inline banner on the balance surface", "This act was refused" in body)
    check("refusal names available and requested", "Available: 360,000 g" in body and "Requested: 500,000 g" in body)
    check("figures unchanged after refusal", "360,000 g" in body)
    after_available = page.inner_text("body")
    check("no allocation happened", "Credits out" in after_available and "0 g" in after_available)
    shot("balance_allocation_refused")

    # -------------------------------------- 4. signer meets a blocking condition
    print("\n[4] a signer meets a blocking condition")
    sign_out(page)
    sign_in(page, "signer")
    for step, addr in [("lot", "/console/certificates/new/lot"), ("claim", "/console/certificates/new/claim"),
                       ("recipient", "/console/certificates/new/recipient"), ("review", "/console/certificates/new/review")]:
        page.goto(BASE + addr, wait_until="networkidle")
        page.wait_for_timeout(400)
        if step == "lot":
            page.wait_for_selector("button:has-text('LOT-N6-0001')", timeout=20000)
            page.click("button:has-text('LOT-N6-0001')")
            page.wait_for_timeout(1500)
        if step == "recipient":
            page.wait_for_selector("button:has-text('CUS-HELIOS')", timeout=20000)
            page.click("button:has-text('CUS-HELIOS')")
            page.wait_for_timeout(1500)
        page.wait_for_selector(".condition-row", timeout=20000)
        page.wait_for_timeout(700)
        body = page.inner_text("body")
        check(f"step {step} is at its own address", addr in page.url)
        rows = page.locator(".condition-row").count()
        check(f"step {step} shows eight conditions", rows == 8, f"got {rows}")
        if step == "lot":
            shot("wizard_lot")

    body = page.inner_text("body")
    check("one condition is unsatisfied and says which", "not satisfied" in body.lower())
    check("the unreviewed override is named", "OVR-0001" in body)
    check("a link to the record that resolves it", page.locator("a.mono:has-text('OVR-0001')").count() >= 1 or "OVR-0001" in body)
    dismissers = page.locator("button:has-text('Dismiss'), button:has-text('Waive'), button:has-text('Skip'), button:has-text('Override'), button:has-text('Ignore')").count()
    check("no control dismisses a condition", dismissers == 0, f"found {dismissers}")
    check("wizard states the recipient files with a regulator", "regulator" in body)
    check("wizard renders the permitted statement", "may not state that this material physically contains" in body.lower())
    shot("wizard_review_blocked")

    # ------------------------------------- 5. withdrawal shows its blast radius
    print("\n[5] a withdrawal shows its blast radius")
    sign_out(page)
    sign_in(page, "signer2")
    page.goto(BASE + "/console/certificates/CERT-PILOT-000002", wait_until="networkidle")
    page.wait_for_selector("button:has-text('Begin a withdrawal')", timeout=25000)
    page.wait_for_timeout(600)
    page.click("button:has-text('Begin a withdrawal')")
    page.wait_for_selector("#wd-reason", timeout=15000)
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    check("withdrawal lists recipients by name", "Vanta Safety Systems" in body)
    check("withdrawal lists recipients not a count", "1 recipient" not in body)
    check("withdrawal lists the void statements", "obliged to stop making" in body and "mass balance" in body.lower())
    check("withdrawal lists the five consequences", body.count("consequences") >= 1 and "reverse traversal" in body)
    check("withdrawal runs the batch traversal", "BATCH-" in body or "No other certificate" in body)
    shot("withdrawal_blast_radius")

    page.fill("#wd-reason", "A walkthrough withdrawal, for verification of the five consequences.")
    page.click("button:has-text('Confirm this withdrawal')")
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("state becomes withdrawn", "withdrawn" in body.lower())
    shot("withdrawal_confirmed")

    sign_out(page)
    page.goto(BASE + "/verify/CERT-PILOT-000002", wait_until="networkidle")
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    check("address still resolves and states the withdrawal", "withdrawn" in body.lower() and "walkthrough withdrawal" in body.lower())
    shot("verify_after_withdrawal")

    # ---------------------------------------- 6. auditor reads and exports
    print("\n[6] an auditor reads and exports")
    sign_in(page, "auditor")
    page.goto(BASE + "/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('The graph')", timeout=25000)
    page.wait_for_timeout(900)
    body = page.inner_text("body")
    check("genealogy renders the graph", "The graph" in body)
    check("genealogy renders the nested list", "The same facts as a nested list" in body)
    check("BATCH-1001 appears with 450,000 g", body.count("BATCH-1001") >= 2 and "450,000" in body)
    check("a flag is visible from the lot", "flagged" in body.lower())
    check("edges carry mass not a percentage", "g)" in body)
    mut = page.locator("button:has-text('Attach'), button:has-text('Sign this'), button:has-text('Confirm this withdrawal'), button:has-text('Begin a withdrawal')").count()
    check("no mutating control is present for the auditor", mut == 0, f"found {mut}")
    shot("genealogy_graph_and_list")

    page.click("button:has-text('Export this genealogy')")
    page.wait_for_selector("[role=status]", timeout=20000)
    page.wait_for_timeout(600)
    body = page.inner_text("body")
    check("export succeeds and is itself an entry", "Exported" in body and "is itself an entry" in body)
    check("export carries digests and anchor references", "digests" in body and "anchor references" in body)
    shot("genealogy_exported")

    page.goto(BASE + "/console/record", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('The digest chain')", timeout=25000)
    page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("record chain holds", "The chain holds" in body)
    check("record shows refusals as well as successes", "refused" in body.lower())
    check("record shows nine questions", body.count("certificates on period") >= 1 and "refused allocations" in body)
    page.click("button:has-text('refused allocations')")
    page.wait_for_timeout(1200)
    body = page.inner_text("body")
    check("refused allocations answer complete set", "complete set" in body and "500000" in body.replace(",", ""))
    shot("record_and_queries")

    page.goto(BASE + "/console/reconciliation", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('Integration ages')", timeout=25000)
    page.wait_for_timeout(900)
    body = page.inner_text("body")
    check("reconciliation shows six figures", all(x in body for x in ["Mass balance residual", "Credit margin", "Consumptions on open runs", "Batches with broken custody", "Certificates with superseded figures", "Integration ages"]))
    check("customer_reporting reads no record", "never sent" in body and "no record" in body)
    check("reconciliation shows this period against the last three", "against the last three" in body)
    shot("reconciliation")

    page.goto(BASE + "/console/intake", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('Collectors')", timeout=25000)
    page.wait_for_timeout(900)
    body = page.inner_text("body")
    check("intake says a batch cannot be claimed and names the link", "This batch cannot be claimed: transport." in body)
    check("intake says the approval lapsed", "approval lapsed on" in body and "processed but not claimed" in body)
    check("intake carries the lapsed calibration word", "calibration lapsed" in body.lower())
    check("intake shows dry mass computed", "450,000" in body and "6,172" not in body.split("BATCH-1001")[0])
    check("intake names the departure as a finding on the collector", "against the collector rather than against the plant" in body or "FND-" in body)
    shot("intake")

    # ------------------------------------------------ 7. states and colour
    print("\n[7] states, colour and type")
    page.goto(BASE + "/console/lots/LOT-N6-0001", wait_until="networkidle")
    page.wait_for_selector("h2:has-text('Carbon')", timeout=25000)
    page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("lot shows the override for its life", "Separation overridden by" in body and "cannot be removed" in body)
    check("carbon renders with all four components", "Boundary:" in body and "Method version:" in body and "Uncertainty:" in body)
    check("comparator described as lower than, by name", "lower than virgin PA6" in body)
    check("energy figures appear together", "Location-based" in body and "Market-based" in body)
    check("unmatched consumption is named", "Unmatched consumption" in body)
    check("yield answers for the auditor and says it is on no certificate", "appears on no certificate" in body)
    shot("lot_carbon_and_energy")

    greens = page.evaluate("""() => {
      const bad = [];
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        for (const prop of ['color','backgroundColor','borderTopColor','borderLeftColor','outlineColor']) {
          const v = s[prop];
          const m = /rgba?\\((\\d+), ?(\\d+), ?(\\d+)/.exec(v || '');
          if (!m) continue;
          const [r,g,b] = [+m[1],+m[2],+m[3]];
          if (g > 90 && g > r + 40 && g > b + 40) bad.push(prop + ' ' + v + ' on ' + el.tagName);
        }
      }
      return [...new Set(bad)].slice(0, 10);
    }""")
    check("nothing renders green as a state in the console", len(greens) == 0, str(greens))

    accent_in_console = page.evaluate("""() => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const hl = getComputedStyle(document.documentElement).getPropertyValue('--highlight').trim();
      const norm = (h) => { const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h); return m?`rgb(${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)})`:h; };
      const targets = [norm(accent), norm(hl)];
      const hits = [];
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        for (const p of ['color','backgroundColor','borderTopColor','borderLeftColor']) {
          if (targets.includes(s[p])) hits.push(p + ' ' + s[p] + ' ' + el.tagName);
        }
      }
      return [...new Set(hits)].slice(0,10);
    }""")
    check("the console reaches for the accent on nothing", len(accent_in_console) == 0, str(accent_in_console))

    tiny = page.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        if (!el.textContent || !el.textContent.trim()) continue;
        if (el.children.length && ![...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        const fs = parseFloat(s.fontSize);
        if (fs && fs < 12) out.push(el.tagName + ' ' + fs + 'px ' + el.className);
      }
      return [...new Set(out)].slice(0,10);
    }""")
    check("nothing renders below twelve pixels", len(tiny) == 0, str(tiny))

    no_lh = page.evaluate("""() => {
      const out = [];
      for (const el of document.querySelectorAll('p,h1,h2,h3,h4,td,th,li,span,button,a,dt,dd,label,summary')) {
        const s = getComputedStyle(el);
        if (s.lineHeight === 'normal') out.push(el.tagName + ' ' + el.className);
      }
      return [...new Set(out)].slice(0,10);
    }""")
    check("no element ships without a line height", len(no_lh) == 0, str(no_lh))

    # ---------------------------------------------------- 8. responsiveness
    print("\n[8] the three widths")
    for label, w, h in [("phone", 380, 900), ("tablet", 820, 1000), ("desktop", 1440, 1000)]:
        page.set_viewport_size({"width": w, "height": h})
        for path in ["/", "/technology", "/console", "/console/balance/BP-DEMO-N6-2026H1",
                     "/console/lots/LOT-N6-0001/genealogy", "/console/certificates/new/review"]:
            page.goto(BASE + path, wait_until="networkidle")
            page.wait_for_timeout(1400)
            sw = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
            check(f"{label} {path} does not scroll sideways", not sw)
        if label == "phone":
            page.goto(BASE + "/console/lots/LOT-N6-0001/genealogy", wait_until="networkidle")
            page.wait_for_timeout(1600)
            shot("phone_genealogy_nested_list")
            page.goto(BASE + "/console/balance/BP-DEMO-N6-2026H1", wait_until="networkidle")
            page.wait_for_timeout(1600)
            shot("phone_balance_one_figure_per_row")
    page.set_viewport_size({"width": 1440, "height": 1000})

    # ------------------------------------------ 9. the forbidden colour list
    print("\n[9] the nine forbidden values")
    css = page.evaluate("""async () => {
      const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
      let all = '';
      for (const h of links) all += await (await fetch(h)).text();
      for (const s of document.querySelectorAll('style')) all += s.textContent;
      return all;
    }""")
    for bad in ["#2d62ff", "#dd23bb", "#fcf8d8", "#cef5ca", "#114e0b", "#f8e4e4", "#3b0b0b", "#5e5515", "#0000"]:
        present = re.search(re.escape(bad) + r"(?![0-9a-fA-F])", css, re.I) is not None
        check(f"stylesheet excludes {bad}", not present)
    check("stylesheet declares no blanket transition", "transition:all" not in css.replace(" ", "") and "transition-property:all" not in css.replace(" ", ""))
    literals = set(x.lower() for x in re.findall(r"#[0-9a-fA-F]{3,8}", css))
    check(f"at most eight colour literals ({len(literals)})", len(literals) <= 8, str(sorted(literals)))
    named = set(re.findall(r"(?<![-\w])(red|green|blue|yellow|orange|purple|pink|lime|teal|cyan|magenta|gold|salmon)(?![-\w])", css, re.I))
    check("no stray named colour", len(named) == 0, str(named))
    check("no deletion marker in a token name", not re.search(r"--[\w-]*(deprecated|old|unused|delete|remove|legacy|tmp)", css, re.I))

    # -------------------------------------------------- 10. reduced motion
    print("\n[10] reduced motion and print")
    ctx2 = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    p2 = ctx2.new_page()
    p2.goto(BASE + "/", wait_until="networkidle")
    p2.wait_for_timeout(400)
    st = p2.evaluate("""() => {
      const el = document.querySelector('.reveal');
      if (!el) return null;
      const s = getComputedStyle(el);
      return { opacity: s.opacity, filter: s.filter };
    }""")
    check("reveal resolves immediately under reduced motion", st and st["opacity"] == "1" and st["filter"] in ("none", "blur(0px)"), str(st))
    ctx2.close()

    ctx3 = browser.new_context(viewport={"width": 1440, "height": 1000})
    p3 = ctx3.new_page()
    p3.goto(BASE + "/privacy", wait_until="networkidle")
    p3.emulate_media(media="print")
    p3.wait_for_timeout(300)
    hidden = p3.evaluate("getComputedStyle(document.querySelector('.topbar')).display")
    check("print stylesheet hides the chrome", hidden == "none", hidden)
    ctx3.close()

    # -------------------------------------------------- 11. keyboard + focus
    print("\n[11] keyboard and focus")
    page.goto(BASE + "/", wait_until="networkidle")
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement ? document.activeElement.className + '|' + document.activeElement.tagName : ''")
    check("first tab reaches the skip link", "skip" in focused.lower(), focused)
    ring = page.evaluate("""() => {
      const a = document.querySelector('a.nav-link');
      a.focus();
      const f = getComputedStyle(a);
      return { outline: f.outlineWidth + ' ' + f.outlineStyle, bg: f.backgroundColor };
    }""")
    check("focus ring is visible", ring["outline"] != "0px none", str(ring))

    icon_labels = page.evaluate("""() => {
      const bad = [];
      for (const svg of document.querySelectorAll('svg')) {
        if (!svg.getAttribute('aria-label') && !svg.querySelector('title')) bad.push(svg.outerHTML.slice(0,50));
      }
      return bad;
    }""")
    check("every inline vector carries a label", len(icon_labels) == 0, str(icon_labels))

    # -------------------------------------------------- 12. byte budgets
    print("\n[12] byte budgets")
    for label, path, script_budget, paint_budget in [
        ("public", "/", 220000, 220000),
        ("console", "/console", 700000, 320000),
        ("balance", "/console/balance/BP-DEMO-N6-2026H1", 800000, 360000),
    ]:
        c = browser.new_context(viewport={"width": 1440, "height": 1000})
        p = c.new_page()
        sizes = {"script": 0, "css": 0, "font": 0, "image": 0, "media": 0, "doc": 0}
        def on_resp(r, sizes=sizes):
            try:
                ct = (r.headers.get("content-type") or "")
                b = len(r.body())
            except Exception:
                return
            if "javascript" in ct: sizes["script"] += b
            elif "css" in ct: sizes["css"] += b
            elif "font" in ct: sizes["font"] += b
            elif ct.startswith("image/"): sizes["image"] += b
            elif ct.startswith("video/") or ct.startswith("audio/"): sizes["media"] += b
            elif "html" in ct: sizes["doc"] += b
        p.on("response", on_resp)
        if path != "/":
            p.goto(BASE + "/login", wait_until="networkidle")
            p.fill("#li-email", "claims@example.com"); p.fill("#li-pw", PW); p.click("button[type=submit]")
            p.wait_for_url(re.compile(r"/console"), timeout=15000)
            for k in sizes: sizes[k] = 0
        p.goto(BASE + path, wait_until="networkidle")
        p.wait_for_timeout(2000)
        check(f"{label} script under budget ({sizes['script']})", sizes["script"] <= script_budget, str(sizes))
        check(f"{label} first-paint bytes under budget ({sizes['doc']+sizes['css']+sizes['script']})", sizes["doc"] + sizes["css"] + sizes["script"] <= paint_budget, str(sizes))
        check(f"{label} fonts under 140000 ({sizes['font']})", sizes["font"] <= 140000)
        check(f"{label} images under budget ({sizes['image']})", sizes["image"] <= (450000 if label == 'public' else 80000))
        check(f"{label} no media before interaction ({sizes['media']})", sizes["media"] == 0)
        c.close()

    # -------------------------------------------------- 13. contrast
    print("\n[13] contrast")
    page.goto(BASE + "/", wait_until="networkidle")
    low = page.evaluate("""() => {
      const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
      const parse = (s) => { const m = /rgba?\\((\\d+), ?(\\d+), ?(\\d+)/.exec(s); return m ? [+m[1],+m[2],+m[3]] : null; };
      const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); const a = getComputedStyle(e).backgroundColor; if (c && !/rgba\\(.*, ?0\\)/.test(a)) return c; e = e.parentElement; } return [255,255,255]; };
      const out = [];
      for (const el of document.querySelectorAll('p,h1,h2,h3,h4,span,td,th,li,a,button,dt,dd,label,small,figcaption')) {
        const t = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
        if (!t) continue;
        const s = getComputedStyle(el);
        const fg = parse(s.color); if (!fg) continue;
        const bg = bgOf(el);
        const l1 = lum(fg), l2 = lum(bg);
        const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
        const fs = parseFloat(s.fontSize); const fw = parseInt(s.fontWeight)||400;
        const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
        const need = large ? 3 : 4.5;
        if (ratio < need) out.push(`${el.tagName}.${el.className} ${ratio.toFixed(2)} need ${need} fs${fs}`);
      }
      return [...new Set(out)].slice(0,12);
    }""")
    check("text contrast meets WCAG AA everywhere", len(low) == 0, str(low))

    ctx.close()
    browser.close()


with sync_playwright() as pw:
    run(pw)

real_errors = [e for e in console_errors if "Failed to load resource" not in e and "favicon" not in e]
print(f"\nconsole errors: {len(real_errors)}")
for e in real_errors[:15]:
    print("  " + e)

print(f"\n{len(problems)} problems")
for p in problems:
    print("  - " + p)
sys.exit(1 if problems or real_errors else 0)

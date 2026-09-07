"""Drive the running app through the journeys the brief describes."""
import os
import re
import sys
import json
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WALK_BASE", "http://localhost:4180")
MAILPIT = "http://mailpit:8025"
PW = "deku-demo-pw-2026"
SHOTS = "/app/.browser_screenshots"
os.makedirs(SHOTS, exist_ok=True)

failures = []
console_errors = []


def check(cond, label, extra=""):
    if cond:
        print(f"  ok  {label}")
    else:
        print(f"FAIL  {label} {extra}")
        failures.append(label)


def mail_for(addr):
    url = f"{MAILPIT}/api/v1/search?query=to%3A{addr}&limit=50"
    with urllib.request.urlopen(url) as r:
        return json.load(r).get("messages", [])


def on_console(page, m):
    if m.type != "error":
        return
    # A deliberate 4xx probe (an unauthorized call, a draft lookup, a refused
    # handle) is logged by the browser as a failed resource; that is the app
    # working, not breaking. Everything else is a real console error.
    if "Failed to load resource" in m.text and re.search(r"status of (400|401|403|404|429)", m.text):
        return
    console_errors.append(f"{page.url} :: {m.type}: {m.text}")


def attach(page):
    page.on("console", lambda m: on_console(page, m))
    page.on("pageerror", lambda e: console_errors.append(f"{page.url} :: pageerror: {e}"))


def sign_in(page, email):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#email", email)
    page.fill("#password", PW)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/(home|calendars)"), timeout=15000)


def run(p):
    browser = p.chromium.launch(
        executable_path=os.environ.get("CHROME_BIN", "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"),
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )

    # ---- Journey 1: a stranger signs up, opens an event, registers.
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    attach(page)

    page.goto(BASE, wait_until="networkidle")
    check(page.locator("h1").count() == 1, "landing has exactly one h1")
    check("start here" in page.inner_text("h1"), "landing headline reads start here")
    check(page.locator(".poster-tile").count() == 22, "22 posters at desktop",
          str(page.locator('.poster-tile').count()))
    page.screenshot(path=f"{SHOTS}/01_landing.png", full_page=False)

    stamp = int(time.time())
    guest_email = f"walker-{stamp}@example.com"
    page.goto(f"{BASE}/signup", wait_until="networkidle")
    page.fill("#name", "Wanda Walker")
    page.fill("#email", guest_email)
    page.fill("#password", "walk-this-way-1")
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/home"), timeout=15000)
    check("/home" in page.url, "signup lands a guest on /home")
    page.wait_for_selector(".empty-state", timeout=10000)
    check("No Upcoming Events" in page.inner_text("body"), "empty state names the absence")
    page.screenshot(path=f"{SHOTS}/02_signup_home.png")

    # Journey 1 proper: open a published event and register.
    page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
    ground = page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()")
    check(ground not in ("", "#ffffff"), "event page arrives already themed", ground)
    check(page.locator("h1").count() == 1, "event page has one h1")
    page.click("button.reg-action")
    page.wait_for_selector(".ticket-code", timeout=15000)
    ticket = page.inner_text(".ticket-code").strip()
    check(re.match(r"^TKT-[A-Z0-9]{8}$", ticket) is not None, "panel shows a ticket code", ticket)
    check("You’re Going" in page.inner_text("#reg-heading"), "panel flips to you are going")
    page.screenshot(path=f"{SHOTS}/03_registered_with_ticket.png")

    msgs = mail_for(guest_email)
    check(any(m["Subject"] == "You're going to Thursday Night 5K" for m in msgs),
          "confirmation email arrived with the pinned subject",
          str([m["Subject"] for m in msgs]))
    if msgs:
        with urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{msgs[0]['ID']}") as r:
            body = json.load(r)
        check(ticket in body["Text"], "email carries the ticket code")
        check("Thursday Night 5K" in body["Text"], "email body names the event")
        check(len(body["To"]) == 1 and not body.get("Cc") and not body.get("Bcc"),
              "email went to that guest alone")

    # The ticket page is presentable without an account.
    anon = browser.new_context()
    anon_page = anon.new_page()
    attach(anon_page)
    anon_page.goto(f"{BASE}/t/{ticket}", wait_until="networkidle")
    check(ticket in anon_page.inner_text("body"), "ticket readable with no account")
    check(anon_page.locator("svg[role=img]").count() > 0, "ticket carries a drawn scan code")
    anon_page.screenshot(path=f"{SHOTS}/04_ticket_no_account.png")
    anon.close()

    # ---- Journey 2: two guests take the last seat at the same instant.
    ctxa = browser.new_context()
    ctxb = browser.new_context()
    pa, pb = ctxa.new_page(), ctxb.new_page()
    attach(pa)
    attach(pb)
    ea = f"racer-a-{stamp}@example.com"
    eb = f"racer-b-{stamp}@example.com"
    for pg, em, nm in ((pa, ea, "Rita Racer"), (pb, eb, "Rolf Racer")):
        pg.goto(f"{BASE}/signup", wait_until="networkidle")
        pg.fill("#name", nm)
        pg.fill("#email", em)
        pg.fill("#password", "race-you-there-1")
        pg.click("button[type=submit]")
        pg.wait_for_url(re.compile(r"/home"), timeout=15000)

    for pg in (pa, pb):
        pg.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")

    token_a = pa.evaluate("localStorage.getItem('deku.token')")
    token_b = pb.evaluate("localStorage.getItem('deku.token')")
    # Both registrations leave the browser in the same tick, in flight together.
    both = pa.evaluate(
        """async ([ta, tb]) => {
        const fire = (token) => fetch('/api/registrations', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: JSON.stringify({ event_slug: 'riverside-track-session' })
        }).then(async (r) => ({ status: r.status, body: await r.json() }));
        return Promise.all([fire(ta), fire(tb)]);
    }""",
        [token_a, token_b],
    )
    ra, rb = both[0], both[1]

    statuses = sorted([ra["body"].get("status"), rb["body"].get("status")])
    check(statuses == ["confirmed", "waitlisted"], "one seat, one waiting-list place", str(statuses))

    for pg in (pa, pb):
        pg.reload(wait_until="networkidle")
    winner = pa if ra["body"].get("status") == "confirmed" else pb
    loser = pb if winner is pa else pa
    check("You’re Going" in winner.inner_text("#reg-heading"), "winner sees a ticket")
    check("Waiting List" in loser.inner_text("#reg-heading"), "loser sees a waiting-list place",
          loser.inner_text("#reg-heading"))
    loser.screenshot(path=f"{SHOTS}/05_last_seat_waitlist.png")

    ev = json.loads(urllib.request.urlopen(f"{BASE}/api/events/riverside-track-session").read())
    check(ev["confirmed_count"] <= ev["capacity"], "confirmed never exceeds capacity",
          f"{ev['confirmed_count']}/{ev['capacity']}")

    # ---- Journey 3: the host approves the pending request.
    hostctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    hp = hostctx.new_page()
    attach(hp)
    sign_in(hp, "host@example.com")
    check("/calendars" in hp.url, "a host lands on /calendars")
    hp.screenshot(path=f"{SHOTS}/06_host_calendars.png")

    hp.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
    hp.wait_for_selector("#queue-heading")
    had_queue = hp.locator(".queue-row").count() > 0
    check(had_queue, "the pending request is in the queue")
    if had_queue:
        hp.click(".queue-row button:has-text('Approve')")
        hp.wait_for_timeout(1500)
        table = hp.inner_text("table")
        check("Confirmed" in table, "the approved row flips to confirmed")
    hp.screenshot(path=f"{SHOTS}/07_host_approved.png")

    # ---- Journey 4: a confirmed guest cancels; the head of the list is confirmed.
    before = len(mail_for(guest_email))
    wl_before = json.loads(
        urllib.request.urlopen(f"{BASE}/api/events/riverside-track-session").read())
    loser.goto(f"{BASE}/home", wait_until="networkidle")
    winner.goto(f"{BASE}/home", wait_until="networkidle")
    winner.click("button:has-text('Cancel')")
    winner.wait_for_selector("[role=dialog]")
    winner.click("button:has-text('Yes, Cancel')")
    winner.wait_for_timeout(2000)
    check("Cancelled" in winner.inner_text(".rows"), "the row moves to its new status in place")
    winner.screenshot(path=f"{SHOTS}/08_guest_cancelled.png")

    loser_email = eb if loser is pb else ea
    lm = mail_for(loser_email)
    check(any(m["Subject"] == "A spot opened up for Riverside Track Session" for m in lm),
          "the head of the waiting list was confirmed and mailed",
          str([m["Subject"] for m in lm]))
    loser.goto(f"{BASE}/home", wait_until="networkidle")
    check("Confirmed" in loser.inner_text(".rows"), "the promoted guest now holds a seat")

    # ---- Journey 5: host2 calls Winter Reading Night off with a typed reason.
    h2ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    h2 = h2ctx.new_page()
    attach(h2)
    sign_in(h2, "host2@example.com")
    h2.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
    h2.click("button:has-text('Cancel Event')")
    h2.wait_for_selector("[role=dialog]")
    action = h2.locator("button:has-text('Cancel This Event')")
    check(action.is_disabled(), "the cancel action waits for a typed reason")
    reason = "The radiators failed and the room is freezing."
    h2.fill("#cancel-reason", reason)
    action.click()
    h2.wait_for_timeout(2000)
    check(reason in h2.inner_text("body"), "the dashboard shows the host's own reason")
    h2.screenshot(path=f"{SHOTS}/09_host_cancelled_event.png")

    # That page keeps its address and shows the notice, not the panel.
    pubctx = browser.new_context()
    pub = pubctx.new_page()
    attach(pub)
    pub.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
    body_text = pub.inner_text("body")
    check("/winter-reading-night" in pub.url, "the cancelled event keeps its address")
    check(reason in body_text, "the public page carries the reason word for word")
    check(pub.locator("button.reg-action").count() == 0, "the registration panel is gone")
    pub.screenshot(path=f"{SHOTS}/10_cancelled_public_page.png")

    # ---- Authorization from the browser: a guest calling host-only endpoints.
    denied = winner.evaluate("""async (token) => {
        const calls = [
          ['GET', '/api/events/thursday-night-5k/registrations'],
          ['GET', '/api/events/thursday-night-5k/registrations.csv'],
          ['POST', '/api/calendars'],
          ['POST', '/api/events/thursday-night-5k/cancel'],
        ];
        const out = [];
        for (const [m, u] of calls) {
          const res = await fetch(u, { method: m,
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
            body: m === 'POST' ? '{}' : undefined });
          out.push([u, res.status]);
        }
        return out;
    }""", winner.evaluate("localStorage.getItem('deku.token')"))
    check(all(s >= 400 for _, s in denied), "a guest session is refused every host endpoint",
          str(denied))
    ev_after = json.loads(urllib.request.urlopen(f"{BASE}/api/events/thursday-night-5k").read())
    check(ev_after["state"] == "published", "the protected state is unchanged")

    # A guest at /calendars gets the not-found page.
    winner.goto(f"{BASE}/calendars", wait_until="networkidle")
    check("Page Not Found" in winner.inner_text("body"), "a guest at /calendars gets not-found")
    winner.screenshot(path=f"{SHOTS}/11_guest_denied_calendars.png")

    # A draft event is not-found to everyone but its host.
    pub.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
    check("Page Not Found" in pub.inner_text("body"), "a draft event answers as not-found")

    # ---- Discovery: the address is the state.
    pub.goto(f"{BASE}/discover?category=books&city=Lisbon", wait_until="networkidle")
    pub.wait_for_timeout(800)
    check(pub.locator("#f-category").input_value() == "books", "the filter reads back from the URL")
    pub.goto(f"{BASE}/discover?category=crypto", wait_until="networkidle")
    pub.wait_for_timeout(800)
    check("No Events Found" in pub.inner_text("body"), "the empty state is pinned")
    pub.goto(f"{BASE}/discover", wait_until="networkidle")
    pub.wait_for_timeout(800)
    check(re.search(r"Showing \d+ of \d+", pub.inner_text("body")) is not None,
          "the page control reads Showing n of total")
    pub.screenshot(path=f"{SHOTS}/12_discover.png")

    # ---- The closed panel is reachable from the first run.
    pub.goto(f"{BASE}/riverside-winter-time-trial", wait_until="networkidle")
    t = pub.inner_text("body")
    check("Registration Is Closed" in t and
          "The host has stopped taking registrations for this event." in t,
          "the closed panel carries its pinned copy")
    pub.screenshot(path=f"{SHOTS}/13_registration_closed.png")

    # ---- The door: check a ticket in, then a second time.
    hp.goto(f"{BASE}/event/thursday-night-5k/manage/guests", wait_until="networkidle")
    hp.fill("#door-code", ticket)
    hp.click("button:has-text('Check In')")
    hp.wait_for_timeout(1500)
    first = hp.inner_text(".door-answer")
    check("Checked in at" in first, "the door checks a ticket in", first)
    hp.fill("#door-code", ticket)
    hp.click("button:has-text('Check In')")
    hp.wait_for_timeout(1500)
    second = hp.inner_text(".door-answer")
    check("already checked in" in second, "a second check-in records one arrival, not two", second)
    hp.screenshot(path=f"{SHOTS}/14_door_check_in.png")

    # ---- Raising capacity moves the waiting list, in the same request.
    hp.goto(f"{BASE}/event/thursday-night-5k/manage/registration", wait_until="networkidle")
    hp.wait_for_selector("#capacity")
    hp.fill("#capacity", "9")
    hp.click("button:has-text('Save')")
    hp.wait_for_timeout(2000)
    check("Capacity saved" in hp.inner_text(".announce") or
          "moved from the waiting list" in hp.inner_text(".announce"),
          "the raise reports what it moved", hp.inner_text(".announce"))
    hp.screenshot(path=f"{SHOTS}/15_capacity_raise.png")

    # ---- The composer publishes a real event.
    hp.goto(f"{BASE}/create", wait_until="networkidle")
    hp.wait_for_selector("#c-title")
    hp.fill("#c-title", f"Walkthrough Night {stamp}")
    hp.fill("#c-start", "2027-03-04T19:00")
    hp.fill("#c-end", "2027-03-04T21:00")
    hp.fill("#c-city", "Berlin")
    hp.fill("#c-about", "An evening created during the walkthrough to prove the composer works.")
    hp.fill("#c-title", f"Walkthrough Night {stamp}")
    hp.screenshot(path=f"{SHOTS}/16_composer.png")
    hp.click("button:has-text('Create Event')")
    hp.wait_for_url(re.compile(r"/manage/overview"), timeout=15000)
    check("/manage/overview" in hp.url, "the composer creates and lands on the dashboard")
    hp.wait_for_selector(".masthead .pill", timeout=10000)
    check("Published" in hp.inner_text(".masthead"), "the new event is published",
          hp.inner_text(".masthead"))
    hp.screenshot(path=f"{SHOTS}/17_new_event_dashboard.png")

    # ---- Settings: a refused handle keeps the stored one.
    winner.goto(f"{BASE}/settings/profile", wait_until="networkidle")
    winner.wait_for_selector("#handle")
    stored = winner.input_value("#handle")
    winner.fill("#handle", "priya-raman")
    winner.click("button:has-text('Save Changes')")
    winner.wait_for_timeout(1500)
    check("That handle is already taken." in winner.inner_text("body"),
          "a taken handle is refused with the pinned sentence")
    winner.reload(wait_until="networkidle")
    winner.wait_for_selector("#handle")
    check(winner.input_value("#handle") == stored, "the stored handle is unchanged after a refusal")
    winner.screenshot(path=f"{SHOTS}/18_settings_handle_refused.png")

    # ---- Redirects.
    fresh = browser.new_context()
    fp = fresh.new_page()
    attach(fp)
    fp.goto(f"{BASE}/home", wait_until="networkidle")
    check(fp.url.endswith("/login?next=%2Fhome") or fp.url.endswith("/login?next=/home"),
          "a protected route redirects with next", fp.url)
    fp.fill("#email", "guest@example.com")
    fp.fill("#password", PW)
    fp.click("button[type=submit]")
    fp.wait_for_url(re.compile(r"/home"), timeout=15000)
    check(fp.url.endswith("/home"), "sign-in lands on next")
    fp.screenshot(path=f"{SHOTS}/19_login_next.png")
    fresh.close()

    # ---- A phone viewport: the panel becomes a foot bar.
    phone = browser.new_context(viewport={"width": 390, "height": 844})
    ph = phone.new_page()
    attach(ph)
    ph.goto(f"{BASE}/sunrise-long-run", wait_until="networkidle")
    check(ph.locator(".phone-bar").is_visible(), "the registration panel becomes a foot bar")
    check(ph.locator(".poster-tile").count() == 0, "no posters on the event route")
    ph.screenshot(path=f"{SHOTS}/20_phone_foot_bar.png")
    ph.goto(BASE, wait_until="networkidle")
    check(ph.locator(".poster-tile").count() == 8, "8 posters on a phone",
          str(ph.locator('.poster-tile').count()))
    ph.screenshot(path=f"{SHOTS}/21_phone_landing.png")
    phone.close()

    # ---- Keyboard reachability and focus ring.
    pub.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
    pub.keyboard.press("Tab")
    pub.keyboard.press("Tab")
    focused = pub.evaluate("document.activeElement.tagName")
    check(focused not in ("BODY", None), "keyboard focus reaches the page", str(focused))

    browser.close()


with sync_playwright() as p:
    run(p)

print("\nconsole errors:", len(console_errors))
for e in console_errors[:15]:
    print("   ", e)

print(f"\n{len(failures)} failed")
for f in failures:
    print("   FAILED:", f)
sys.exit(1 if failures or console_errors else 0)

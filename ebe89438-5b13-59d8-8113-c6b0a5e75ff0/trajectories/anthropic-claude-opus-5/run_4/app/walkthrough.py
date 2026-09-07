"""Drives the running app through the journeys in the brief, as a stranger would.

Reads values back off the page rather than trusting that it rendered, watches the
console, and saves one screenshot per journey.
"""

import asyncio
import os
import re
import sys
import time

import asyncpg
import httpx
from playwright.async_api import async_playwright

BASE = os.environ.get("WALK_BASE", "http://localhost:4180")
MAILPIT = "http://mailpit:8025"
PW = "deku-demo-pw-2026"
SHOTS = "/app/.browser_screenshots"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"

failures = []
console_problems = []


def check(label, condition, detail=""):
    if condition:
        print(f"  ok  {label}")
    else:
        print(f"FAIL  {label}  {detail}")
        failures.append(f"{label} {detail}")


def watch(page, name):
    def on_console(msg):
        if msg.type in ("error", "warning"):
            text = msg.text
            if "favicon" in text.lower():
                return
            # A 4xx the app is meant to give (a guest refused, a draft hidden,
            # a handle already taken) is the product working, not a fault.
            if "status of 4" in text and "Failed to load resource" in text:
                return
            if "status of 5" in text:
                console_problems.append(f"[{name}] server fault: {text}")
                return
            console_problems.append(f"[{name}] {msg.type}: {text}")

    page.on("console", on_console)
    page.on("pageerror", lambda e: console_problems.append(f"[{name}] pageerror: {e}"))


async def mail_for(email, subject=None):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{MAILPIT}/api/v1/search", params={"query": f"to:{email}", "limit": 50})
        if r.status_code != 200:
            return []
        msgs = r.json().get("messages", [])
        return [m for m in msgs if subject is None or m["Subject"] == subject]


async def leave_auth_route(page, timeout=15000):
    """Waits until the sign-in card is gone, so the assertion judges the landing."""
    await page.wait_for_function(
        "() => !location.pathname.startsWith('/login') && !location.pathname.startsWith('/signup')",
        timeout=timeout,
    )
    await page.wait_for_load_state("networkidle")


async def sign_in(page, email, password=PW, expect_path=None):
    await page.goto(f"{BASE}/login", wait_until="networkidle")
    await page.fill("#email", email)
    await page.fill("#password", password)
    await page.click("button[type=submit]")
    await leave_auth_route(page)
    if expect_path:
        check(f"{email} lands on {expect_path}", expect_path in page.url, page.url)


async def sign_up(page, name, email, next_path=None):
    url = f"{BASE}/signup" + (f"?next={next_path}" if next_path else "")
    await page.goto(url, wait_until="networkidle")
    await page.fill("#name", name)
    await page.fill("#email", email)
    await page.fill("#password", PW)
    await page.click("button[type=submit]")
    await leave_auth_route(page)


async def shot(page, name):
    await page.screenshot(path=f"{SHOTS}/{name}", animations="disabled", timeout=20000)


async def main():
    db = await asyncpg.connect(os.environ["DATABASE_URL"])
    stamp = str(int(time.time()))

    # Put the seeded world back, so a second walk starts where the first did.
    await db.execute("""
        UPDATE events SET state='published', cancelled_at=NULL, cancel_reason=NULL
         WHERE slug IN ('winter-reading-night','thursday-night-5k','riverside-track-session','sunrise-long-run')
    """)
    await db.execute("UPDATE events SET state='registration_closed' WHERE slug='riverside-winter-time-trial'")
    await db.execute("UPDATE events SET state='draft' WHERE slug='harbour-loop-recovery-jog'")
    await db.execute("""
        DELETE FROM registrations WHERE event_id IN
          (SELECT id FROM events WHERE slug IN
             ('riverside-track-session','thursday-night-5k','sunrise-long-run','winter-reading-night'))
    """)
    await db.execute("UPDATE events SET capacity=2, waitlist_enabled=true WHERE slug='riverside-track-session'")

    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 1440, "height": 960}, timezone_id="America/New_York")
        page = await ctx.new_page()
        watch(page, "main")

        # ---------------------------------------------------------------
        print("\n== Landing, discovery and the public wall ==")
        await page.goto(BASE, wait_until="networkidle")
        h1 = await page.text_content("h1")
        check("landing headline reads 'events start here'", "events" in h1 and "start here" in h1, h1)
        check("one h1 on the landing route", await page.locator("h1").count() == 1)
        clock = await page.text_content(".clock")
        check("top bar carries a live local clock", bool(re.match(r"^\d{1,2}:\d{2} [AP]M GMT[+-]", clock or "")), clock)
        posters = await page.locator(".poster").count()
        check("landing shows 22 poster tiles at desktop", posters == 22, str(posters))
        await shot(page, "01_landing.png")

        await page.goto(f"{BASE}/discover", wait_until="networkidle")
        await page.wait_for_selector("app-event-card", timeout=8000)
        cards = await page.locator("app-event-card").count()
        showing = await page.text_content(".showing")
        check("discover lists the published and closed events", cards >= 5, str(cards))
        check("page control reads 'Showing <n> of <total>'", re.match(r"^Showing \d+ of \d+$", (showing or "").strip()) is not None, showing)

        # Filters live in the query string, and the address is the state.
        await page.select_option("#cat", "books")
        await page.wait_for_timeout(700)
        check("a filter writes itself into the address", "category=books" in page.url, page.url)
        titles = await page.locator("app-event-card .t-card-title").all_text_contents()
        check("filtering by books narrows the list", titles == ["Winter Reading Night"], str(titles))

        await page.fill("#q", "track")
        await page.wait_for_timeout(900)
        empty = await page.locator(".empty-state h2").text_content()
        check("q narrows rather than widens", (empty or "").strip() == "No Events Found", empty)

        await page.go_back()
        await page.wait_for_timeout(800)
        titles_back = await page.locator("app-event-card .t-card-title").all_text_contents()
        check("the back button restores the previous list", titles_back == ["Winter Reading Night"], str(titles_back))
        await shot(page, "02_discover_filtered.png")

        # ---------------------------------------------------------------
        print("\n== Journey 1: a stranger signs up and registers ==")
        # Reset the seeded event so exactly one seat is free, as the brief seeds it.
        ev = await db.fetchrow("SELECT id FROM events WHERE slug='thursday-night-5k'")
        await db.execute("DELETE FROM registrations WHERE event_id=$1", ev["id"])
        await db.execute("UPDATE events SET capacity=3, state='published', waitlist_enabled=true WHERE id=$1", ev["id"])
        for i, email in enumerate(["guest@example.com", "guest2@example.com"]):
            await db.execute(
                "INSERT INTO registrations (event_id, account_id, status, ticket_code) "
                "VALUES ($1,(SELECT id FROM accounts WHERE email=$2),'confirmed',$3)",
                ev["id"], email, f"TKT-WALK{i}{stamp[-3:]}",
            )

        stranger = f"stranger-{stamp}@example.test"
        await sign_up(page, "Wren Aldridge", stranger, next_path="/thursday-night-5k")
        check("signup with next lands back on the event", "/thursday-night-5k" in page.url, page.url)

        # The page must arrive already wearing its colour.
        ground = await page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()")
        check("event page carries a derived ground, not a default", ground not in ("", "#ffffff"), ground)

        await page.wait_for_selector(".reg-panel", timeout=8000)
        await page.click(".reg-panel button.btn-primary")
        await page.wait_for_timeout(1800)
        answer = await page.text_content(".answer")
        check("the panel shows the ticket code", "TKT-" in (answer or ""), answer)
        code = re.search(r"TKT-[A-Z0-9]{8}", answer or "")
        check("the code has the pinned shape", code is not None, answer)

        row = await db.fetchrow(
            "SELECT r.status, r.ticket_code FROM registrations r JOIN accounts a ON a.id=r.account_id "
            "WHERE a.email=$1 AND r.event_id=$2", stranger, ev["id"])
        check("the database holds one confirmed registration", row and row["status"] == "confirmed", str(row))
        check("the stored code matches the panel", row and code and row["ticket_code"] == code.group(0), str(row))

        await asyncio.sleep(1.0)
        mails = await mail_for(stranger, "You're going to Thursday Night 5K")
        check("a real confirmation reached that inbox", len(mails) >= 1, str(len(mails)))
        if mails:
            async with httpx.AsyncClient() as c:
                full = (await c.get(f"{MAILPIT}/api/v1/message/{mails[0]['ID']}")).json()
            check("the mail goes to that guest alone", len(full["To"]) == 1 and not full.get("Cc") and not full.get("Bcc"))
            check("the body names the event and carries the code",
                  "Thursday Night 5K" in full["Text"] and code.group(0) in full["Text"])
        await shot(page, "03_registered_with_ticket.png")

        # The ticket is presentable without an account.
        anon = await ctx.new_page()
        watch(anon, "ticket")
        await anon.goto(f"{BASE}/t/{code.group(0)}", wait_until="networkidle")
        await anon.wait_for_selector(".ticket-card", timeout=8000)
        shown = await anon.text_content(".ticket-card .code")
        check("the ticket page shows the code to anyone presenting it", (shown or "").strip() == code.group(0), shown)
        scan = await anon.locator("app-scan-code svg").count()
        check("the ticket carries a scan code drawn as vector geometry", scan == 1)
        zones = await anon.locator(".ticket-card .zone").all_text_contents()
        check("the ticket shows the event zone and the visitor zone", any("Europe/Berlin" in z for z in zones)
              and any("your time" in z for z in zones), str(zones))
        await shot(anon, "04_ticket.png")
        await anon.close()

        # ---------------------------------------------------------------
        print("\n== Journey 2: two guests take the last seat at the same instant ==")
        track = await db.fetchrow("SELECT id FROM events WHERE slug='riverside-track-session'")
        await db.execute("DELETE FROM registrations WHERE event_id=$1", track["id"])
        await db.execute("UPDATE events SET capacity=1, waitlist_enabled=true, state='published' WHERE id=$1", track["id"])

        a_email = f"racer-a-{stamp}@example.test"
        b_email = f"racer-b-{stamp}@example.test"
        ctx_a = await browser.new_context(viewport={"width": 1440, "height": 960})
        ctx_b = await browser.new_context(viewport={"width": 1440, "height": 960})
        page_a, page_b = await ctx_a.new_page(), await ctx_b.new_page()
        watch(page_a, "racer-a")
        watch(page_b, "racer-b")
        await sign_up(page_a, "Ada Race", a_email, next_path="/riverside-track-session")
        await sign_up(page_b, "Bram Race", b_email, next_path="/riverside-track-session")
        for pg in (page_a, page_b):
            await pg.wait_for_selector(".reg-panel button.btn-primary", timeout=8000)

        # Both presses land in the same instant.
        await asyncio.gather(
            page_a.click(".reg-panel button.btn-primary"),
            page_b.click(".reg-panel button.btn-primary"),
        )
        await asyncio.sleep(2.5)
        ans_a = await page_a.text_content(".answer")
        ans_b = await page_b.text_content(".answer")
        outcomes = sorted(["seat" if "TKT-" in (x or "") else "waiting" for x in (ans_a, ans_b)])
        check("one sees a ticket, the other a waiting-list place", outcomes == ["seat", "waiting"], f"{ans_a!r} / {ans_b!r}")

        seats = await db.fetchval(
            "SELECT count(*) FROM registrations WHERE event_id=$1 AND status IN ('confirmed','checked_in')", track["id"])
        check("the database holds exactly one seat, never two", seats == 1, str(seats))
        waiting = await db.fetch(
            "SELECT waitlist_position FROM registrations WHERE event_id=$1 AND status='waitlisted' ORDER BY 1", track["id"])
        check("the waiting list is 1..n with no gaps", [w[0] for w in waiting] == [1], str(waiting))

        loser = page_a if "TKT-" not in (ans_a or "") else page_b
        await shot(loser, "05_last_seat_waiting_list.png")

        # ---------------------------------------------------------------
        print("\n== Journey 3: the host approves a pending request ==")
        host = await ctx.new_page()
        watch(host, "host")
        await sign_in(host, "host@example.com", expect_path="/calendars")
        await host.wait_for_selector(".cal", timeout=10000)
        cals = await host.locator(".cal").count()
        check("the host sees the calendars owned", cals >= 1, str(cals))
        await shot(host, "06_host_calendars.png")

        sunrise = await db.fetchrow("SELECT id FROM events WHERE slug='sunrise-long-run'")
        await db.execute("DELETE FROM registrations WHERE event_id=$1", sunrise["id"])
        await db.execute("UPDATE events SET approval_required=true, capacity=20, state='published' WHERE id=$1", sunrise["id"])
        await db.execute(
            "INSERT INTO registrations (event_id, account_id, status) "
            "VALUES ($1,(SELECT id FROM accounts WHERE email='guest3@example.com'),'pending_approval')", sunrise["id"])

        await host.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
        await host.wait_for_selector(".q-row", timeout=8000)
        check("the queue shows the pending request", await host.locator(".q-row").count() == 1)
        await host.click(".q-row button.btn-sm")
        await host.wait_for_timeout(2000)
        status = await db.fetchval(
            "SELECT status FROM registrations r JOIN accounts a ON a.id=r.account_id "
            "WHERE r.event_id=$1 AND a.email='guest3@example.com'", sunrise["id"])
        check("the row flips to confirmed", status == "confirmed", str(status))
        rows = await host.locator("tbody tr:not(.spacer)").count()
        check("the guest list draws the confirmed row", rows >= 1, str(rows))
        pill = await host.locator("tbody app-pill .pill").first.text_content()
        check("state is a word in a pill, never a colour alone", (pill or "").strip() == "Confirmed", pill)
        await asyncio.sleep(0.8)
        check("the approved guest is mailed", len(await mail_for("guest3@example.com", "You're in: Sunrise Long Run")) >= 1)
        await shot(host, "07_host_approves_queue.png")

        # The door: a second check-in records one arrival, not two.
        ticket_code = await db.fetchval(
            "SELECT ticket_code FROM registrations r JOIN accounts a ON a.id=r.account_id "
            "WHERE r.event_id=$1 AND a.email='guest3@example.com'", sunrise["id"])
        await host.fill("#code", ticket_code)
        await host.click("form.door button[type=submit]")
        await host.wait_for_timeout(1500)
        first_answer = await host.text_content(".door-answer")
        check("the door checks a ticket in", "Checked in" in (first_answer or ""), first_answer)
        await host.fill("#code", ticket_code)
        await host.click("form.door button[type=submit]")
        await host.wait_for_timeout(1500)
        second_answer = await host.text_content(".door-answer")
        check("a second check-in answers with the arrival time, not a second arrival",
              "already arrived" in (second_answer or "").lower(), second_answer)
        arrivals = await db.fetchval(
            "SELECT count(*) FROM registrations WHERE event_id=$1 AND status='checked_in'", sunrise["id"])
        check("one arrival is recorded", arrivals == 1, str(arrivals))
        await shot(host, "08_door_check_in.png")

        # ---------------------------------------------------------------
        print("\n== Journey 4: a confirmed guest cancels and the head of the list is seated ==")
        # The racer holding the seat gives it up; the waiting one takes it.
        holder_page = page_a if "TKT-" in (ans_a or "") else page_b
        waiter_email = b_email if "TKT-" in (ans_a or "") else a_email
        await holder_page.goto(f"{BASE}/home", wait_until="networkidle")
        await holder_page.wait_for_selector(".row", timeout=8000)
        await holder_page.click(".row .btn-text")
        await holder_page.wait_for_selector("app-dialog", timeout=5000)
        await holder_page.click("app-dialog .btn-danger")
        await holder_page.wait_for_timeout(2200)

        promoted = await db.fetchrow(
            "SELECT r.status, r.ticket_code, r.waitlist_position FROM registrations r "
            "JOIN accounts a ON a.id=r.account_id WHERE a.email=$1 AND r.event_id=$2", waiter_email, track["id"])
        check("the head of the waiting list is confirmed in the same breath",
              promoted and promoted["status"] == "confirmed", str(promoted))
        check("and is issued a ticket, losing its waiting-list place",
              promoted and promoted["ticket_code"] and promoted["waitlist_position"] is None, str(promoted))
        await asyncio.sleep(1.0)
        check("the promoted guest is mailed",
              len(await mail_for(waiter_email, "A spot opened up for Riverside Track Session")) >= 1)
        cancelled_mail = await mail_for(
            a_email if waiter_email == b_email else b_email, "A spot opened up for Riverside Track Session")
        check("a guest cancelling their own registration sends no mail to themselves", len(cancelled_mail) == 0)

        row_state = await holder_page.locator(".row app-pill .pill").first.text_content()
        check("the row moves to its new status in place rather than vanishing",
              (row_state or "").strip() == "Cancelled", row_state)
        await shot(holder_page, "09_guest_cancels_home.png")

        # ---------------------------------------------------------------
        print("\n== Journey 5: a host calls an event off with a typed reason ==")
        host2 = await browser.new_context(viewport={"width": 1440, "height": 960})
        page_h2 = await host2.new_page()
        watch(page_h2, "host2")
        await sign_in(page_h2, "host2@example.com", expect_path="/calendars")

        wr = await db.fetchrow("SELECT id FROM events WHERE slug='winter-reading-night'")
        await db.execute("DELETE FROM registrations WHERE event_id=$1", wr["id"])
        await db.execute(
            "UPDATE events SET state='published', cancelled_at=NULL, cancel_reason=NULL WHERE id=$1", wr["id"])
        watcher = f"reader-{stamp}@example.test"
        watcher_ctx = await browser.new_context()
        watcher_page = await watcher_ctx.new_page()
        await sign_up(watcher_page, "Otto Reader", watcher, next_path="/winter-reading-night")
        await watcher_page.wait_for_selector(".reg-panel button.btn-primary", timeout=8000)
        await watcher_page.click(".reg-panel button.btn-primary")
        await watcher_page.wait_for_timeout(1600)

        await page_h2.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
        await page_h2.wait_for_selector(".danger-zone", timeout=8000)
        await page_h2.click(".danger-zone button")
        await page_h2.wait_for_selector("app-dialog", timeout=5000)
        disabled = await page_h2.locator("app-dialog .btn-danger").is_disabled()
        check("the cancel dialog needs the reason typed before its action is available", disabled)
        reason = 'The reading room lost its heating, and the "spare" room seats four.'
        await page_h2.fill("app-dialog #reason", reason)
        await page_h2.wait_for_timeout(300)
        await page_h2.click("app-dialog .btn-danger")
        await page_h2.wait_for_timeout(2500)

        stored = await db.fetchrow("SELECT state, cancel_reason FROM events WHERE id=$1", wr["id"])
        check("the event is cancelled with the host's own words",
              stored["state"] == "cancelled" and stored["cancel_reason"] == reason, str(stored))
        await asyncio.sleep(1.2)
        cancel_mails = await mail_for(watcher, "Winter Reading Night has been cancelled")
        check("every guest holding a place is mailed", len(cancel_mails) >= 1, str(len(cancel_mails)))
        if cancel_mails:
            async with httpx.AsyncClient() as c:
                full = (await c.get(f"{MAILPIT}/api/v1/message/{cancel_mails[0]['ID']}")).json()
            check("the reason travels word for word", reason in full["Text"])

        # That page keeps its address and shows the notice, not the panel.
        await watcher_page.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        await watcher_page.wait_for_timeout(1200)
        check("the cancelled event keeps its own address", watcher_page.url.endswith("/winter-reading-night"))
        check("it shows the notice, not the panel",
              await watcher_page.locator(".notice-cancelled").count() == 1
              and await watcher_page.locator(".reg-panel").count() == 0)
        notice_text = await watcher_page.text_content(".notice-cancelled")
        check("the notice carries the host's reason", reason in (notice_text or ""), notice_text)
        await shot(watcher_page, "10_event_cancelled_notice.png")
        await shot(page_h2, "11_host_overview_cancelled.png")

        # ---------------------------------------------------------------
        print("\n== Refusals, closed registration and authorization ==")
        closed = await ctx.new_page()
        watch(closed, "closed")
        await closed.goto(f"{BASE}/riverside-winter-time-trial", wait_until="networkidle")
        await closed.wait_for_selector(".reg-panel", timeout=8000)
        heading = await closed.text_content(".reg-panel h2")
        body = await closed.text_content(".reg-panel .panel-body")
        check("the closed panel reads the pinned heading", (heading or "").strip() == "Registration Is Closed", heading)
        check("and the pinned body",
              (body or "").strip() == "The host has stopped taking registrations for this event.", body)
        check("a closed event offers no register control", await closed.locator(".reg-panel .btn-primary").count() == 0)
        await shot(closed, "12_registration_closed.png")

        # A guest at /calendars and at a manage route meets the not-found page.
        guest_page = await ctx_a.new_page()
        watch(guest_page, "guest-authz")
        await guest_page.goto(f"{BASE}/calendars", wait_until="networkidle")
        await guest_page.wait_for_timeout(900)
        txt = await guest_page.text_content("body")
        check("a guest at /calendars gets the not-found page", "Page Not Found" in txt, txt[:120])
        await guest_page.goto(f"{BASE}/event/thursday-night-5k/manage/guests", wait_until="networkidle")
        await guest_page.wait_for_timeout(1200)
        txt = await guest_page.text_content("body")
        check("a guest at a manage route gets the not-found page", "Page Not Found" in txt, txt[:120])
        await shot(guest_page, "13_guest_refused_not_found.png")

        # A draft event is not found to anyone but its host.
        await guest_page.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
        await guest_page.wait_for_timeout(1000)
        txt = await guest_page.text_content("body")
        check("a draft event answers not found to a guest", "Page Not Found" in txt, txt[:120])

        # An unauthenticated visitor at a protected route goes to /login?next=
        stranger_ctx = await browser.new_context()
        sp = await stranger_ctx.new_page()
        watch(sp, "redirect")
        await sp.goto(f"{BASE}/home", wait_until="networkidle")
        await sp.wait_for_timeout(700)
        check("a signed-out visitor at /home goes to /login?next=/home", "next=%2Fhome" in sp.url or "next=/home" in sp.url, sp.url)

        # The settings screen refuses a handle already in the namespace.
        await guest_page.goto(f"{BASE}/settings/profile", wait_until="networkidle")
        await guest_page.wait_for_selector("#handle", timeout=8000)
        await guest_page.fill("#handle", "priya-raman")
        await guest_page.wait_for_timeout(200)
        await guest_page.click("button[type=submit]")
        await guest_page.wait_for_timeout(1400)
        refusal = await guest_page.text_content("#handle-refusal")
        check("a taken handle is refused with the pinned sentence",
              (refusal or "").strip() == "That handle is already taken.", refusal)
        await shot(guest_page, "14_handle_refused.png")
        for spent in (ctx_b, host2, watcher_ctx, stranger_ctx):
            await spent.close()

        # Raising capacity seats the waiting list in the same request.
        print("\n== Raising capacity moves the waiting list ==")
        await db.execute("DELETE FROM registrations WHERE event_id=$1", track["id"])
        await db.execute("UPDATE events SET capacity=1, waitlist_enabled=true, state='published' WHERE id=$1", track["id"])
        async with httpx.AsyncClient(base_url=BASE) as c:
            tokens = []
            for i in range(3):
                r = await c.post("/api/auth/signup", json={
                    "email": f"cap-{stamp}-{i}@example.test", "password": PW, "name": f"Capper {i}"})
                tokens.append((r.json()["access_token"], f"cap-{stamp}-{i}@example.test"))
            for t, _ in tokens:
                await c.post("/api/registrations", json={"event_slug": "riverside-track-session"},
                             headers={"Authorization": f"Bearer {t}"})

        await host.goto(f"{BASE}/event/riverside-track-session/manage/registration", wait_until="networkidle")
        await host.wait_for_selector("#capacity", timeout=8000)
        await host.fill("#capacity", "3")
        await host.click(".row .btn-sm")
        await host.wait_for_timeout(2200)
        announce = await host.text_content(".announce")
        check("the raise announces how many were moved to a seat", "moved to a seat" in (announce or ""), announce)
        seated = await db.fetchval(
            "SELECT count(*) FROM registrations WHERE event_id=$1 AND status='confirmed'", track["id"])
        check("the waiting list was seated in the same request", seated == 3, str(seated))
        await asyncio.sleep(1.0)
        check("each promoted guest is mailed",
              len(await mail_for(tokens[1][1], "A spot opened up for Riverside Track Session")) >= 1)
        await shot(host, "15_capacity_raise.png")

        # Lowering below the confirmed count is refused with the pinned sentence.
        await host.fill("#capacity", "1")
        await host.click(".row .btn-sm")
        await host.wait_for_timeout(1600)
        cap_caption = await host.text_content("#cap-caption")
        check("lowering below the confirmed count is refused with the pinned sentence",
              (cap_caption or "").strip() == "You already have 3 guests confirmed.", cap_caption)
        still = await db.fetchval("SELECT capacity FROM events WHERE id=$1", track["id"])
        check("a rejected request writes nothing", still == 3, str(still))

        # The CSV export.
        print("\n== The export and the composer ==")
        async with host.expect_download() as dl:
            await host.goto(f"{BASE}/event/riverside-track-session/manage/guests", wait_until="networkidle")
            await host.wait_for_selector(".tools .btn", timeout=8000)
            await host.click(".tools .btn")
        download = await dl.value
        path = f"/app/.downloads/{download.suggested_filename}"
        await download.save_as(path)
        with open(path) as f:
            csv_lines = f.read().strip().split("\n")
        check("the CSV is named after the event", download.suggested_filename == "riverside-track-session.csv",
              download.suggested_filename)
        check("the CSV carries the pinned header line",
              csv_lines[0] == "email,display_name,status,waitlist_position,ticket_code", csv_lines[0])
        check("the CSV carries one line per registration", len(csv_lines) == 4, str(len(csv_lines)))

        # The composer.
        await host.goto(f"{BASE}/create", wait_until="networkidle")
        await host.wait_for_selector("#title", timeout=8000)
        placeholder = await host.get_attribute("#title", "placeholder")
        check("the title placeholder reads 'Event Name'", placeholder == "Event Name", placeholder)
        submit_label = await host.text_content("button.submit")
        check("the submit button reads 'Create Event'", (submit_label or "").strip() == "Create Event", submit_label)
        cap_label = await host.locator(".setting-row .label").first.text_content()
        check("the capacity row reads 'Capacity'", (cap_label or "").strip() == "Capacity", cap_label)

        new_title = f"Bridge Loop {stamp}"
        await host.fill("#title", new_title)
        await host.select_option("#tz", "Europe/Berlin")
        await host.fill("#starts", "2027-04-08T18:30")
        await host.fill("#ends", "2027-04-08T20:00")
        await host.fill("#city", "Berlin")
        await host.fill("#loc", "Under the Oberbaum arches")
        await host.fill("#desc", "A loop of the bridges at dusk.")
        await host.fill(".num", "6")
        await shot(host, "16_composer.png")
        await host.click("button.submit")
        await host.wait_for_timeout(2600)
        made = await db.fetchrow("SELECT slug, state, starts_at, time_zone FROM events WHERE title=$1", new_title)
        check("the composer publishes a complete event", made and made["state"] == "published", str(made))
        check("the wall time was turned into the right instant in UTC",
              made and made["starts_at"].strftime("%H:%M") == "16:30", str(made and made["starts_at"]))

        await ctx_a.close()

        # A phone-width look at the event page foot bar.
        print("\n== The phone ==")
        phone_ctx = await browser.new_context(viewport={"width": 390, "height": 780}, is_mobile=True,
                                              has_touch=True, timezone_id="America/New_York")
        phone = await phone_ctx.new_page()
        watch(phone, "phone")
        await phone.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        await phone.wait_for_selector(".reg-panel", timeout=8000)
        footbar = phone.locator(".footbar")
        check("the registration panel becomes a foot bar on a phone", await footbar.count() == 1)
        if await footbar.count():
            box = await footbar.bounding_box()
            check("the foot bar is 72px tall", box and abs(box["height"] - 72) < 2, str(box))
        await shot(phone, "17_phone_event_footbar.png")

        await phone.goto(f"{BASE}/home", wait_until="networkidle")
        await phone.wait_for_timeout(1200)
        await shot(phone, "18_phone_home.png")
        await phone_ctx.close()

        # The get-the-app and 404 pages, on a fresh page.
        await page.close()
        page = await ctx.new_page()
        watch(page, "public-tail")
        await page.goto(f"{BASE}/app", wait_until="networkidle")
        await page.wait_for_selector("app-scan-code", timeout=8000)
        check("the get-the-app page reads 'Get the App'", (await page.text_content("h1")).strip() == "Get the App")
        await page.goto(f"{BASE}/this-does-not-exist-at-all", wait_until="networkidle")
        await page.wait_for_timeout(1200)
        body_text = await page.text_content("body")
        check("an unknown address gets the pinned not-found copy",
              "404" in body_text and "Page Not Found" in body_text
              and "Looks like you discovered a page that doesn't exist" in body_text)
        await shot(page, "19_not_found.png")

        # The category route.
        await page.goto(f"{BASE}/running", wait_until="networkidle")
        await page.wait_for_timeout(1400)
        cat_h1 = await page.text_content("h1")
        check("a category name resolves to the category route", (cat_h1 or "").strip() == "Running", cat_h1)
        sub = await page.text_content(".subscribe button")
        check("the subscribe button reads 'Subscribe'", (sub or "").strip() == "Subscribe", sub)
        await shot(page, "20_category.png")

        await browser.close()

    await db.close()

    print("\n================ console ================")
    if console_problems:
        for c in console_problems[:25]:
            print(" ", c)
    else:
        print("  clean")

    print(f"\n{len(failures)} failed")
    for f in failures:
        print(" -", f)
    sys.exit(1 if failures or console_problems else 0)


asyncio.run(main())

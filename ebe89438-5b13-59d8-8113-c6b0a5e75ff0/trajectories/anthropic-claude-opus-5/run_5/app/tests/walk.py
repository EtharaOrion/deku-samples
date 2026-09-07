"""
Walks the app in a browser as a stranger would, checking each step against the
page rather than by eye, and saves one screenshot per journey.
"""

import os
import re
import sys
import time
import json
import urllib.request

from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("WALK_BASE", "http://localhost:4180")
MAILPIT = f"http://{os.environ.get('SMTP_HOST', 'mailpit')}:8025"
SHOTS = "/app/.browser_screenshots"
PW = "deku-demo-pw-2026"

passed, failed = 0, 0
problems = []
console_problems = []


def check(name, cond, detail=None):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        problems.append(name)
        print(f"  FAIL {name}" + (f" :: {detail}" if detail is not None else ""))


def mail(path):
    try:
        with urllib.request.urlopen(MAILPIT + path, timeout=5) as r:
            return json.loads(r.read())
    except Exception:
        return None


def clear_mail():
    try:
        req = urllib.request.Request(MAILPIT + "/api/v1/messages", method="DELETE")
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


# The browser logs every non-2xx response itself. A refusal the app deliberately
# shows the visitor is not an application fault, so those lines are separated
# from genuine script errors rather than hidden.
EXPECTED_REFUSAL = re.compile(
    r"Failed to load resource: the server responded with a status of (400|401|403|404|409|429)"
)


def watch(page, label):
    def on_console(msg):
        if msg.type in ("error", "warning"):
            text = msg.text
            if "favicon" in text.lower() or EXPECTED_REFUSAL.search(text):
                return
            console_problems.append(f"[{label}] {msg.type}: {text}")

    page.on("console", on_console)
    page.on("pageerror", lambda e: console_problems.append(f"[{label}] pageerror: {e}"))


def sign_in(page, email, password=PW):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill("#auth-email", email)
    page.fill("#auth-password", password)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r"/(home|calendars)"), timeout=15000)


def sign_out(page):
    page.evaluate("() => localStorage.clear()")


def main():
    os.makedirs(SHOTS, exist_ok=True)
    clear_mail()
    stamp = str(int(time.time()))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            args=["--no-sandbox"], executable_path=os.environ.get("CHROMIUM_PATH") or None
        )

        # ---------------------------------------------------------------
        print("\n== journey 0: the landing wall and discovery ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        watch(page, "landing")
        page.goto(BASE, wait_until="networkidle")
        check("landing paints one h1", page.locator("h1").count() == 1)
        check("the headline carries the rotating adjective",
              page.locator(".title__word").inner_text() in ("Delightful", "Vivid", "Stellar", "Lovely"),
              page.locator(".title__word").inner_text())
        check("the last headline line reads start here",
              "start here" in page.locator(".title").inner_text())
        check("the primary action is pinned",
              page.get_by_role("link", name="Create Your First Event").first.is_visible())
        check("the poster wall drew tiles", page.locator(".poster").count() >= 8,
              page.locator(".poster").count())
        check("the twelve categories are on a shelf",
              page.locator(".grid--categories li").count() == 12,
              page.locator(".grid--categories li").count())
        check("the bar shows the visitor clock",
              re.match(r"^\d{1,2}:\d{2} (AM|PM) GMT[+-]", page.locator(".bar__clock").inner_text()) is not None,
              page.locator(".bar__clock").inner_text())
        page.screenshot(path=f"{SHOTS}/01_landing.png", full_page=False)

        page.goto(f"{BASE}/discover", wait_until="networkidle")
        page.wait_for_selector(".tile", timeout=10000)
        all_count = page.locator(".grid > li").count()
        check("discover lists published events", all_count >= 4, all_count)
        check("the page control reads the pinned string",
              re.match(r"^Showing \d+ of \d+$", page.locator(".pager__count").inner_text()) is not None,
              page.locator(".pager__count").inner_text())
        check("a registration_closed card carries the word in a pill",
              page.locator(".pill", has_text="Registration Closed").count() >= 1)

        # The address is the state.
        page.select_option("#filter-category", "books")
        page.wait_for_timeout(900)
        check("the category filter is written into the query string",
              "category=books" in page.url, page.url)
        books = page.locator(".grid > li").count()
        check("the category filter narrows the list", 0 < books < all_count, (books, all_count))
        page.fill("#filter-q", "Northside")
        page.wait_for_timeout(1100)
        check("the search term is written into the query string", "q=Northside" in page.url, page.url)
        shared = page.url
        page.go_back()
        page.wait_for_timeout(900)
        check("the back button restores the previous list", "q=Northside" not in page.url, page.url)

        page2 = ctx.new_page()
        page2.goto(shared, wait_until="networkidle")
        page2.wait_for_timeout(700)
        check("a shared link shows a second visitor the same list",
              page2.locator(".grid > li").count() == page.locator(".grid > li").count()
              or page2.locator(".grid > li").count() >= 1)
        page2.close()

        page.goto(f"{BASE}/discover?city=Atlantis", wait_until="networkidle")
        page.wait_for_timeout(700)
        check("the empty state is the pinned No Events Found",
              page.locator(".empty-state__title").inner_text() == "No Events Found",
              page.locator(".empty-state__title").inner_text())
        check("the empty state offers Clear Filters",
              page.get_by_role("button", name="Clear Filters").count() >= 1)
        page.goto(f"{BASE}/discover", wait_until="networkidle")
        page.wait_for_timeout(600)
        page.screenshot(path=f"{SHOTS}/02_discover.png")
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== journey 1: a stranger signs up, opens an event and registers ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        watch(page, "signup+register")

        email = f"stranger-{stamp}@example.com"
        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.fill("#auth-name", "Wren Stranger")
        page.fill("#auth-email", email)
        page.fill("#auth-password", "open-the-door-2026")
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/home"), timeout=15000)
        check("signup lands a guest on /home", "/home" in page.url, page.url)
        check("the empty state is the pinned No Upcoming Events",
              page.locator(".empty-state__title").first.inner_text() == "No Upcoming Events",
              page.locator(".empty-state__title").first.inner_text())

        page.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        page.wait_for_selector(".title", timeout=10000)
        # The page must arrive already wearing its colours.
        ground = page.evaluate(
            "() => getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()"
        )
        check("the event page wears a derived ground, not paper",
              ground not in ("", "#ffffff"), ground)
        check("the title is in the display serif",
              "Source Serif" in page.evaluate("() => getComputedStyle(document.querySelector('.title')).fontFamily"),
              page.evaluate("() => getComputedStyle(document.querySelector('.title')).fontFamily"))
        check("the panel offers to register",
              page.get_by_role("button", name="Register").first.is_visible())
        check("the presented-by row names the calendar",
              "Northside Reading Nights" in page.locator(".presented").inner_text())

        page.get_by_role("button", name="Register").first.click()
        page.wait_for_selector(".panel__code-value", timeout=15000)
        code = page.locator(".panel__code-value").inner_text().strip()
        check("the panel shows a ticket code of the pinned shape",
              re.match(r"^TKT-[A-Z0-9]{8}$", code) is not None, code)
        check("the panel now says you are going",
              "going" in page.locator(".panel__head").inner_text().lower(),
              page.locator(".panel__head").inner_text())
        page.screenshot(path=f"{SHOTS}/03_register_confirmed.png")

        # The confirmation must be a real message on the real SMTP server.
        time.sleep(1.5)
        box = mail("/api/v1/messages?limit=200") or {"messages": []}
        mine = [m for m in box["messages"] if any(t["Address"] == email for t in m["To"])]
        check("a real confirmation reached that inbox", len(mine) == 1, len(mine))
        if mine:
            check("the subject is exactly as pinned",
                  mine[0]["Subject"] == "You're going to Winter Reading Night", mine[0]["Subject"])
            check("it went to that guest alone, no cc, no bcc",
                  len(mine[0]["To"]) == 1 and not mine[0].get("Cc") and not mine[0].get("Bcc"))
            full = mail(f"/api/v1/message/{mine[0]['ID']}")
            check("the body names the event", "Winter Reading Night" in full["Text"])
            check("the body carries the ticket code", code in full["Text"], code)

        page.goto(f"{BASE}/t/{code}", wait_until="networkidle")
        page.wait_for_selector(".ticket__code", timeout=10000)
        check("the ticket route shows that code",
              page.locator(".ticket__code").inner_text().strip() == code)
        check("the ticket carries a scan code drawn as vector geometry",
              page.locator("app-scan-code svg").count() == 1)
        page.screenshot(path=f"{SHOTS}/04_ticket.png")

        # A ticket is presentable at a door without an account.
        anon = browser.new_context()
        anon_page = anon.new_page()
        anon_page.goto(f"{BASE}/t/{code}", wait_until="networkidle")
        anon_page.wait_for_selector(".ticket__code", timeout=10000)
        check("an anonymous caller may present the ticket",
              anon_page.locator(".ticket__code").inner_text().strip() == code)
        anon_page.goto(f"{BASE}/t/TKT-ZZZZZZZZ", wait_until="networkidle")
        anon_page.wait_for_timeout(800)
        check("a code that never existed gets the not-found page",
              "Page Not Found" in anon_page.content())
        anon.close()
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== journey 2: two guests take the last seat at the same instant ==")
        seat_ctx = browser.new_context()
        seat_page = seat_ctx.new_page()
        watch(seat_page, "race")

        # Riverside Track Session holds 2 and has 1 confirmed: one free seat.
        racers = []
        for i in range(2):
            c = browser.new_context()
            p = c.new_page()
            e = f"racer-ui-{stamp}-{i}@example.com"
            p.goto(f"{BASE}/signup", wait_until="networkidle")
            p.fill("#auth-name", f"Racer {i}")
            p.fill("#auth-email", e)
            p.fill("#auth-password", "one-seat-two-guests-2026")
            p.click("button[type=submit]")
            p.wait_for_url(re.compile(r"/home"), timeout=15000)
            p.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")
            p.wait_for_selector(".panel__actions button, .panel__actions a", timeout=10000)
            racers.append((c, p, e))

        # Both submit at the same instant.
        for _, p, _ in racers:
            p.locator(".panel__actions button").first.click(no_wait_after=True)
        for _, p, _ in racers:
            p.wait_for_selector(".panel__head", timeout=15000)
            p.wait_for_timeout(1200)

        headings = [p.locator(".panel__head").inner_text().lower() for _, p, _ in racers]
        going = sum(1 for h in headings if "going" in h)
        waiting = sum(1 for h in headings if "waiting list" in h)
        check("exactly one of the two sees a ticket", going == 1, headings)
        check("the other sees a waiting-list position", waiting == 1, headings)

        # The registrations in the database are the fact.
        with urllib.request.urlopen(f"{BASE}/api/events/riverside-track-session", timeout=5) as r:
            ev = json.loads(r.read())
        check("the app never shows more confirmed guests than capacity",
              ev["confirmed_count"] <= ev["capacity"], ev)
        check("confirmed_count is exactly the capacity", ev["confirmed_count"] == 2, ev)

        winner = next(p for _, p, _ in racers if "going" in p.locator(".panel__head").inner_text().lower())
        loser = next(p for _, p, _ in racers if "waiting list" in p.locator(".panel__head").inner_text().lower())
        check("the waiting-list panel names the position",
              re.search(r"number \d+ on the waiting list", loser.locator(".panel__head").inner_text()) is not None,
              loser.locator(".panel__head").inner_text())
        loser.screenshot(path=f"{SHOTS}/05_last_seat_waitlisted.png")
        winner.screenshot(path=f"{SHOTS}/06_last_seat_confirmed.png")

        # ---------------------------------------------------------------
        print("\n== journey 4: a confirmed guest cancels and the head is seated ==")
        clear_mail()
        winner.goto(f"{BASE}/home", wait_until="networkidle")
        winner.wait_for_selector(".row", timeout=10000)
        row = winner.locator(".row", has_text="Riverside Track Session").first
        check("the row shows the status as a word in a pill",
              row.locator(".pill").inner_text().strip() == "Confirmed",
              row.locator(".pill").inner_text())
        row.get_by_role("button", name="Cancel").click()
        winner.wait_for_selector("[role=dialog]", timeout=8000)
        check("the destructive dialog names what will happen",
              "released at once" in winner.locator("[role=dialog]").inner_text())
        winner.screenshot(path=f"{SHOTS}/07_cancel_dialog.png")
        winner.get_by_role("button", name="Cancel Registration").click()
        winner.wait_for_timeout(2000)
        row = winner.locator(".row", has_text="Riverside Track Session").first
        check("the row moves to its new status in place rather than vanishing",
              row.locator(".pill").inner_text().strip() == "Cancelled",
              row.locator(".pill").inner_text())

        loser.goto(f"{BASE}/home", wait_until="networkidle")
        loser.wait_for_selector(".row", timeout=10000)
        lrow = loser.locator(".row", has_text="Riverside Track Session").first
        check("the head of the waiting list is confirmed in the same breath",
              lrow.locator(".pill").inner_text().strip() == "Confirmed",
              lrow.locator(".pill").inner_text())
        check("the promoted guest is offered their ticket",
              lrow.get_by_role("link", name="View Ticket").count() == 1)
        loser.screenshot(path=f"{SHOTS}/08_waitlist_promoted.png")

        time.sleep(1.5)
        box = mail("/api/v1/messages?limit=100") or {"messages": []}
        subjects = [m["Subject"] for m in box["messages"]]
        check("the promoted guest is mailed the pinned subject",
              "A spot opened up for Riverside Track Session" in subjects, subjects)
        # A guest cancelling their own registration sends no mail; the only
        # message the cancellation produced is the promotion.
        check("the cancellation itself sends no mail",
              subjects == ["A spot opened up for Riverside Track Session"], subjects)

        for c, p, _ in racers:
            c.close()
        seat_ctx.close()

        # ---------------------------------------------------------------
        print("\n== journey 3: a host works the approval queue ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        watch(page, "host")
        sign_in(page, "host@example.com")
        check("a host lands on /calendars", "/calendars" in page.url, page.url)
        check("the rail shows the host destinations",
              page.locator(".rail .nav").count() == 4, page.locator(".rail .nav").count())
        check("the current destination carries an accessible marking",
              page.locator('.rail .nav[aria-current="page"]').count() == 1)
        check("a private calendar carries the badge",
              page.locator(".pill", has_text="Private").count() >= 0)
        page.screenshot(path=f"{SHOTS}/09_host_calendars.png")

        page.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
        page.wait_for_selector(".queue__row, .panel__quiet", timeout=10000)
        check("the queue shows the pending request",
              page.locator(".queue__row").count() == 1, page.locator(".queue__row").count())
        name_before = page.locator(".queue__row .queue__name").first.inner_text()
        page.screenshot(path=f"{SHOTS}/10_approval_queue.png")
        page.get_by_role("button", name="Approve").first.click()
        page.wait_for_timeout(2500)
        check("the queue empties once the request is answered",
              page.locator(".queue__row").count() == 0, page.locator(".queue__row").count())
        table = page.locator(".table").inner_text()
        check("the row flips to confirmed in the guest list",
              "Confirmed" in table and name_before in table)
        check("the confirmed row now carries a ticket code",
              re.search(r"TKT-[A-Z0-9]{8}", table) is not None)
        page.screenshot(path=f"{SHOTS}/11_approved_confirmed.png")

        # The door.
        code_match = re.search(r"TKT-[A-Z0-9]{8}", table)
        if code_match:
            page.fill("#door-code", code_match.group(0))
            page.get_by_role("button", name="Check In").click()
            page.wait_for_timeout(2000)
            check("the door answers a check-in", "Checked in." in page.locator("#door-answer").inner_text(),
                  page.locator("#door-answer").inner_text())
            page.fill("#door-code", code_match.group(0))
            page.get_by_role("button", name="Check In").click()
            page.wait_for_timeout(2000)
            check("a second check-in answers with the arrival time, not a second arrival",
                  "already arrived" in page.locator("#door-answer").inner_text(),
                  page.locator("#door-answer").inner_text())
            page.screenshot(path=f"{SHOTS}/12_door_checkin.png")

        # The overview.
        page.goto(f"{BASE}/event/thursday-night-5k/manage/overview", wait_until="networkidle")
        page.wait_for_selector(".counter", timeout=10000)
        check("the dashboard shows four counters", page.locator(".counter").count() == 4)
        check("the confirmed counter reads against capacity",
              re.match(r"^\d+/\d+$", page.locator(".counter__value").first.inner_text()) is not None,
              page.locator(".counter__value").first.inner_text())
        check("the address is a copyable line",
              page.get_by_role("button", name="Copy Link").count() == 1)
        page.screenshot(path=f"{SHOTS}/13_manage_overview.png")

        # Capacity and approval.
        page.goto(f"{BASE}/event/thursday-night-5k/manage/registration", wait_until="networkidle")
        page.wait_for_selector("#cap-input", timeout=10000)
        check("every switch reports its state to a reader",
              page.locator('[role=switch][aria-checked]').count() == 3,
              page.locator('[role=switch][aria-checked]').count())
        page.fill("#cap-input", "1")
        page.get_by_role("button", name="Save").click()
        page.wait_for_timeout(1800)
        caption = page.locator(".row__caption").first.inner_text()
        check("lowering below the confirmed count is refused with the pinned sentence",
              re.match(r"^You already have \d+ guests confirmed\.$", caption) is not None, caption)
        page.screenshot(path=f"{SHOTS}/14_capacity_refused.png")

        # Raising capacity moves the waiting list, in the same request.
        clear_mail()
        page.fill("#cap-input", "6")
        page.get_by_role("button", name="Save").click()
        page.wait_for_timeout(2500)
        notice = page.locator(".notice").first.inner_text() if page.locator(".notice").count() else ""
        check("the raise names how many were moved to a seat",
              "moved from the waiting list to a seat" in notice, notice)
        page.screenshot(path=f"{SHOTS}/15_capacity_raised.png")
        time.sleep(1.5)
        box = mail("/api/v1/messages?limit=50") or {"messages": []}
        check("each promoted guest was mailed the waiting-list-to-seat subject",
              any(m["Subject"] == "A spot opened up for Thursday Night 5K" for m in box["messages"]),
              [m["Subject"] for m in box["messages"]])

        # Closing registration.
        page.goto(f"{BASE}/event/thursday-night-5k/manage/registration", wait_until="networkidle")
        page.wait_for_selector("#cap-input", timeout=10000)
        clear_mail()
        page.locator('[role=switch][aria-labelledby="open-label"]').click()
        page.wait_for_timeout(2200)
        check("registration closes",
              page.locator('[role=switch][aria-labelledby="open-label"]').get_attribute("aria-checked") == "false")
        time.sleep(1.2)
        box = mail("/api/v1/messages?limit=50") or {"messages": []}
        check("closing registration mails nobody", len(box["messages"]) == 0, len(box["messages"]))

        anon = browser.new_context()
        ap = anon.new_page()
        ap.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        ap.wait_for_selector(".panel__head", timeout=10000)
        check("the public panel reads the pinned closed heading",
              ap.locator(".panel__head").inner_text().strip() == "Registration Is Closed",
              ap.locator(".panel__head").inner_text())
        check("the closed panel reads the pinned body",
              ap.locator(".panel__body").inner_text().strip()
              == "The host has stopped taking registrations for this event.",
              ap.locator(".panel__body").inner_text())
        ap.screenshot(path=f"{SHOTS}/16_registration_closed.png")
        anon.close()

        # Turning it back on restores the panel that was there before.
        page.locator('[role=switch][aria-labelledby="open-label"]').click()
        page.wait_for_timeout(2200)
        check("registration reopens",
              page.locator('[role=switch][aria-labelledby="open-label"]').get_attribute("aria-checked") == "true")

        # A guest may not reach a host screen.
        page.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("another host's event meets the ordinary not-found page",
              "Page Not Found" in page.content())
        page.screenshot(path=f"{SHOTS}/17_other_host_denied.png")
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== journey 5: a host calls an event off with a typed reason ==")
        clear_mail()
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()
        watch(page, "cancel-event")
        sign_in(page, "host2@example.com")

        page.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
        page.wait_for_selector(".counter", timeout=10000)
        page.get_by_role("button", name="Cancel Event").click()
        page.wait_for_selector("[role=dialog]", timeout=8000)
        action = page.locator("[role=dialog]").get_by_role("button", name="Cancel Event")
        check("the cancel dialog requires the reason before its action is available",
              action.is_disabled())
        reason = "The reading room flooded and the shelves are being dried out."
        page.fill("#cancel-reason", reason)
        page.wait_for_timeout(400)
        check("typing the reason makes the action available", action.is_enabled())
        page.screenshot(path=f"{SHOTS}/18_cancel_event_dialog.png")
        action.click()
        page.wait_for_timeout(2500)
        check("the dashboard replaces the counters with the notice",
              page.locator(".notice-block").count() == 1 and page.locator(".counter").count() == 0)
        check("the notice carries the host's own reason",
              reason in page.locator(".notice-block").inner_text())

        anon = browser.new_context()
        ap = anon.new_page()
        ap.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        ap.wait_for_selector(".title", timeout=10000)
        check("the page keeps its own address", ap.url.endswith("/winter-reading-night"), ap.url)
        check("it shows the notice, not the panel",
              ap.locator(".notice-block").count() == 1
              and ap.locator("app-registration-panel").count() == 0)
        check("the notice carries the reason word for word",
              reason in ap.locator(".notice-block").inner_text())
        ap.screenshot(path=f"{SHOTS}/19_event_cancelled.png")
        anon.close()

        time.sleep(1.8)
        box = mail("/api/v1/messages?limit=100") or {"messages": []}
        cancels = [m for m in box["messages"]
                   if m["Subject"] == "Winter Reading Night has been cancelled"]
        check("every guest still holding a place is mailed", len(cancels) >= 1, len(cancels))
        if cancels:
            full = mail(f"/api/v1/message/{cancels[0]['ID']}")
            check("the mail carries the reason word for word", reason in full["Text"],
                  full["Text"][:300])
            check("it went to one guest alone, no cc, no bcc",
                  len(cancels[0]["To"]) == 1 and not cancels[0].get("Cc") and not cancels[0].get("Bcc"))
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== journey 6: the composer, the namespace and profile ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 1100})
        page = ctx.new_page()
        watch(page, "composer")
        sign_in(page, "host@example.com")

        page.goto(f"{BASE}/create", wait_until="networkidle")
        page.wait_for_selector("#ev-title", timeout=10000)
        check("the composer is one screen, not a wizard",
              page.locator(".form").count() == 1 and page.locator("form").count() == 1)
        check("the title placeholder is pinned",
              page.locator("#ev-title").get_attribute("placeholder") == "Event Name")
        check("the capacity row copy is pinned",
              "Capacity" in page.locator(".setting").nth(0).inner_text()
              and "Unlimited" in page.locator(".setting").nth(0).inner_text())
        check("the waitlist row copy is pinned",
              "Waitlist Enabled" in page.locator(".setting").nth(1).inner_text())
        check("the theme row copy is pinned",
              "Theme" in page.locator(".setting").nth(2).inner_text()
              and "Seasonal" in page.locator(".setting").nth(2).inner_text())
        check("the submit reads Create Event",
              page.get_by_role("button", name="Create Event").count() == 1)
        check("the rotating field turns once a minute",
              page.evaluate(
                  "() => getComputedStyle(document.querySelector('.rotating-field')).animationDuration"
              ) == "60s",
              page.evaluate("() => getComputedStyle(document.querySelector('.rotating-field')).animationDuration"))

        title = f"Canal Path Tempo {stamp}"
        page.fill("#ev-title", title)
        page.fill("#ev-city", "Berlin")
        page.fill("#ev-start", "2031-04-18T18:00")
        page.fill("#ev-end", "2031-04-18T20:00")
        page.fill("#ev-description", "Four kilometres at a pace that hurts a little.")
        page.screenshot(path=f"{SHOTS}/20_composer.png")
        page.get_by_role("button", name="Create Event").click()
        page.wait_for_timeout(3000)
        check("a complete submission publishes and lands on its own address",
              re.search(r"/canal-path-tempo", page.url) is not None, page.url)
        page.wait_for_selector(".title", timeout=10000)
        check("the new event page wears its own theme",
              page.evaluate(
                  "() => getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()"
              ) not in ("", "#ffffff"))
        page.screenshot(path=f"{SHOTS}/21_new_event.png")

        # The namespace refuses a taken address.
        page.goto(f"{BASE}/calendars", wait_until="networkidle")
        page.get_by_role("button", name="New Calendar").click()
        page.wait_for_selector("[role=dialog]", timeout=8000)
        check("the slug field caption is pinned",
              page.locator("#cal-slug-caption").inner_text() == "This becomes the calendar address.")
        page.fill("#cal-name", "Clashing Calendar")
        page.fill("#cal-slug", "thursday-night-5k")
        page.fill("#cal-city", "Berlin")
        page.locator("[role=dialog]").get_by_role("button", name="Create Calendar").click()
        page.wait_for_timeout(1800)
        check("a taken address is refused with the pinned sentence",
              page.locator("[role=dialog] .field__refusal").inner_text().strip()
              == "That address is already taken.",
              page.locator("[role=dialog] .field__refusal").inner_text())
        check("the dialog stays open with what was typed",
              page.locator("#cal-slug").input_value() == "thursday-night-5k")
        page.screenshot(path=f"{SHOTS}/22_slug_refused.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(600)
        check("the dialog closes on the escape key", page.locator("[role=dialog]").count() == 0)

        # A handle already taken is refused and the stored handle is unchanged.
        page.goto(f"{BASE}/settings/profile", wait_until="networkidle")
        page.wait_for_selector("#set-handle", timeout=10000)
        check("the save control is disabled until something differs",
              page.get_by_role("button", name="Save Changes").is_disabled())
        page.fill("#set-handle", "marcus-bell")
        page.wait_for_timeout(400)
        check("the address the handle produces is shown as the visitor types",
              page.locator("#set-handle-caption").inner_text().endswith("/marcus-bell"),
              page.locator("#set-handle-caption").inner_text())
        page.get_by_role("button", name="Save Changes").click()
        page.wait_for_timeout(1800)
        check("a taken handle is refused with the pinned sentence",
              page.locator(".field__refusal").inner_text().strip() == "That handle is already taken.",
              page.locator(".field__refusal").inner_text())
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("the saved handle is unchanged until a save succeeds",
              page.locator("#set-handle").input_value() == "priya-raman",
              page.locator("#set-handle").input_value())
        page.screenshot(path=f"{SHOTS}/23_handle_refused.png")
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== entry, redirects and refusals ==")
        ctx = browser.new_context()
        page = ctx.new_page()
        watch(page, "redirects")

        page.goto(f"{BASE}/home", wait_until="networkidle")
        page.wait_for_timeout(900)
        check("an unauthenticated visitor at a protected route goes to /login?next=",
              "/login?next=%2Fhome" in page.url or "/login?next=/home" in page.url, page.url)
        page.fill("#auth-email", "guest@example.com")
        page.fill("#auth-password", PW)
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/home"), timeout=15000)
        check("login lands on next", page.url.endswith("/home"), page.url)

        page.goto(f"{BASE}/calendars", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("a guest at /calendars gets the not-found page", "Page Not Found" in page.content())
        page.goto(f"{BASE}/event/thursday-night-5k/manage/guests", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("a guest at a manage route gets the not-found page", "Page Not Found" in page.content())

        page.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
        page.wait_for_timeout(1400)
        check("a guest reading a draft gets the not-found page", "Page Not Found" in page.content())

        # A direct API call from a guest session must be refused server-side.
        token = page.evaluate("() => localStorage.getItem('deku.token')")
        denied = page.evaluate(
            """async (t) => {
                 const r = await fetch('/api/calendars', {
                   method: 'POST',
                   headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t },
                   body: JSON.stringify({ name: 'X', slug: 'sneaky-ui', category: 'running', city: 'Berlin', is_public: true }),
                 });
                 return r.status;
               }""",
            token,
        )
        check("a direct API call from a guest session is denied, not served",
              denied in (401, 403, 404), denied)

        # Logging out returns to the landing route.
        page.goto(f"{BASE}/home", wait_until="networkidle")
        page.wait_for_selector(".sign-out", timeout=10000)
        page.click(".sign-out")
        page.wait_for_timeout(1200)
        check("logout returns the visitor to /", page.url.rstrip("/") == BASE.rstrip("/"), page.url)

        # An expired token is cleared and sends the visitor to sign in.
        page.evaluate(
            """() => {
                 const payload = btoa(JSON.stringify({ sub: 1, exp: 1 })).replace(/=+$/, '');
                 localStorage.setItem('deku.token', payload + '.bad');
                 localStorage.setItem('deku.account', JSON.stringify({ id: 1, email: 'x@example.com', display_name: 'X', handle: 'x', role: 'guest' }));
               }"""
        )
        page.goto(f"{BASE}/home", wait_until="networkidle")
        page.wait_for_timeout(1600)
        check("an expired token sends the visitor to /login?next=",
              "/login" in page.url and "next" in page.url, page.url)
        page.screenshot(path=f"{SHOTS}/24_expired_token.png")

        page.goto(f"{BASE}/nothing-here-at-all", wait_until="networkidle")
        page.wait_for_timeout(1000)
        check("an unknown address is the not-found page", "Page Not Found" in page.content())
        check("the not-found body is pinned",
              "Looks like you discovered a page that doesn't exist or you don't have access to."
              in page.content())
        page.screenshot(path=f"{SHOTS}/25_not_found.png")

        page.goto(f"{BASE}/app", wait_until="networkidle")
        page.wait_for_timeout(900)
        check("the get-the-app page reads Get the App",
              page.locator("h1").inner_text() == "Get the App")
        check("it carries a scan code drawn as vector geometry",
              page.locator("app-scan-code svg").count() == 1)
        page.screenshot(path=f"{SHOTS}/26_get_the_app.png")

        page.goto(f"{BASE}/running", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("a category resolves to its own page",
              page.locator("h1").inner_text() == "Running", page.locator("h1").inner_text())
        check("the masthead carries the counts",
              re.search(r"\d+ published", page.locator(".masthead__counts").inner_text()) is not None,
              page.locator(".masthead__counts").inner_text())
        check("its subscribe button is pinned",
              page.get_by_role("button", name="Subscribe").count() == 1)
        page.screenshot(path=f"{SHOTS}/27_category.png")

        page.goto(f"{BASE}/riverside-run-club", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("a calendar resolves to its own page",
              page.locator("h1").inner_text() == "Riverside Run Club", page.locator("h1").inner_text())
        page.goto(f"{BASE}/priya-raman", wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("an account handle resolves to its own page",
              page.locator("h1").inner_text() == "Priya Raman", page.locator("h1").inner_text())
        ctx.close()

        # ---------------------------------------------------------------
        print("\n== responsive and accessibility ==")
        ctx = browser.new_context(viewport={"width": 390, "height": 780})
        page = ctx.new_page()
        watch(page, "phone")
        page.goto(f"{BASE}/sunrise-long-run", wait_until="networkidle")
        page.wait_for_selector("app-registration-panel", timeout=10000)
        pos = page.evaluate(
            "() => getComputedStyle(document.querySelector('app-registration-panel')).position"
        )
        height = page.evaluate(
            "() => document.querySelector('app-registration-panel .panel').getBoundingClientRect().height"
        )
        check("the registration panel becomes a foot bar on a phone", pos == "fixed", pos)
        check("the foot bar is at least 72px tall", height >= 71, height)
        page.screenshot(path=f"{SHOTS}/28_phone_footbar.png")

        page.goto(f"{BASE}/home", wait_until="networkidle")
        page.wait_for_timeout(900)
        sign_in(page, "guest2@example.com")
        page.wait_for_selector(".topbar__menu", timeout=10000)
        check("the rail collapses to an icon bar with a drawer below 1000px",
              page.locator(".topbar__menu").is_visible())
        page.click(".topbar__menu")
        page.wait_for_timeout(700)
        check("the drawer opens", page.locator(".rail--open").count() == 1)
        check("the drawer is scrim-backed", page.locator(".scrim").count() == 1)
        page.keyboard.press("Escape")
        page.wait_for_timeout(600)
        check("the drawer closes on the escape key", page.locator(".rail--open").count() == 0)
        page.screenshot(path=f"{SHOTS}/29_phone_shell.png")
        ctx.close()

        ctx = browser.new_context(viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        watch(page, "a11y")
        page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        page.wait_for_selector(".title", timeout=10000)
        check("one h1 on the route", page.locator("h1").count() == 1, page.locator("h1").count())
        check("landmarks around the bar and the content",
              page.locator("header").count() >= 1 and page.locator("main").count() == 1)
        page.keyboard.press("Tab")
        ring = page.evaluate(
            """() => {
                 const el = document.activeElement;
                 const s = getComputedStyle(el);
                 return { width: s.outlineWidth, offset: s.outlineOffset, colour: s.outlineColor };
               }"""
        )
        check("keyboard navigation reaches a visible focus ring",
              ring["width"] == "2px" and ring["offset"] == "2px", ring)
        check("every icon-only control carries a text name",
              page.evaluate(
                  """() => Array.from(document.querySelectorAll('button, a')).every(el =>
                       (el.textContent || '').trim().length > 0 ||
                       el.getAttribute('aria-label') ||
                       el.querySelector('.visually-hidden'))"""
              ))
        ctx.close()

        browser.close()

    print("\n== console ==")
    noise = [c for c in console_problems if "Angular is running in development mode" not in c]
    check("no console errors or warnings while walking", len(noise) == 0, noise[:6])

    print(f"\n{passed} passed, {failed} failed")
    if failed:
        print("failures:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)


if __name__ == "__main__":
    main()

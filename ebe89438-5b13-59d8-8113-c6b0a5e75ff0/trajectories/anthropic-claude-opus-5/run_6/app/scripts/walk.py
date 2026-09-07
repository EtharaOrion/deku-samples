
import asyncio, json, re, sys, urllib.request, urllib.parse
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:4173"
PW = "deku-demo-pw-2026"
SHOTS = "/app/.browser_screenshots"

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  <- {detail}"))

def mailpit(query, tries=8):
    """Mailpit indexes a message a moment after the SMTP send returns, so poll."""
    url = "http://mailpit:8025/api/v1/search?query=" + urllib.parse.quote(query)
    import time
    for _ in range(tries):
        with urllib.request.urlopen(url) as r:
            msgs = json.load(r).get("messages", [])
        if msgs:
            return msgs
        time.sleep(0.5)
    return []

async def sign_in(page, email):
    """Signs in through the form, waiting out the 10-a-minute limit if the
    suites before this one have already used up the window for that account."""
    for attempt in range(8):
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill('input[type=email]', email)
        await page.fill('input[type=password]', PW)
        await page.click('button[type=submit]')
        try:
            await page.wait_for_url(re.compile(r"/(home|calendars)"), timeout=8000)
            return
        except Exception:
            body = await page.inner_text("body")
            if "Too many attempts" in body:
                await asyncio.sleep(8)
                continue
            raise AssertionError(f"sign in failed for {email}: {body[:200]}")
    raise AssertionError(f"sign in for {email} stayed rate limited")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome")
        errors = []
        bad = []

        async def page_with_console():
            ctx = await browser.new_context(viewport={"width":1440,"height":960})
            p = await ctx.new_page()
            p.on("console", lambda m: errors.append(m.text) if m.type=="error" else None)
            p.on("pageerror", lambda e: errors.append(str(e)))
            p.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 else None)
            return ctx, p

        # ---------------------------------------------------------- journey 1
        print("\n== journey 1: a guest registers and gets a ticket ==")
        ctx, page = await page_with_console()
        await page.goto(BASE, wait_until="networkidle")
        check("landing shows the headline", "start here" in await page.inner_text("h1"))
        await page.screenshot(path=f"{SHOTS}/01_landing.png", full_page=False)

        await sign_in(page, "guest@example.com")
        await page.screenshot(path=f"{SHOTS}/02_signed_in_home.png")

        await page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        title = await page.inner_text("h1")
        check("the event page names the event", "Thursday Night 5K" in title, title)

        ground = await page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()")
        check("the page arrives already wearing its theme", ground not in ("", "#ffffff"), ground)

        btn = page.get_by_role("button", name=re.compile("Register|Request to Join"))
        if await btn.count():
            await btn.first.click()
            await page.wait_for_timeout(2500)
        body = await page.inner_text("body")
        got_ticket = "TKT-" in body
        check("the panel shows a ticket code or a waiting-list place",
              got_ticket or "waiting list" in body.lower(), body[:200])
        await page.screenshot(path=f"{SHOTS}/03_event_registered.png")

        msgs = mailpit("to:guest@example.com")
        check("the confirmation reached that inbox", len(msgs) > 0, f"{len(msgs)} messages")
        if msgs:
            check("with a pinned subject",
                  msgs[0]["Subject"].startswith(("You're going to","You're on the waiting list for")),
                  msgs[0]["Subject"])
        await ctx.close()

        # ---------------------------------------------------------- journey 2
        print("\n== journey 2: two guests take the last seat at the same instant ==")
        import pg_reset
        await pg_reset.reset_track_session()

        ctxs = []
        pages = []
        for email in ("guest2@example.com", "guest3@example.com"):
            c, p = await page_with_console()
            await sign_in(p, email)
            await p.goto(f"{BASE}/riverside-track-session", wait_until="networkidle")
            ctxs.append(c); pages.append(p)

        # both press at the same instant
        await asyncio.gather(*[
            p.get_by_role("button", name=re.compile("Register")).first.click() for p in pages
        ])
        await asyncio.sleep(3)
        bodies = [await p.inner_text("body") for p in pages]
        seats = sum(1 for b in bodies if "TKT-" in b)
        waits = sum(1 for b in bodies if "waiting list" in b.lower())
        check("exactly one of the two holds a seat", seats == 1, f"seats={seats}")
        check("and the other holds a waiting-list place", waits == 1, f"waits={waits}")
        await pages[0].screenshot(path=f"{SHOTS}/04_last_seat_winner.png")
        await pages[1].screenshot(path=f"{SHOTS}/05_last_seat_waitlist.png")
        for c in ctxs: await c.close()

        # ---------------------------------------------------------- journey 3
        print("\n== journey 3: the host approves a pending request ==")
        import pg_reset as R3
        await R3.setup_pending_case()
        ctx, page = await page_with_console()
        await sign_in(page, "host@example.com")
        await page.screenshot(path=f"{SHOTS}/06_host_calendars.png")

        await page.goto(f"{BASE}/event/sunrise-long-run/manage/guests", wait_until="networkidle")
        approve = page.get_by_role("button", name="Approve")
        check("the queue offers an Approve control", await approve.count() > 0)
        if await approve.count():
            await approve.first.click()
            await page.wait_for_timeout(2500)
            body = await page.inner_text("body")
            check("the row flips to confirmed", "Confirmed" in body)
        await page.screenshot(path=f"{SHOTS}/07_host_approved.png")
        await ctx.close()

        # ---------------------------------------------------------- journey 4
        print("\n== journey 4: a cancel passes the seat to the head of the list ==")
        import pg_reset as R
        head_email = await R.setup_cancel_case()
        ctx, page = await page_with_console()
        await sign_in(page, "guest@example.com")
        await page.goto(f"{BASE}/home", wait_until="networkidle")
        cancel = page.get_by_role("button", name=re.compile("^Cancel$"))
        check("the confirmed row offers a cancel control", await cancel.count() > 0)
        if await cancel.count():
            await cancel.first.click()
            await page.wait_for_timeout(400)
            await page.get_by_role("button", name="Cancel Registration").click()
            await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{SHOTS}/08_guest_cancelled.png")
        promoted = await R.head_is_confirmed(head_email)
        check("the head of the waiting list is confirmed in the same breath", promoted, str(promoted))
        mail = mailpit(f"to:{head_email}")
        check("and the promoted guest was mailed", len(mail) > 0, f"{len(mail)}")
        await ctx.close()

        # ---------------------------------------------------------- journey 5
        print("\n== journey 5: a host calls an event off with a typed reason ==")
        await R.republish_winter()
        ctx, page = await page_with_console()
        await sign_in(page, "host2@example.com")
        await page.goto(f"{BASE}/event/winter-reading-night/manage/overview", wait_until="networkidle")
        await page.get_by_role("button", name="Cancel Event").click()
        await page.wait_for_timeout(400)
        reason = "The venue lost its lease."
        await page.fill("textarea", reason)
        await page.get_by_role("button", name="Cancel Event").last.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{SHOTS}/09_event_cancelled.png")

        await page.goto(f"{BASE}/winter-reading-night", wait_until="networkidle")
        body = await page.inner_text("body")
        check("the page keeps its address", "winter-reading-night" in page.url)
        check("and shows the notice, not the panel", reason in body, body[:200])
        check("the register control is gone",
              await page.get_by_role("button", name=re.compile("^Register$")).count() == 0)
        await page.screenshot(path=f"{SHOTS}/10_cancelled_public.png")
        await ctx.close()

        # ------------------------------------------------------ extra surfaces
        print("\n== the remaining surfaces ==")
        ctx, page = await page_with_console()
        await page.goto(f"{BASE}/discover?category=running&q=track", wait_until="networkidle")
        body = await page.inner_text("body")
        check("discover filters from the address alone", "Riverside Track Session" in body, body[:200])
        check("the page control reads Showing n of total", "Showing" in body)
        await page.screenshot(path=f"{SHOTS}/11_discover_filtered.png")

        await page.goto(f"{BASE}/running", wait_until="networkidle")
        check("a category name resolves to its page", "Running" in await page.inner_text("h1"))
        await page.screenshot(path=f"{SHOTS}/12_category.png")

        await page.goto(f"{BASE}/riverside-winter-time-trial", wait_until="networkidle")
        body = await page.inner_text("body")
        check("the closed panel reads its pinned words", "Registration Is Closed" in body, body[:200])
        check("with its pinned body",
              "The host has stopped taking registrations for this event." in body)
        await page.screenshot(path=f"{SHOTS}/13_registration_closed.png")

        await page.goto(f"{BASE}/harbour-loop-recovery-jog", wait_until="networkidle")
        body = await page.inner_text("body")
        check("a draft is the not-found page to a stranger", "Page Not Found" in body, body[:160])
        await page.screenshot(path=f"{SHOTS}/14_draft_not_found.png")

        code = await R.any_ticket_code()
        if code:
            await page.goto(f"{BASE}/t/{code}", wait_until="networkidle")
            body = await page.inner_text("body")
            check("a ticket is presentable without an account", code in body, body[:200])
            await page.screenshot(path=f"{SHOTS}/15_ticket.png")

        await page.goto(f"{BASE}/nothing-here-at-all", wait_until="networkidle")
        check("an unknown name is the not-found page", "Page Not Found" in await page.inner_text("body"))
        await ctx.close()

        # a guest may not reach the host screens
        ctx, page = await page_with_console()
        await sign_in(page, "guest@example.com")
        await page.goto(f"{BASE}/calendars", wait_until="networkidle")
        check("a guest at /calendars gets the not-found page",
              "Page Not Found" in await page.inner_text("body"))
        await page.goto(f"{BASE}/event/thursday-night-5k/manage/guests", wait_until="networkidle")
        check("a guest at a manage route gets the not-found page",
              "Page Not Found" in await page.inner_text("body"))
        await page.screenshot(path=f"{SHOTS}/16_guest_denied.png")
        await ctx.close()

        # an unauthenticated visitor is sent to sign in, carrying next
        ctx, page = await page_with_console()
        await page.goto(f"{BASE}/home", wait_until="networkidle")
        check("an unauthenticated visitor at /home lands on /login?next=/home",
              "/login" in page.url and "next=%2Fhome" in page.url.replace("/home","%2Fhome") or "next=/home" in page.url,
              page.url)
        await page.screenshot(path=f"{SHOTS}/17_login_next.png")
        await ctx.close()

        # a phone viewport
        ctx = await browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        await page.goto(f"{BASE}/thursday-night-5k", wait_until="networkidle")
        foot = await page.evaluate(
            "!!document.querySelector('.footbar') && getComputedStyle(document.querySelector('.footbar')).display !== 'none'")
        check("the registration panel becomes a foot bar on a phone", foot, str(foot))
        await page.screenshot(path=f"{SHOTS}/18_phone_event.png")
        await ctx.close()

        # the not-found journeys deliberately ask for records that do not exist
        expected404 = ("/api/events/harbour-loop-recovery-jog", "/api/resolve/nothing-here-at-all")
        unexpected = [b for b in bad if not any(e in b for e in expected404)]
        print("   requests >=400:", bad)
        check("no unexpected failing requests", not unexpected, "; ".join(unexpected[:3]))
        real_errors = [e for e in errors if "favicon" not in e.lower()]
        check("no console errors beyond those deliberate not-founds",
              len(real_errors) <= len([b for b in bad if any(e in b for e in expected404)]),
              "; ".join(real_errors[:3]))
        await browser.close()

    passed = sum(1 for _,c,_ in results if c)
    print(f"\n{passed} passed, {len(results)-passed} failed\n")
    return 0 if passed == len(results) else 1

sys.exit(asyncio.run(main()))

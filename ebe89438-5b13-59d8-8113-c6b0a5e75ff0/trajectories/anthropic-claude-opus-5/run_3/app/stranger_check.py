"""
The definition of done, walked exactly as a stranger would:
open the app, sign up, open a published event, register, receive a ticket code
and a real confirmation email -- without hitting an error page.

This uses a brand new account created through the UI, not a seeded one.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_PUBLIC_URL", "http://localhost:4173")
LOCAL = "http://localhost:4173"
MAILPIT = "http://mailpit:8025"
CHROME = "/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"

failures = []
console_errors = []


def check(name, cond, detail=""):
    print(f"  {'ok  ' if cond else 'FAIL'} {name}" + (f"  {detail}" if not cond else ""))
    if not cond:
        failures.append(f"{name} {detail}")


def psql(sql):
    return subprocess.run(
        ["psql", os.environ["DATABASE_URL"], "-tAc", sql], capture_output=True, text=True
    ).stdout.strip()


def main():
    stamp = str(int(time.time()))
    email = f"stranger{stamp}@example.com"
    password = "a-brand-new-password-2026"
    name = "Sam Okafor"

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" and "favicon" not in m.text.lower() else None,
        )
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        print("\n== A stranger opens the app and signs up ==")
        page.goto(f"{LOCAL}/", wait_until="networkidle")
        check("the landing page opens", "start here" in page.inner_text("h1"))

        # Reach signup the way a visitor does, through the interface.
        page.click("a[href='/login']")
        page.wait_for_load_state("networkidle")
        page.click("a:has-text('Create an account')")
        page.wait_for_url(re.compile(r"/signup"), timeout=10000)
        page.wait_for_load_state("networkidle")
        check("the sign-up card says a new account is a guest account",
              "A new account is a guest account." in page.inner_text("body"))

        page.fill("#name", name)
        page.fill("#email", email)
        page.fill("#password", password)
        page.click("button[type=submit]")
        page.wait_for_url(re.compile(r"/home$"), timeout=15000)
        page.wait_for_load_state("networkidle")
        check("signing up lands the new guest on /home", page.url.endswith("/home"))
        # The route paints its skeleton first, so wait for the data to land the
        # way an observer would rather than asserting into the loading state.
        page.wait_for_selector("text=No Upcoming Events", timeout=10000)
        check("and the empty state names the absence", "No Upcoming Events" in page.inner_text("body"))
        check("the empty state offers a way out", "Events you register for will appear here." in page.inner_text("body"))

        role = psql(f"SELECT role FROM accounts WHERE email='{email}';")
        check("signup always creates a guest", role == "guest", role)

        print("\n== They find a published event and register ==")
        page.click("a:has-text('Discover Events')")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1200)
        check("discovery lists published events", page.locator("app-event-card").count() > 0)

        page.goto(f"{LOCAL}/sunrise-long-run", wait_until="networkidle")
        page.wait_for_timeout(800)
        # This event has approval on, so a stranger should meet the request panel.
        panel = page.locator("section.panel").inner_text()
        check("an approval event offers to take a request", "Request to join" in panel, panel[:120])

        # Now a plain published event with seats, for the ticket path.
        page.goto(f"{LOCAL}/winter-reading-night", wait_until="networkidle")
        page.wait_for_timeout(1000)
        ground = page.evaluate(
            "getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()"
        )
        check("the event page arrives already wearing its colours", ground not in ("", "#ffffff"), ground)

        page.locator("section.panel button", has_text=re.compile("Register")).first.click()
        page.wait_for_timeout(3000)

        answer = page.locator(".panel-answer").inner_text()
        code_match = re.search(r"TKT-[A-Z0-9]{8}", answer)
        check("the panel hands back a ticket code", code_match is not None, answer)
        check("no error page was hit", "Page Not Found" not in page.inner_text("body"))

        page.screenshot(path="/app/.browser_screenshots/14_stranger_signup_and_ticket.png", full_page=True)

        if code_match:
            code = code_match.group(0)

            print("\n== The ticket is presentable at a door, without an account ==")
            anon = browser.new_context(viewport={"width": 1024, "height": 900})
            ap = anon.new_page()
            ap.goto(f"{LOCAL}/t/{code}", wait_until="networkidle")
            ap.wait_for_timeout(1200)
            body = ap.inner_text("body")
            check("a signed-out stranger can read the ticket", code in body, body[:120])
            check("the ticket names the event", "Winter Reading Night" in body)
            ap.screenshot(path="/app/.browser_screenshots/15_stranger_ticket.png", full_page=True)
            anon.close()

            print("\n== A real confirmation email arrived ==")
            # email_log is written only after the SMTP send returned.
            logged = psql(
                f"SELECT subject FROM email_log WHERE recipient='{email}' "
                "ORDER BY sent_at DESC LIMIT 1;"
            )
            check("email_log records the send", logged == "You're going to Winter Reading Night", logged)

            found = None
            for _ in range(10):
                q = urllib.request.quote(f"to:{email}")
                data = json.load(urllib.request.urlopen(f"{MAILPIT}/api/v1/search?query={q}"))
                if data.get("messages"):
                    found = data["messages"][0]
                    break
                time.sleep(1)

            check("Mailpit really holds the message", found is not None)
            if found:
                full = json.load(urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{found['ID']}"))
                to = [t["Address"] for t in full.get("To") or []]
                check("addressed to that guest alone", to == [email], str(to))
                check("no cc and no bcc", not (full.get("Cc") or []) and not (full.get("Bcc") or []))
                check("the subject is the pinned line",
                      full["Subject"] == "You're going to Winter Reading Night", full["Subject"])
                text = full.get("Text") or ""
                check("the body names the event", "Winter Reading Night" in text)
                check("the body carries the ticket code", code in text, text[:160])

        print("\n== The seat is real in the database ==")
        row = psql(
            f"SELECT r.status || '|' || coalesce(r.ticket_code,'-') FROM registrations r "
            f"JOIN accounts a ON a.id=r.account_id WHERE a.email='{email}';"
        )
        check("the registration is confirmed with a ticket", row.startswith("confirmed|TKT-"), row)

        browser.close()

    # Leave the seed exactly as it was found.
    psql(f"DELETE FROM email_log WHERE recipient='{email}';")
    psql(f"DELETE FROM registrations WHERE account_id=(SELECT id FROM accounts WHERE email='{email}');")
    psql(f"DELETE FROM accounts WHERE email='{email}';")
    print(f"\n  (cleaned up the throwaway account {email})")

    print("\n== console ==")
    print("  no console errors" if not console_errors else "\n".join(f"  {e}" for e in console_errors[:8]))

    print("\n" + ("FAILURES" if failures else "The definition of done is met."))
    for f in failures:
        print(f"  - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

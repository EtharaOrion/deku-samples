#!/usr/bin/env python3
"""
Walk the app in a browser as a stranger would, judging each step against the
page rather than by eye: read the values back, check that what should be there
is and what should not be is not, and watch the console.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173')
SHOTS = '/app/.browser_screenshots'
PASSWORD = 'deku-demo-pw-2026'

passed = 0
failed = 0
console_errors = []


def check(ok, name, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  ok   {name}')
    else:
        failed += 1
        print(f'  FAIL {name} {detail}')


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name), full_page=False)


def chromium_path():
    """This environment ships a Chromium build Playwright does not expect."""
    root = '/root/.cache/ms-playwright'
    for entry in sorted(os.listdir(root), reverse=True):
        if entry.startswith('chromium-'):
            candidate = os.path.join(root, entry, 'chrome-linux', 'chrome')
            if os.path.exists(candidate):
                return candidate
    return None


def run(p):
    browser = p.chromium.launch(args=['--no-sandbox'], executable_path=chromium_path())
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()

    # The 409 raised when registering a camera that belongs to somebody else is
    # the rule working; the browser logs the failed fetch regardless. Everything
    # else is a genuine console error.
    def note_console(m):
        if m.type != 'error':
            return
        if '409' in m.text and 'Conflict' in m.text:
            return
        console_errors.append(f'{m.type}: {m.text}')

    page.on('console', note_console)
    page.on('pageerror', lambda e: console_errors.append(f'pageerror: {e}'))

    # ---- 1. the letter ----------------------------------------------------
    print('--- the front page ---')
    page.goto(BASE, wait_until='networkidle')
    check(page.locator('h1').first.inner_text().strip() == 'the table',
          'the title reads "the table"')
    check(page.get_by_text('June 1, 2026').first.is_visible(), 'the dateline is there')
    body = page.locator('.letter-body p')
    check(body.count() == 17, f'sixteen paragraphs and the closing line in normal flow ({body.count()})')
    check('See you soon.' in page.content(), 'the closing line is present')
    # The film is inert.
    video = page.locator('video')
    check(video.count() == 1 and not video.first.get_attribute('controls'),
          'the film has no controls')
    check(video.first.get_attribute('tabindex') == '-1', 'the film is not focusable')
    check(page.locator('[data-stage]').get_attribute('aria-hidden') == 'true',
          'the stage is hidden from assistive technology')
    # The darkening is a pure function of scroll position.
    top = page.evaluate("getComputedStyle(document.querySelector('[data-veil]')).opacity")
    page.evaluate('window.scrollTo(0, document.body.scrollHeight / 2)')
    page.wait_for_timeout(250)
    mid = page.evaluate("getComputedStyle(document.querySelector('[data-veil]')).opacity")
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(250)
    back = page.evaluate("getComputedStyle(document.querySelector('[data-veil]')).opacity")
    check(float(top) < float(mid), f'scrolling down darkens the stage ({top} -> {mid})')
    check(abs(float(back) - float(top)) < 0.02, f'scrolling back up lifts it again ({back})')
    # The footer's only link is Shop.
    check(page.locator('footer a[href="/shop"]').count() == 1, 'the footer links to the shop')
    check(page.locator('footer').get_by_text('All rights reserved').is_visible(),
          'the footer carries the rights line')
    shot(page, '01_the_letter.png')

    # ---- 2. the catalogue -------------------------------------------------
    print('--- the catalogue ---')
    page.goto(f'{BASE}/shop', wait_until='networkidle')
    check(page.get_by_role('heading', name='Vela Cricket').first.is_visible(), 'the Cricket is listed')
    check('From $19.00' in page.content(), 'a product whose variants differ reads "From"')
    check(page.get_by_text('Discontinued').first.is_visible(), 'the discontinued product carries its chip')
    shot(page, '02_the_catalogue.png')

    # ---- 3. one product ---------------------------------------------------
    print('--- one product ---')
    page.goto(f'{BASE}/shop/flagship', wait_until='networkidle')
    check('Only 4 left' in page.content(), 'the low stock variant reads "Only 4 left"')
    page.goto(f'{BASE}/shop/mount', wait_until='networkidle')
    check('We no longer sell this. We will support it until September 1, 2029.' in page.content(),
          'the discontinued product renders its support note')
    disabled = page.locator('[data-add]').is_disabled()
    check(disabled, 'the buy control is disabled on a discontinued product')

    page.goto(f'{BASE}/shop/compact', wait_until='networkidle')
    # Choosing sold-out Yellow disables the control and labels it.
    page.get_by_role('radio', name='Yellow').check()
    page.wait_for_timeout(200)
    check(page.locator('[data-add]').inner_text().strip() == 'Sold out',
          'the sold out variant labels the control "Sold out"')
    check('variant=VELA-CRICKET-YELLOW' in page.url, 'choosing an option updates the address')
    page.get_by_role('radio', name='Graphite').check()
    page.wait_for_timeout(200)
    shot(page, '03_one_product.png')

    # ---- 4. the cart ------------------------------------------------------
    print('--- the cart ---')
    page.locator('[data-add]').click()
    page.wait_for_timeout(600)
    page.goto(f'{BASE}/shop/case', wait_until='networkidle')
    page.locator('[data-add]').click()
    page.wait_for_timeout(600)

    page.goto(f'{BASE}/cart', wait_until='networkidle')
    subtotal = page.locator('[data-subtotal]').inner_text().strip()
    check(subtotal == '$378.00', f'the cart subtotal reads $378.00 (read {subtotal})')
    check('Estimated. We will show the exact amount once we know where it is going.' in page.content(),
          'the cart states the estimate note')
    # The label spans an element, so read the rendered text rather than the markup.
    protection_label = re.sub(r'\s+', ' ', page.locator('.protection').inner_text()).strip()
    check(protection_label == 'Protect this shipment against loss, theft and damage for $2.98',
          f'the protection toggle names the rung price ({protection_label!r})')
    check(not page.locator('[data-protection]').is_checked(), 'protection is unticked by default')
    shot(page, '04_the_cart.png')

    # ---- 5. checkout ------------------------------------------------------
    print('--- checkout ---')
    page.goto(f'{BASE}/checkout/where-it-goes', wait_until='networkidle')
    page.fill('#email', 'customer@example.com')
    page.fill('#name', 'Iris Vantaa')
    page.fill('#line1', '44 Harbour Row')
    page.fill('#city', 'Portland')
    page.fill('#region', 'OR')
    page.fill('#postal_code', '97204')
    shot(page, '05_checkout_where.png')
    page.click('[data-submit]')
    page.wait_for_url('**/checkout/how-it-gets-there', timeout=15000)

    # No method is preselected.
    checked = page.locator('input[name="shipping_method"]:checked').count()
    check(checked == 0, 'no delivery method is preselected')
    page.get_by_role('radio', name='Standard').check()
    shot(page, '06_checkout_how.png')
    page.click('[data-submit]')
    page.wait_for_url('**/checkout/payment', timeout=15000)

    total = page.locator('[data-final-total]').inner_text().strip()
    check(total == '$415.80', f'the final step shows $415.80 (read {total})')
    tax_shown = '$37.80' in page.content()
    check(tax_shown, 'the tax line reads $37.80')
    shot(page, '07_checkout_payment.png')

    # ---- 6. placing the order --------------------------------------------
    print('--- placing the order ---')
    page.click('[data-place]')
    page.wait_for_url('**/orders/**', timeout=30000)
    number = re.search(r'/orders/(VE-\d{4}-\d{4})', page.url).group(1)
    check(number == 'VE-2026-0002', f'the order is VE-2026-0002 (got {number})')
    expected = f'Order {number} is confirmed. We have emailed customer@example.com.'
    check(expected in page.content(), f'the page reads "{expected}"')
    check(page.get_by_role('link', name='Keep track of this order').is_visible(),
          'the confirmation offers "Keep track of this order"')
    check('$415.80' in page.content(), 'the order total reads $415.80')
    shot(page, '08_order_confirmed.png')

    # ---- 7. sign in and register a camera --------------------------------
    print('--- the account ---')
    page.goto(f'{BASE}/account/cameras', wait_until='networkidle')
    check('/sign-in' in page.url and 'next=' in page.url,
          f'a signed-out account route lands on sign-in carrying the path ({page.url})')
    page.fill('#email', 'customer@example.com')
    page.fill('#password', PASSWORD)
    shot(page, '09_sign_in.png')
    page.click('[data-submit]')
    page.wait_for_url('**/account/cameras', timeout=15000)
    check('/account/cameras' in page.url, 'signing in returns to the intended path')

    # The seeded camera is there, the other customer's is not.
    check('VC2609PVDA7Q' in page.content(), 'the account shows its own camera')
    check('VA2609NRWB2Z' not in page.content(), "another customer's camera is not shown")

    page.fill('[data-serial]', 'VA2609KTMHX4')
    page.click('[data-register] [data-submit]')
    page.wait_for_timeout(2000)
    check('VA2609KTMHX4' in page.content(), 'the registered camera appears on the account')
    shot(page, '10_cameras_registered.png')

    # A camera belonging to somebody else is refused, without naming them.
    page.fill('[data-serial]', 'VA2609NRWB2Z')
    page.click('[data-register] [data-submit]')
    page.wait_for_timeout(1500)
    refusal = page.locator('[data-register] [data-error]').inner_text().strip()
    check(refusal == 'That camera is registered to someone else.',
          f'another customer\'s camera is refused ({refusal!r})')
    check('Rune' not in page.content(), 'the refusal never names the other person')
    shot(page, '11_ownership_refused.png')

    # ---- 8. the archive ---------------------------------------------------
    print('--- the archive ---')
    page.goto(f'{BASE}/downloads', wait_until='networkidle')
    check('Arranger requires macOS 13.0 or later. Download the app below.' in page.content(),
          'the downloads page opens with the requirement line')
    check(page.get_by_role('link', name='Download Arranger 2.0.0').first.is_visible(),
          'the primary control names the newest version')
    check('Only use this if Arranger cannot see your camera.' in page.content(),
          'the web installer carries its warning')
    # Newest build first, and 1.4.3 before 1.4.2 on the shared date.
    versions = page.locator('.release h2').all_inner_texts()
    order = [v.replace('Arranger', '').strip() for v in versions]
    check(order == ['2.0.0', '1.4.4', '1.4.3', '1.4.2'],
          f'the archive orders by build, not by date ({order})')
    # Only the newest is expanded on arrival.
    opened = page.locator('.release details[open]').count()
    check(opened == 1, f'only the newest release is expanded on arrival ({opened})')
    # The whole archive is in the markup whatever the collapse state.
    check('ARR-1871' in page.content(), 'a collapsed release is still present in the markup')
    shot(page, '12_downloads.png')

    page.goto(f'{BASE}/downloads/1.4.3', wait_until='networkidle')
    expanded = page.locator('.release details[open] h2').inner_text()
    check('1.4.3' in expanded, f'its own address renders 1.4.3 expanded ({expanded})')
    shot(page, '13_release_expanded.png')

    # ---- 9. the installer -------------------------------------------------
    print('--- the installer ---')
    page.goto(f'{BASE}/doctor', wait_until='networkidle')
    warning = ('This replaces the software inside your camera. It takes about ninety seconds. '
               'Do not unplug the camera and do not let your computer go to sleep. '
               'If you are on a laptop, plug it in.')
    check(warning in re.sub(r'\s+', ' ', page.content()), 'the warning block reads exactly')
    check(page.locator('[data-connect]').is_disabled(),
          'the connect control is unavailable until the warning is accepted')
    page.click('[data-understand]')
    page.wait_for_timeout(200)
    check(not page.locator('[data-connect]').is_disabled(),
          'accepting the warning makes the connect control available')

    page.fill('[data-serial-input]', 'VC2609PVDA7Q')
    page.click('[data-identify]')
    page.wait_for_timeout(1500)
    line = page.locator('[data-device-line]').inner_text().strip()
    check(line == 'Vela Cricket, serial VC2609PVDA7Q, currently running 7.0',
          f'the page states the camera it found ({line!r})')
    shot(page, '14_doctor_identified.png')

    # The write reports a figure and closes with the version read back.
    page.locator('[data-recommended] button').first.click()
    page.wait_for_selector('.outcome.is-done', timeout=60000)
    outcome = page.locator('[data-outcome]').inner_text().strip()
    check(outcome == 'Done. Your camera is running 7.2.',
          f'the write closes with the version read back ({outcome!r})')
    shot(page, '15_doctor_done.png')

    # ---- 10. orders and the boundary --------------------------------------
    print('--- orders and the boundary ---')
    page.goto(f'{BASE}/account/orders', wait_until='networkidle')
    check('VE-2026-0002' in page.content(), 'the new order is in the history')
    check('VE-2026-0001' in page.content(), 'the seeded order is in the history')
    shot(page, '16_account_orders.png')

    # Another customer's order reads as not found, never forbidden.
    page.goto(f'{BASE}/account/orders/VE-2026-0001', wait_until='networkidle')
    check('VE-2026-0001' in page.content(), 'its own order opens')

    context2 = browser.new_context(viewport={'width': 1440, 'height': 900})
    page2 = context2.new_page()
    page2.goto(f'{BASE}/sign-in', wait_until='networkidle')
    page2.fill('#email', 'customer2@example.com')
    page2.fill('#password', PASSWORD)
    page2.click('[data-submit]')
    page2.wait_for_url('**/account', timeout=15000)
    page2.goto(f'{BASE}/account/orders/VE-2026-0002', wait_until='networkidle')
    check('That order does not exist.' in page2.content(),
          "another customer's order reads as not found")
    check('Forbidden' not in page2.content() and 'forbidden' not in page2.content(),
          'it never reads as forbidden')
    shot(page2, '17_other_customer_not_found.png')
    context2.close()

    # ---- 11. narrow viewport ----------------------------------------------
    print('--- a narrow viewport ---')
    narrow = context.new_page()
    narrow.set_viewport_size({'width': 390, 'height': 844})
    narrow.goto(f'{BASE}/shop', wait_until='networkidle')
    overflow = narrow.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(overflow <= 0, f'nothing scrolls sideways at 390px (overflow {overflow})')
    check(narrow.locator('.rail-toggle').is_visible(), 'the rail collapses to one control')
    shot(narrow, '18_narrow_shop.png')
    narrow.goto(BASE, wait_until='networkidle')
    overflow_home = narrow.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(overflow_home <= 0, f'the letter does not scroll sideways either ({overflow_home})')
    shot(narrow, '19_narrow_letter.png')
    narrow.close()

    # ---- 12. an empty cart and a missing page -----------------------------
    print('--- empty and error states ---')
    empty = context.new_page()
    empty.goto(f'{BASE}/cart', wait_until='networkidle')
    check('Your cart is empty.' in empty.content(), 'the emptied cart states so')
    shot(empty, '20_empty_cart.png')
    empty.goto(f'{BASE}/nothing-here', wait_until='networkidle')
    check('That page does not exist.' in empty.content(), 'a missing page is a rendered page')
    shot(empty, '21_not_found.png')
    empty.close()

    context.close()
    browser.close()


with sync_playwright() as p:
    run(p)

print()
if console_errors:
    print(f'console errors ({len(console_errors)}):')
    for e in console_errors[:20]:
        print('   ', e)
else:
    print('no console errors')

print()
print(f'passed {passed}, failed {failed}')
sys.exit(1 if failed or console_errors else 0)

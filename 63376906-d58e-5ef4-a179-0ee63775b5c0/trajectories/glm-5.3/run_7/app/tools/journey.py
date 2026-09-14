import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = 'http://127.0.0.1:4173'
CHROME = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome'

async def login(page, email):
    await page.goto(BASE + '/login', wait_until='networkidle')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'deku-demo-pw-2026')
    await page.click('button[type=submit]')
    await page.wait_for_url('**/console**', timeout=20000)
    await page.wait_for_timeout(600)

async def main():
    errors = []
    import os
    os.makedirs('/app/.browser_screenshots', exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width':1280,'height':900})
        page.on('console', lambda m: errors.append('console: '+m.text) if m.type=='error' else None)
        page.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))

        # J1: public site
        await page.goto(BASE + '/', wait_until='networkidle'); await page.wait_for_timeout(400)
        await page.screenshot(path='/app/.browser_screenshots/01_home.png', full_page=True)
        for r in ['/product','/technology','/about','/careers','/news','/contact','/privacy']:
            await page.goto(BASE + r, wait_until='networkidle'); await page.wait_for_timeout(300)
        await page.screenshot(path='/app/.browser_screenshots/02_product.png', full_page=False)

        # J2: anonymous verify
        await page.goto(BASE + '/verify/CERT-PILOT-000001', wait_until='networkidle'); await page.wait_for_timeout(500)
        body = await page.inner_text('main')
        assert 'withdrawn' in body.lower(), 'verify must state the withdrawal'
        assert '2026-04-18' in body, 'verify must state the withdrawal date'
        await page.screenshot(path='/app/.browser_screenshots/03_verify_withdrawn.png', full_page=True)
        await page.goto(BASE + '/verify/CERT-DEMO-999999', wait_until='networkidle'); await page.wait_for_timeout(300)
        body2 = await page.inner_text('main')
        assert 'no such certificate' in body2.lower(), 'unknown must say there is no such certificate'
        await page.screenshot(path='/app/.browser_screenshots/04_verify_unknown.png', full_page=True)

        # J3: anonymous console redirect
        await page.goto(BASE + '/console', wait_until='networkidle')
        assert '/login' in page.url, f'anonymous console must redirect to login, got {page.url}'
        await page.screenshot(path='/app/.browser_screenshots/05_login_redirect.png')

        # J4: claims manager allocates and is refused
        await login(page, 'claims@example.com')
        await page.goto(BASE + '/console/balance/BP-DEMO-N6-2026H1', wait_until='networkidle'); await page.wait_for_timeout(700)
        await page.screenshot(path='/app/.browser_screenshots/06_balance.png', full_page=True)
        await page.wait_for_selector('input[type=number]', timeout=20000)
        await page.fill('input[type=number]', '999999')
        await page.select_option('select >> nth=0', 'LOT-N6-0001')
        await page.click('button:has-text("Attach claim")')
        await page.wait_for_timeout(900)
        banner = await page.inner_text('main')
        assert 'refused' in banner.lower() or 'Refused' in banner, 'a refused act renders an inline banner'
        assert 'Available' in banner and 'Requested' in banner, 'banner names available and requested'
        await page.screenshot(path='/app/.browser_screenshots/07_allocation_refused.png', full_page=True)

        # J5: auditor genealogy + export
        await page.context.clear_cookies()
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'auditor@example.com')
        await page.goto(BASE + '/console/lots/LOT-N6-0001/genealogy', wait_until='networkidle'); await page.wait_for_timeout(900)
        body = await page.inner_text('main')
        flat = body.replace('\u202f','').replace('\u00a0',' ')
        assert 'BATCH-1001' in flat and ('450,000' in flat or '450000' in flat), 'genealogy must carry BATCH-1001 once at 450000 g'
        await page.screenshot(path='/app/.browser_screenshots/08_genealogy.png', full_page=True)
        # auditor writes nothing
        writes = await page.query_selector_all('button:not([disabled])')
        await page.goto(BASE + '/console/balance/BP-DEMO-N6-2026H1', wait_until='networkidle'); await page.wait_for_timeout(500)
        assert await page.query_selector('button:has-text("Attach claim")') is None, 'auditor sees no allocation control'

        # J6: signer meets a blocking condition
        await page.context.clear_cookies()
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'signer@example.com')
        for step, name in [('/console/certificates/new/lot','09_wizard_lot'), ('/console/certificates/new/claim','x'), ('/console/certificates/new/recipient','x'), ('/console/certificates/new/review','10_wizard_review')]:
            await page.goto(BASE + step, wait_until='networkidle'); await page.wait_for_timeout(500)
            if step.endswith('/lot'):
                await page.check('input[type=radio][name=lot] >> nth=0')
                await page.wait_for_timeout(300)
                await page.screenshot(path=f'/app/.browser_screenshots/{name}.png', full_page=True)
            if step.endswith('/recipient'):
                await page.check('input[type=radio][name=recipient] >> nth=0')
                await page.wait_for_timeout(300)
        body = await page.inner_text('main')
        assert 'blocked' in body.lower(), 'a condition is unsatisfied and says which'

        # J7: withdrawal blast radius
        await page.goto(BASE + '/console/certificates/CERT-PILOT-000002', wait_until='networkidle'); await page.wait_for_timeout(700)
        await page.screenshot(path='/app/.browser_screenshots/11_certificate.png', full_page=True)

        await browser.close()
    print('JOURNEYS OK')
    if errors:
        print('errors:', json.dumps(errors[:10], indent=1))

asyncio.run(main())

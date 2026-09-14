import asyncio, sys, json
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:4173'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome', args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width':1280,'height':900})
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        what = sys.argv[1] if len(sys.argv)>1 else 'home'
        out = sys.argv[2] if len(sys.argv)>2 else '/tmp/shot.png'
        if what == 'home':
            await page.goto(BASE + '/', wait_until='networkidle')
        elif what == 'login':
            await page.goto(BASE + '/login', wait_until='networkidle')
            await page.fill('input[type=email]', 'claims@example.com')
            await page.fill('input[type=password]', 'deku-demo-pw-2026')
            await page.click('button[type=submit]')
            await page.wait_for_url('**/console**', timeout=15000)
            await page.wait_for_timeout(800)
        elif what == 'direct':
            url = sys.argv[3]
            await page.goto(BASE + url, wait_until='networkidle')
            await page.wait_for_timeout(700)
        await page.screenshot(path=out, full_page=True)
        print('title:', await page.title())
        print('errors:', json.dumps(errors[:5], indent=1))
        await browser.close()

asyncio.run(main())

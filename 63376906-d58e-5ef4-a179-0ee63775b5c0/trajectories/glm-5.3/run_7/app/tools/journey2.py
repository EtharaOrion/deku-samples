import asyncio, json
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:4173'
CHROME='/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome'
PW='deku-demo-pw-2026'

async def login(page, email):
    await page.goto(BASE+'/login', wait_until='networkidle')
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PW)
    await page.click('button[type=submit]')
    await page.wait_for_url('**/console**', timeout=20000)
    await page.wait_for_timeout(500)

async def main():
    errs=[]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        page = await b.new_page(viewport={'width':1280,'height':900})
        page.on('pageerror', lambda e: errs.append(str(e)))

        # reviewer clears the override so the path can be walked end to end
        await login(page, 'claims@example.com')
        ok = await page.evaluate("""async () => {
          const t = localStorage.getItem('ravel.token');
          const r = await fetch('/api/overrides/OVR-0001/review', { method:'POST', headers:{'content-type':'application/json','authorization':'Bearer '+t,'idempotency-key':'journey2-review'}, body:'{}' });
          return r.status;
        }""")
        print('override review status', ok)

# close DEV-0001 so the period can close (only a quality manager closes one)
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'quality@example.com')
        ok2 = await page.evaluate("""async () => {
          const t = localStorage.getItem('ravel.token');
          const r = await fetch('/api/deviations/DEV-0001/close', { method:'POST', headers:{'content-type':'application/json','authorization':'Bearer '+t,'idempotency-key':'journey2-dev'}, body:JSON.stringify({outcome:'root_cause_found'}) });
          return r.status;
        }""")
        print('deviation close status', ok2)

        # allocate 360000 post_consumer to LOT-N6-0001
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'claims@example.com')
        ok3 = await page.evaluate("""async () => {
          const t = localStorage.getItem('ravel.token');
          const r = await fetch('/api/balance-periods/BP-DEMO-N6-2026H1/allocations', { method:'POST', headers:{'content-type':'application/json','authorization':'Bearer '+t,'idempotency-key':'journey2-alloc'}, body:JSON.stringify({lot:'LOT-N6-0001',category:'post_consumer',mass_g:360000}) });
          return [r.status, (await r.json()).content_bp];
        }""")
        print('allocation', ok3)

        # close the period
        ok4 = await page.evaluate("""async () => {
          const t = localStorage.getItem('ravel.token');
          const r = await fetch('/api/balance-periods/BP-DEMO-N6-2026H1/close', { method:'POST', headers:{'content-type':'application/json','authorization':'Bearer '+t,'idempotency-key':'journey2-close'}, body:'{}' });
          return [r.status, (await r.json()).state];
        }""")
        print('period close', ok4)
        await page.goto(BASE+'/console/balance/BP-DEMO-N6-2026H1', wait_until='networkidle'); await page.wait_for_timeout(800)
        await page.screenshot(path='/app/.browser_screenshots/12_period_closed.png', full_page=True)

        # signer walks the wizard and signs
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'signer@example.com')
        await page.goto(BASE+'/console/certificates/new/lot', wait_until='networkidle'); await page.wait_for_timeout(700)
        await page.check('input[type=radio][name=lot] >> nth=0'); await page.wait_for_timeout(300)
        await page.goto(BASE+'/console/certificates/new/claim', wait_until='networkidle'); await page.wait_for_timeout(300)
        await page.screenshot(path='/app/.browser_screenshots/13_wizard_claim.png', full_page=True)
        await page.goto(BASE+'/console/certificates/new/recipient', wait_until='networkidle'); await page.wait_for_timeout(500)
        await page.check('input[type=radio][name=recipient] >> nth=0'); await page.wait_for_timeout(500)
        await page.goto(BASE+'/console/certificates/new/review', wait_until='networkidle'); await page.wait_for_timeout(1200)
        await page.screenshot(path='/app/.browser_screenshots/14_wizard_review_ready.png', full_page=True)
        await page.fill('input[type=password]', PW)
        await page.click('button:has-text("Sign the certificate")')
        await page.wait_for_timeout(2500)
        body = await page.inner_text('main')
        print('signed banner:', body[:180].replace('\n',' | '))
        await page.screenshot(path='/app/.browser_screenshots/15_signed.png', full_page=True)
        assert 'CERT-DEMO-000001' in body, 'the first SITE-DEMO certificate is CERT-DEMO-000001'

        # withdrawal with blast radius
        await page.goto(BASE+'/console/certificates/CERT-DEMO-000001', wait_until='networkidle'); await page.wait_for_timeout(1200)
        await page.click('button:has-text("Begin a withdrawal")')
        await page.wait_for_timeout(500)
        await page.fill('textarea', 'Collector category corrected after acceptance, discovered on review.')
        blast = await page.inner_text('main')
        assert 'CUS-HELIOS' in blast.replace('\n',' '), 'recipients named by name'
        await page.screenshot(path='/app/.browser_screenshots/16_withdraw_blast.png', full_page=True)
        await page.click('button:has-text("Confirm withdrawal")')
        await page.wait_for_timeout(2000)
        body = await page.inner_text('main')
        print('withdrawal banner:', body[:200].replace('\n',' | '))
        await page.screenshot(path='/app/.browser_screenshots/17_withdrawn.png', full_page=True)

        # public verify now states the withdrawal
        await page.goto(BASE+'/verify/CERT-DEMO-000001', wait_until='networkidle'); await page.wait_for_timeout(500)
        v = await page.inner_text('main')
        assert 'withdrawn' in v.lower(), 'public verify states the withdrawal'
        await page.screenshot(path='/app/.browser_screenshots/18_verify_new.png', full_page=True)

        # auditor exports
        await page.evaluate("() => localStorage.clear()")
        await login(page, 'auditor@example.com')
        await page.goto(BASE+'/console/record', wait_until='networkidle'); await page.wait_for_timeout(1000)
        await page.click('button:has-text("Export the seeded scope")')
        await page.wait_for_selector('text=/export recorded/i', timeout=20000)
        body = (await page.inner_text('main')).lower()
        assert 'export recorded' in body, 'the export is recorded and shown'
        await page.screenshot(path='/app/.browser_screenshots/19_record_export.png', full_page=True)

        # reconciliation surface
        await page.goto(BASE+'/console/reconciliation', wait_until='networkidle'); await page.wait_for_timeout(900)
        await page.screenshot(path='/app/.browser_screenshots/20_reconciliation.png', full_page=True)

        # collectors surface
        await page.goto(BASE+'/console/collectors', wait_until='networkidle'); await page.wait_for_timeout(800)
        c = await page.inner_text('main')
        assert 'Sampling plan for coated streams to be agreed' in c, 'conditional approval carries its condition'
        await page.screenshot(path='/app/.browser_screenshots/21_collectors.png', full_page=True)

        # contracts surface
        await page.goto(BASE+'/console/contracts', wait_until='networkidle'); await page.wait_for_timeout(1000)
        ct = await page.inner_text('main')
        assert 'planned' in ct.lower(), 'the planned site flag carries its word'
        await page.screenshot(path='/app/.browser_screenshots/22_contracts.png', full_page=True)

        # record query
        await page.goto(BASE+'/console/record/queries/refused_allocations', wait_until='networkidle'); await page.wait_for_timeout(800)
        await page.screenshot(path='/app/.browser_screenshots/23_query.png', full_page=True)

        # narrow viewport: genealogy becomes the nested list
        await page.set_viewport_size({'width':360,'height':800})
        await page.goto(BASE+'/console/lots/LOT-N6-0001/genealogy', wait_until='networkidle'); await page.wait_for_timeout(900)
        scroll_w = await page.evaluate("() => document.documentElement.scrollWidth")
        assert scroll_w <= 360, f'narrow viewport must not scroll sideways, got {scroll_w}'
        await page.screenshot(path='/app/.browser_screenshots/24_narrow_genealogy.png', full_page=True)

        await b.close()
    print('JOURNEY2 OK')
    if errs: print('page errors:', errs[:5])

asyncio.run(main())

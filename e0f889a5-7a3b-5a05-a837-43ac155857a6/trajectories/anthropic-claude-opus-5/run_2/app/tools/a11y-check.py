#!/usr/bin/env python3
"""
Accessibility and reduced-motion checks: the contract parts a screenshot cannot
show. Contrast is computed from the actual rendered colours.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4173')
passed = 0
failed = 0


def check(ok, name, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  ok   {name}')
    else:
        failed += 1
        print(f'  FAIL {name} {detail}')


def parse_rgb(value):
    nums = [float(n) for n in re.findall(r'[\d.]+', value)]
    return nums[:3] if len(nums) >= 3 else None


def luminance(rgb):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    l1, l2 = luminance(fg), luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def chromium_path():
    root = '/root/.cache/ms-playwright'
    for entry in sorted(os.listdir(root), reverse=True):
        if entry.startswith('chromium-'):
            candidate = os.path.join(root, entry, 'chrome-linux', 'chrome')
            if os.path.exists(candidate):
                return candidate
    return None


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'], executable_path=chromium_path())

    # ---- reduced motion ----------------------------------------------------
    print('--- reduced motion ---')
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900},
                              reduced_motion='reduce')
    page = ctx.new_page()
    page.goto(BASE, wait_until='networkidle')

    film_display = page.evaluate(
        "getComputedStyle(document.querySelector('.film')).display")
    check(film_display == 'none', f'reduced motion drops the film ({film_display})')

    # The darkening is never removed under reduced motion.
    page.evaluate('window.scrollTo(0, document.body.scrollHeight / 2)')
    page.wait_for_timeout(300)
    veil = float(page.evaluate(
        "getComputedStyle(document.querySelector('[data-veil]')).opacity"))
    check(veil > 0.2, f'the darkening still runs under reduced motion ({veil})')

    paused = page.evaluate("document.querySelector('video')?.paused")
    check(paused is not False, 'the film does not play under reduced motion')
    ctx.close()

    # ---- the skip link is the first focusable element ----------------------
    print('--- keyboard and focus ---')
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page()

    for route in ['/', '/shop', '/cart', '/downloads', '/doctor', '/sign-in']:
        page.goto(f'{BASE}{route}', wait_until='networkidle')
        page.keyboard.press('Tab')
        focused = page.evaluate(
            "document.activeElement ? (document.activeElement.className || '') + '|' "
            "+ (document.activeElement.textContent || '').trim().slice(0, 40) : ''")
        check('skip-link' in focused,
              f'{route}: the skip link is the first focusable element', focused)

    # A visible focus ring that is not the accent.
    page.goto(f'{BASE}/shop', wait_until='networkidle')
    ring = page.evaluate("""() => {
      const a = document.querySelector('main a');
      a.focus();
      const s = getComputedStyle(a);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    }""")
    check(ring['style'] == 'solid' and ring['width'] == '2px',
          f"the focus ring is a 2px solid ring ({ring})")

    accent = page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    check(parse_rgb(ring['color']) != parse_rgb(accent),
          'the focus ring is not the accent')

    # ---- contrast against the surface's own ground -------------------------
    print('--- contrast (WCAG AA) ---')
    samples = page.evaluate("""() => {
      const out = [];
      const bg = (el) => {
        let n = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
          n = n.parentElement;
        }
        return 'rgb(255,255,255)';
      };
      for (const sel of ['h1', '.subtitle', '.price', '.rail a', '.chip', 'body']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const s = getComputedStyle(el);
        out.push({ sel, color: s.color, bg: bg(el), size: s.fontSize, weight: s.fontWeight });
      }
      return out;
    }""")
    for s in samples:
        fg, bg = parse_rgb(s['color']), parse_rgb(s['bg'])
        ratio = contrast(fg, bg)
        size = float(re.findall(r'[\d.]+', s['size'])[0])
        large = size >= 24 or (size >= 18.66 and int(s['weight']) >= 700)
        need = 3.0 if large else 4.5
        check(ratio >= need,
              f"{s['sel']} meets AA ({ratio:.2f}:1, needs {need})")

    # The letter's own dark ground.
    page.goto(BASE, wait_until='networkidle')
    letter = page.evaluate("""() => {
      const el = document.querySelector('.letter-body p');
      const s = getComputedStyle(el);
      return { color: s.color, bg: getComputedStyle(document.body).backgroundColor, size: s.fontSize };
    }""")
    ratio = contrast(parse_rgb(letter['color']), parse_rgb(letter['bg']))
    check(ratio >= 4.5, f"the letter meets AA on its own ground ({ratio:.2f}:1)")

    # ---- icon-only controls carry text labels ------------------------------
    print('--- labels ---')
    page.goto(f'{BASE}/cart', wait_until='networkidle')
    unlabelled = page.evaluate("""() => {
      const bad = [];
      for (const el of document.querySelectorAll('button, a')) {
        const text = (el.textContent || '').trim();
        const label = el.getAttribute('aria-label') || el.getAttribute('title');
        if (!text && !label) bad.push(el.outerHTML.slice(0, 80));
      }
      return bad;
    }""")
    check(len(unlabelled) == 0, f'every control carries a name ({unlabelled})')

    # The cart control's accessible name states the item count.
    page.goto(f'{BASE}/shop', wait_until='networkidle')
    name = page.locator('[data-cart-control]').get_attribute('aria-label')
    check(name and 'item' in name, f'the cart control names its count ({name!r})')

    # ---- the rail marks the current page programmatically ------------------
    current = page.locator('.rail a[aria-current="page"]')
    check(current.count() == 1, 'the rail marks exactly one current entry')
    weight = page.evaluate(
        "getComputedStyle(document.querySelector('.rail a[aria-current=\\\"page\\\"]')).fontWeight")
    check(int(weight) >= 700, f'the current entry is marked with weight too ({weight})')

    ctx.close()
    browser.close()

print()
print(f'passed {passed}, failed {failed}')
sys.exit(1 if failed else 0)


import asyncio, re, sys
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:4173"
CHROME="/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome"
PW="deku-demo-pw-2026"
res=[]
def ck(n,c,d=""):
    res.append((n,bool(c))); print(("  ok   " if c else "  FAIL ")+n+("" if c else "  <- "+str(d)[:160]))

async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path=CHROME)
        ctx=await b.new_context(viewport={"width":1440,"height":960})
        p=await ctx.new_page()

        for route in ["/", "/discover", "/thursday-night-5k", "/running", "/login", "/signup", "/app"]:
            await p.goto(BASE+route, wait_until="networkidle")
            h1 = await p.locator("h1").count()
            ck(f"{route} has exactly one h1", h1==1, f"found {h1}")

        # landmarks
        await p.goto(BASE+"/thursday-night-5k", wait_until="networkidle")
        ck("the event route has a banner landmark", await p.locator("header").count()>0)
        ck("and a main landmark", await p.locator("main").count()>0)

        # focus ring reaches controls and is visible
        await p.goto(BASE+"/discover", wait_until="networkidle")
        await p.keyboard.press("Tab"); await p.keyboard.press("Tab")
        outline = await p.evaluate("""() => {
            const el = document.activeElement;
            if (!el || el===document.body) return null;
            const s = getComputedStyle(el);
            return {tag: el.tagName, outline: s.outlineWidth, color: s.outlineColor};
        }""")
        ck("keyboard focus reaches a control with a visible ring",
           outline and outline["outline"] not in ("0px",""), outline)

        # every icon-only control carries a text name
        await p.goto(BASE+"/", wait_until="networkidle")
        unnamed = await p.evaluate("""() => {
            const out=[];
            document.querySelectorAll('button,a').forEach(el=>{
              const text=(el.innerText||'').trim();
              const label=el.getAttribute('aria-label')||el.getAttribute('title')||'';
              if(!text && !label) out.push(el.outerHTML.slice(0,80));
            });
            return out;
        }""")
        ck("every control carries a text name", not unnamed, unnamed[:2])

        # touch targets
        small = await p.evaluate("""() => {
            const out=[];
            document.querySelectorAll('button,a.btn,input,select').forEach(el=>{
              const r=el.getBoundingClientRect();
              if(r.width>0 && r.height>0 && r.height<44) out.push(el.tagName+':'+Math.round(r.height));
            });
            return out;
        }""")
        ck("tappable controls are comfortably sized", len(small)<=2, small[:4])

        # registration state is a word, not a colour alone
        await p.goto(BASE+"/riverside-winter-time-trial", wait_until="networkidle")
        body=await p.inner_text("body")
        ck("the closed state is carried as words", "Registration Is Closed" in body)

        # reduced motion renders final states
        ctx2=await b.new_context(viewport={"width":1440,"height":960}, reduced_motion="reduce")
        p2=await ctx2.new_page()
        await p2.goto(BASE+"/", wait_until="networkidle")
        word=await p2.locator(".landing-word").first.inner_text()
        ck("under reduced motion the headline still reads", len(word.strip())>0, word)
        await ctx2.close()

        # dark scheme does not touch an event page
        ctx3=await b.new_context(color_scheme="dark", viewport={"width":1440,"height":960})
        p3=await ctx3.new_page()
        await p3.goto(BASE+"/thursday-night-5k", wait_until="networkidle")
        ground=await p3.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()")
        ck("an event page ignores the dark scheme", ground and ground!="#151515", ground)
        await p3.goto(BASE+"/discover", wait_until="networkidle")
        bg=await p3.evaluate("getComputedStyle(document.body).backgroundColor")
        ck("a plain route honours the dark scheme", bg.replace(" ","") in ("rgb(21,21,21)",), bg)
        await ctx3.close()

        await b.close()
    ok=sum(1 for _,c in res if c)
    print(f"\n{ok} passed, {len(res)-ok} failed\n")
    return 0 if ok==len(res) else 1
sys.exit(asyncio.run(main()))

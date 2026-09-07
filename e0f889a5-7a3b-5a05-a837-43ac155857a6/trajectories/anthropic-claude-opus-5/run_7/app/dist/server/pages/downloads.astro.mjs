import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { $ as $$ReleaseBlock } from '../chunks/ReleaseBlock_Dp_QZfVE.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsx } from 'preact/jsx-runtime';
import { a as apiGet, d as formatBytes } from '../chunks/api_D4zreuKm.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

function PlatformNote() {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    const p = `${navigator.userAgentData?.platform || navigator.platform || ""} ${navigator.userAgent || ""}`;
    setMac(/mac/i.test(p));
  }, []);
  if (mac) return null;
  return jsx("p", {
    class: "small muted",
    style: "margin-top:calc(var(--unit)*3)",
    children: "Arranger is a macOS application."
  });
}

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const v = await viewer(Astro2);
  const rel = await apiGet(Astro2.request, "/releases?page_size=100");
  const releases = rel.ok ? rel.data.data : [];
  const newest = releases[0];
  const fw = await apiGet(Astro2.request, "/firmware/manifest?model=compact");
  const firmware = fw.ok ? fw.data.entries[0] : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Downloads</h1> ${!newest ? renderTemplate`<div class="empty"><p>There is nothing to download yet.</p></div>` : renderTemplate`<div> <p class="page-lede">Arranger requires macOS 13.0 or later. Download the app below.</p> <section class="section"> <div class="row" style="gap:calc(var(--unit)*4)"> <a class="btn"${addAttribute(`/downloads/${newest.version}`, "href")}${addAttribute(newest.artifact_name, "download")}>
Download Arranger ${newest.version} </a> <span class="small muted bytes">${formatBytes(newest.size_bytes)}</span> <span class="tiny muted digest" style="word-break:break-all;max-width:44ch">${newest.sha256}</span> </div>  ${renderComponent($$result2, "PlatformNote", PlatformNote, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/PlatformNote.jsx", "client:component-export": "default" })} </section> <section class="section" aria-labelledby="fw-h"> <h2 class="section-title" id="fw-h">Firmware</h2> <div class="row" style="gap:calc(var(--unit)*5);align-items:flex-start"> <div> <a class="btn btn-secondary" href="/downloads" data-firmware>
Download Vela Cricket Firmware ${firmware ? firmware.version : "7.2"} </a> ${firmware && renderTemplate`<p class="small muted" style="margin-top:calc(var(--unit)*2)"> <span class="bytes">${formatBytes(firmware.size_bytes)}</span> <span class="muted"> · needs firmware </span> <span class="version">${firmware.min_firmware}</span> <span class="muted"> or later</span> </p>`} </div>  <div style="max-width:34ch"> <a class="btn-quiet" href="/doctor">Firmware install (web-based)</a> <p class="small muted" style="margin-top:var(--unit)">
Only use this if Arranger cannot see your camera.
</p> </div> </div> </section> <section class="section" aria-labelledby="archive-h"> <h2 class="section-title" id="archive-h">Release archive</h2> ${releases.map((r, i) => renderTemplate`<div> ${i > 0 && renderTemplate`<div class="release-rule" aria-hidden="true"></div>`}  ${renderComponent($$result2, "ReleaseBlock", $$ReleaseBlock, { "release": r, "open": i === 0 })} </div>`)} </section> </div>`}` })} `;
}, "/app/src/pages/downloads/index.astro", void 0);

const $$file = "/app/src/pages/downloads/index.astro";
const $$url = "/downloads";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

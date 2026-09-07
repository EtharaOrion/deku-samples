import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, l as Fragment, n as renderScript } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$ReleaseBlock } from '../chunks/ReleaseBlock_DErLAUmu.mjs';
import { a as apiFetch, b as formatBytes } from '../chunks/api_-Wd5sQnB.mjs';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const { expand } = Astro2.props;
  const [relRes, fwRes] = await Promise.all([
    apiFetch(Astro2, "/api/releases?page_size=100"),
    apiFetch(Astro2, "/api/firmware/manifest?model=compact")
  ]);
  const releases = relRes.status === 200 ? relRes.data.data : [];
  const newest = releases[0] ?? null;
  const firmware = fwRes.status === 200 ? fwRes.data.entries[0] : null;
  const cricket = fwRes.status === 200 ? fwRes.data.product.title : "Vela Cricket";
  const expandVersion = expand ?? (newest ? newest.version : null);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads", "current": "downloads", "description": "Arranger, firmware and the whole release archive." }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Downloads</h1> <p>Arranger requires macOS 13.0 or later. Download the app below.</p> </div> ${!newest && renderTemplate`<p class="empty">There is nothing to download yet.</p>`}${newest && renderTemplate`<section aria-labelledby="app-head"> <h2 class="vh" id="app-head">The application</h2> <div class="dl-primary-row"> <a class="btn"${addAttribute(`/api/releases/${encodeURIComponent(newest.version)}/artifact`, "href")} download data-primary-download>
Download Arranger ${newest.version} </a> <span class="dl-meta"> <span class="bytes">${formatBytes(newest.size_bytes)}</span> bytes
</span> </div> <p class="dl-meta"><span class="digest">${newest.sha256}</span></p> <!-- The primary control adapts to the reader's platform but is never
           disabled and never hidden. --> <p class="dl-meta" data-platform-note hidden>Arranger is a macOS application.</p> ${firmware && renderTemplate`<div class="fw-row"> <div> <a class="btn btn-quiet"${addAttribute(`/api/firmware/${firmware.build}/artifact`, "href")} download>
Download ${cricket} Firmware ${firmware.version} </a> <p class="dl-meta" style="margin-top: 0.5rem">
build <span class="build">${firmware.build}</span> · <span class="bytes">${formatBytes(firmware.size_bytes)}</span> bytes
</p> </div> <div class="fw-web"> <a href="/doctor" class="small">Firmware install (web-based)</a> <p>Only use this if Arranger cannot see your camera.</p> </div> </div>`} </section>`}<div class="archive-rule" aria-hidden="true"></div> <section aria-labelledby="archive-head"> <h2 class="section-head" id="archive-head">Every release</h2> ${releases.length === 0 && renderTemplate`<p class="empty">There are no releases yet.</p>`} ${releases.map((r, i) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate`${i > 0 && renderTemplate`<div class="archive-rule" aria-hidden="true"></div>`}${renderComponent($$result3, "ReleaseBlock", $$ReleaseBlock, { "release": r, "open": r.version === expandVersion })} ` })}`)} </section> ${renderScript($$result2, "/app/src/pages/downloads/index.astro?astro&type=script&index=0&lang.ts")} ` })}`;
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

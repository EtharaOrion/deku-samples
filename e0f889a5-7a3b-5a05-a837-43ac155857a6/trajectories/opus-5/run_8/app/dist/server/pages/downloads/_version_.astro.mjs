import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute, n as renderScript } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$ReleaseBlock } from '../../chunks/ReleaseBlock_DErLAUmu.mjs';
import { a as apiFetch, b as formatBytes } from '../../chunks/api_-Wd5sQnB.mjs';
/* empty css                                     */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const [oneRes, relRes, fwRes] = await Promise.all([
    apiFetch(Astro2, `/api/releases/${encodeURIComponent(version)}`),
    apiFetch(Astro2, "/api/releases?page_size=100"),
    apiFetch(Astro2, "/api/firmware/manifest?model=compact")
  ]);
  const found = oneRes.status === 200;
  const releases = relRes.status === 200 ? relRes.data.data : [];
  const newest = releases[0] ?? null;
  const firmware = fwRes.status === 200 ? fwRes.data.entries[0] : null;
  const cricket = fwRes.status === 200 ? fwRes.data.product.title : "Vela Cricket";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": found ? `Arranger ${version}` : "Downloads", "current": "downloads" }, { "default": async ($$result2) => renderTemplate`${!found && renderTemplate`${maybeRenderHead()}<div class="page-head"> <h1>That release does not exist.</h1> <p><a href="/downloads">Every release we have shipped is here.</a></p> </div>`}${found && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div class="page-head"> <h1>Downloads</h1> <p>Arranger requires macOS 13.0 or later. Download the app below.</p> </div> ${newest && renderTemplate`<section aria-labelledby="app-head"> <h2 class="vh" id="app-head">The application</h2> <div class="dl-primary-row"> <a class="btn"${addAttribute(`/api/releases/${encodeURIComponent(newest.version)}/artifact`, "href")} download>
Download Arranger ${newest.version} </a> <span class="dl-meta"><span class="bytes">${formatBytes(newest.size_bytes)}</span> bytes</span> </div> <p class="dl-meta"><span class="digest">${newest.sha256}</span></p> <p class="dl-meta" data-platform-note hidden>Arranger is a macOS application.</p> ${firmware && renderTemplate`<div class="fw-row"> <div> <a class="btn btn-quiet"${addAttribute(`/api/firmware/${firmware.build}/artifact`, "href")} download>
Download ${cricket} Firmware ${firmware.version} </a> <p class="dl-meta" style="margin-top: 0.5rem">
build <span class="build">${firmware.build}</span> · <span class="bytes">${formatBytes(firmware.size_bytes)}</span> bytes
</p> </div> <div class="fw-web"> <a href="/doctor" class="small">Firmware install (web-based)</a> <p>Only use this if Arranger cannot see your camera.</p> </div> </div>`} </section>`}<div class="archive-rule" aria-hidden="true"></div> <section aria-labelledby="archive-head"> <h2 class="section-head" id="archive-head">Every release</h2> ${releases.map((r, i) => renderTemplate`${renderComponent($$result3, "Fragment", Fragment, {}, { "default": async ($$result4) => renderTemplate`${i > 0 && renderTemplate`<div class="archive-rule" aria-hidden="true"></div>`}${renderComponent($$result4, "ReleaseBlock", $$ReleaseBlock, { "release": r, "open": r.version === version })} ` })}`)} </section> ` })}`}${renderScript($$result2, "/app/src/pages/downloads/[version].astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/app/src/pages/downloads/[version].astro", void 0);

const $$file = "/app/src/pages/downloads/[version].astro";
const $$url = "/downloads/[version]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$version,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, F as Fragment } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
import { $ as $$ReleaseBlock } from '../chunks/ReleaseBlock_CiRhaFGt.mjs';
import { a as apiGet, d as formatBytes } from '../chunks/api_eUbQd3xF.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const viewer = await viewerFor(Astro2.request);
  const [releases, manifest] = await Promise.all([
    apiGet(Astro2.request, "/releases?page_size=100"),
    apiGet(Astro2.request, "/firmware/manifest?model=compact")
  ]);
  const list = releases.ok ? releases.data.data : [];
  const latest = list[0] || null;
  const firmware = manifest.ok ? manifest.data.entries?.[0] : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads \u2014 Vela", "current": "downloads", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-i2rmdg4n>Downloads</h1> ${!releases.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-i2rmdg4n> ${releases.error.message} ${releases.error.request_id && renderTemplate`<span class="mono" data-astro-cid-i2rmdg4n> Reference ${releases.error.request_id}.</span>`} </p>`}${latest && renderTemplate`<section class="primary" aria-labelledby="app-heading" data-astro-cid-i2rmdg4n> <h2 id="app-heading" class="visually-hidden" data-astro-cid-i2rmdg4n>Arranger</h2> <p class="requirement" data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> <div class="primary-row" data-astro-cid-i2rmdg4n> <!-- The primary control adapts to the reader's platform but is never
             disabled and never hidden. --> <a class="btn"${addAttribute(`/downloads/${latest.version}`, "href")}${addAttribute(latest.artifact_name, "download")} data-app-download data-astro-cid-i2rmdg4n>
Download Arranger ${latest.version} </a> <span class="meta" data-astro-cid-i2rmdg4n> <span class="bytes tnum" data-astro-cid-i2rmdg4n>${formatBytes(latest.size_bytes)}</span> <span class="digest mono" data-astro-cid-i2rmdg4n>${latest.sha256}</span> </span> </div> <p class="platform-note" data-platform-note hidden data-astro-cid-i2rmdg4n>Arranger is a macOS application.</p> </section>`}${firmware && renderTemplate`<section class="firmware" aria-labelledby="firmware-heading" data-astro-cid-i2rmdg4n> <h2 id="firmware-heading" data-astro-cid-i2rmdg4n>Firmware</h2> <div class="firmware-row" data-astro-cid-i2rmdg4n> <!-- The ordinary path. --> <a class="btn btn-secondary"${addAttribute(`/api/firmware/manifest?model=compact`, "href")} download data-astro-cid-i2rmdg4n>
Download Vela Cricket Firmware ${firmware.version} </a> <!-- The web path is never the primary control. --> <span class="web-path" data-astro-cid-i2rmdg4n> <a class="quiet-link" href="/doctor" data-astro-cid-i2rmdg4n>Firmware install (web-based)</a> <span class="warning" data-astro-cid-i2rmdg4n>Only use this if Arranger cannot see your camera.</span> </span> </div> </section>`}<section class="archive" aria-labelledby="archive-heading" data-astro-cid-i2rmdg4n> <h2 id="archive-heading" data-astro-cid-i2rmdg4n>Every release</h2> ${list.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-i2rmdg4n><p data-astro-cid-i2rmdg4n>There are no releases yet.</p></div>`} ${list.map((release, i) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result3) => renderTemplate`${i > 0 && renderTemplate`<hr class="dashed-bar" data-astro-cid-i2rmdg4n>`}${renderComponent($$result3, "ReleaseBlock", $$ReleaseBlock, { "release": release, "expanded": i === 0, "data-astro-cid-i2rmdg4n": true })} ` })}`)} </section> ` })}  `;
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

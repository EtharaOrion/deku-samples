import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, g as addAttribute, l as renderScript } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { $ as $$ReleaseBlock } from '../chunks/ReleaseBlock_CMe97rwc.mjs';
import { q as query, h as getProductByHandle } from '../chunks/server_SMyiD-DF.mjs';
import { l as listReleases } from '../chunks/releases_Clz7nfZG.mjs';
import { b as formatBytes } from '../chunks/format_y0Y9nLbA.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

async function newestFirmware(productId) {
  const {
    rows
  } = await query(`SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC LIMIT 1`, [productId]);
  return rows[0] || null;
}

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  let releases = [];
  let failed = false;
  try {
    releases = await listReleases({ limit: null });
  } catch {
    failed = true;
  }
  const newest = releases[0] || null;
  const cricket = await getProductByHandle("compact");
  const firmware = cricket ? await newestFirmware(cricket.id) : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads \u2014 Vela", "description": "Arranger, firmware and the release archive.", "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-i2rmdg4n> <header class="stack stack-4" data-astro-cid-i2rmdg4n> <h1 data-astro-cid-i2rmdg4n>Downloads</h1> <p data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> ${failed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-i2rmdg4n>We could not load the archive. Reload the page to try again.</p>` : newest && renderTemplate`<div class="primary-row" data-astro-cid-i2rmdg4n> <!-- Adapts to the reader's platform but is never disabled and never
               hidden. --> <a class="btn btn-primary"${addAttribute(`/api/downloads/${newest.artifact_name}`, "href")} download data-primary-download data-astro-cid-i2rmdg4n>
Download Arranger ${newest.version} </a> <span class="hint tnum" data-astro-cid-i2rmdg4n>${formatBytes(newest.size_bytes)}</span> <span class="hint ident digest" data-astro-cid-i2rmdg4n>${newest.sha256}</span> </div>`} <!-- A reader who is not on macOS still gets a working control and this
           line, because fetching an installer on a work laptop for a machine at
           home is an ordinary thing to do. --> <p class="hint platform-note" data-platform-note hidden data-astro-cid-i2rmdg4n>Arranger is a macOS application.</p> </header> ${firmware && renderTemplate`<section class="firmware stack stack-3" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Firmware</h2> <div class="firmware-row" data-astro-cid-i2rmdg4n> <a class="btn"${addAttribute(`/api/downloads/firmware/${cricket.handle}/${firmware.version}`, "href")} download data-astro-cid-i2rmdg4n>
Download Vela Cricket Firmware ${firmware.version} </a> <div class="web-path" data-astro-cid-i2rmdg4n> <!-- The web path is never the primary control. --> <a class="quiet-link" href="/doctor" data-astro-cid-i2rmdg4n>Firmware install (web-based)</a> <p class="hint" data-astro-cid-i2rmdg4n>Only use this if Arranger cannot see your camera.</p> </div> </div> </section>`} <section class="archive stack stack-2" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Release archive</h2> ${releases.length === 0 ? renderTemplate`<p class="hint" data-astro-cid-i2rmdg4n>No releases yet.</p>` : renderTemplate`<ol class="release-list" data-astro-cid-i2rmdg4n> ${releases.map((release, i) => renderTemplate`<li data-astro-cid-i2rmdg4n> ${i > 0 && renderTemplate`<div class="separator" aria-hidden="true" data-astro-cid-i2rmdg4n></div>`}  ${renderComponent($$result2, "ReleaseBlock", $$ReleaseBlock, { "release": release, "open": i === 0, "data-astro-cid-i2rmdg4n": true })} </li>`)} </ol>`} </section> </div> ${renderScript($$result2, "/app/src/pages/downloads/index.astro?astro&type=script&index=0&lang.ts")} ` })} `;
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

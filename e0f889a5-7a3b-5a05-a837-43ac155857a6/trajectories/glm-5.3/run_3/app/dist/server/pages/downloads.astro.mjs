import { c as createComponent, d as renderComponent, r as renderTemplate, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../chunks/App_CbKyOZgE.mjs';
import { r as releasesList, f as firmwareFor, b as bytes, l as longDate } from '../chunks/queries_DE4s-KG7.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const releases = await releasesList();
  const latest = releases[0] || null;
  const cricketFirmware = await firmwareFor("compact");
  const newestFw = cricketFirmware[0];
  const expanded = releases.length ? releases[0].version : null;
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const fmtDate = (d) => longDate(String(d).slice(0, 10));
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Downloads", "active": "downloads", "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title" data-astro-cid-i2rmdg4n>Downloads</h1> <section class="block" data-astro-cid-i2rmdg4n> <p class="lede" data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> ${latest && renderTemplate`<div class="latest" data-astro-cid-i2rmdg4n> <div class="latest-row" data-astro-cid-i2rmdg4n> <a class="btn btn-primary"${addAttribute(`/downloads/artifact/${latest.artifact_name}`, "href")} data-platform-adaptive data-astro-cid-i2rmdg4n>Download Arranger ${latest.version}</a> <span class="meta tnum" data-astro-cid-i2rmdg4n>${bytes(latest.size_bytes)}</span> </div> <p class="digest-row" data-astro-cid-i2rmdg4n><span class="digest mono" data-astro-cid-i2rmdg4n>${latest.sha256}</span></p> <p class="platform-note" data-platform-note hidden data-astro-cid-i2rmdg4n>Arranger is a macOS application.</p> </div>`} </section> <section class="block" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Camera firmware</h2> ${newestFw && renderTemplate`<div class="firmware-row" data-astro-cid-i2rmdg4n> <div class="latest-row" data-astro-cid-i2rmdg4n> <a class="btn"${addAttribute(`/downloads/firmware/${newestFw.product_handle}/${newestFw.version}`, "href")} data-astro-cid-i2rmdg4n>Download Vela Cricket Firmware ${newestFw.version}</a> <a class="quiet-link" href="/doctor" data-astro-cid-i2rmdg4n>Firmware install (web-based)</a> </div> <p class="meta" data-astro-cid-i2rmdg4n>Only use this if Arranger cannot see your camera.</p> </div>`} </section> <section class="block archive" aria-label="Release archive" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Every release</h2> ${releases.map((r, i) => renderTemplate`<article class="release" data-astro-cid-i2rmdg4n> <div class="release-rule" data-astro-cid-i2rmdg4n><hr class="rule-dashed" data-astro-cid-i2rmdg4n></div> <details class="release-details"${addAttribute(r.version, "data-release")}${addAttribute(r.version === expanded, "open")} data-astro-cid-i2rmdg4n> <summary data-astro-cid-i2rmdg4n> <span class="release-title" data-astro-cid-i2rmdg4n>Arranger <span class="mono" data-astro-cid-i2rmdg4n>${r.version}</span></span> <span class="release-date" data-astro-cid-i2rmdg4n>Released on ${fmtDate(r.released_on)}</span> <span class="release-build" data-astro-cid-i2rmdg4n>build <span class="mono tnum" data-astro-cid-i2rmdg4n>${r.build}</span></span> <a class="btn btn-sm"${addAttribute(`/downloads/artifact/${r.artifact_name}`, "href")} data-astro-cid-i2rmdg4n>Download</a> </summary> <div class="release-body" data-astro-cid-i2rmdg4n> <p class="release-desc" data-astro-cid-i2rmdg4n>${r.description}</p> ${GROUPS.map((g) => r.notes && r.notes[g] && r.notes[g].length && renderTemplate`<section class="note-group" data-astro-cid-i2rmdg4n> <h3 data-astro-cid-i2rmdg4n>${g}</h3> <ul data-astro-cid-i2rmdg4n>${r.notes[g].map((n) => renderTemplate`<li data-astro-cid-i2rmdg4n>${n}</li>`)}</ul> </section>`)} <p class="release-sign" data-astro-cid-i2rmdg4n>The Vela team.</p> <p class="digest-row" data-astro-cid-i2rmdg4n>Digest <span class="digest mono" data-astro-cid-i2rmdg4n>${r.sha256}</span>, size <span class="tnum" data-astro-cid-i2rmdg4n>${bytes(r.size_bytes)}</span>.</p> </div> </details> </article>`)} ${releases.length === 0 && renderTemplate`<p class="empty-note" data-astro-cid-i2rmdg4n>No releases yet.</p>`} </section> ` })}  `;
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

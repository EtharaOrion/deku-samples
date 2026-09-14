import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
import { r as releasesList, b as bytes, l as longDate } from '../../chunks/queries_DE4s-KG7.mjs';
/* empty css                                        */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const releases = await releasesList();
  const { version } = Astro2.params;
  const expanded = releases.find((r) => r.version === version) || null;
  const valid = !!expanded;
  if (!valid) Astro2.response.status = 404;
  const latest = releases[0] || null;
  const cricketFirmware = await firmwareForSafe("compact");
  const newestFw = cricketFirmware[0];
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const fmtDate = (d) => longDate(String(d).slice(0, 10));
  async function firmwareForSafe(h) {
    const { firmwareFor } = await import('../../chunks/queries_DE4s-KG7.mjs').then(n => n.q);
    try {
      return await firmwareFor(h);
    } catch {
      return [];
    }
  }
  return renderTemplate`${!valid ? renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Not found", "active": "downloads", "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate`${maybeRenderHead()}<h1 class="page-title" data-astro-cid-63uv547v>That page does not exist.</h1><p data-astro-cid-63uv547v><a class="btn" href="/downloads" data-astro-cid-63uv547v>Back to the downloads</a></p>` })}` : renderTemplate`${renderComponent($$result, "App", $$App, { "title": `Arranger ${expanded.version}`, "active": "downloads", "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate`<h1 class="page-title" data-astro-cid-63uv547v>Downloads</h1><section class="block" data-astro-cid-63uv547v><p class="lede" data-astro-cid-63uv547v>Arranger requires macOS 13.0 or later. Download the app below.</p>${latest && renderTemplate`<div class="latest" data-astro-cid-63uv547v><div class="latest-row" data-astro-cid-63uv547v><a class="btn btn-primary"${addAttribute(`/downloads/artifact/${latest.artifact_name}`, "href")} data-platform-adaptive data-astro-cid-63uv547v>Download Arranger ${latest.version}</a><span class="meta tnum" data-astro-cid-63uv547v>${bytes(latest.size_bytes)}</span></div><p class="digest-row" data-astro-cid-63uv547v><span class="digest mono" data-astro-cid-63uv547v>${latest.sha256}</span></p><p class="platform-note" data-platform-note hidden data-astro-cid-63uv547v>Arranger is a macOS application.</p></div>`}</section><section class="block" data-astro-cid-63uv547v><h2 data-astro-cid-63uv547v>Camera firmware</h2>${newestFw && renderTemplate`<div class="firmware-row" data-astro-cid-63uv547v><div class="latest-row" data-astro-cid-63uv547v><a class="btn"${addAttribute(`/downloads/firmware/${newestFw.product_handle}/${newestFw.version}`, "href")} data-astro-cid-63uv547v>Download Vela Cricket Firmware ${newestFw.version}</a><a class="quiet-link" href="/doctor" data-astro-cid-63uv547v>Firmware install (web-based)</a></div><p class="meta" data-astro-cid-63uv547v>Only use this if Arranger cannot see your camera.</p></div>`}</section><section class="block archive" aria-label="Release archive" data-astro-cid-63uv547v><h2 data-astro-cid-63uv547v>Every release</h2>${releases.map((r) => renderTemplate`<article class="release" data-astro-cid-63uv547v><div class="release-rule" data-astro-cid-63uv547v><hr class="rule-dashed" data-astro-cid-63uv547v></div><details class="release-details"${addAttribute(r.version, "data-release")}${addAttribute(r.version === expanded.version, "open")} data-astro-cid-63uv547v><summary data-astro-cid-63uv547v><span class="release-title" data-astro-cid-63uv547v>Arranger <span class="mono" data-astro-cid-63uv547v>${r.version}</span></span><span class="release-date" data-astro-cid-63uv547v>Released on ${fmtDate(r.released_on)}</span><span class="release-build" data-astro-cid-63uv547v>build <span class="mono tnum" data-astro-cid-63uv547v>${r.build}</span></span><a class="btn btn-sm"${addAttribute(`/downloads/artifact/${r.artifact_name}`, "href")} data-astro-cid-63uv547v>Download</a></summary><div class="release-body" data-astro-cid-63uv547v><p class="release-desc" data-astro-cid-63uv547v>${r.description}</p>${GROUPS.map((g) => r.notes && r.notes[g] && r.notes[g].length && renderTemplate`<section class="note-group" data-astro-cid-63uv547v><h3 data-astro-cid-63uv547v>${g}</h3><ul data-astro-cid-63uv547v>${r.notes[g].map((n) => renderTemplate`<li data-astro-cid-63uv547v>${n}</li>`)}</ul></section>`)}<p class="release-sign" data-astro-cid-63uv547v>The Vela team.</p><p class="digest-row" data-astro-cid-63uv547v>Digest <span class="digest mono" data-astro-cid-63uv547v>${r.sha256}</span>, size <span class="tnum" data-astro-cid-63uv547v>${bytes(r.size_bytes)}</span>.</p></div></details></article>`)}</section>` })}`}`;
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

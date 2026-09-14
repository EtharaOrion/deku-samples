import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, n as Fragment, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
import { listReleases, latestFirmware } from "../chunks/releases_B2Vn5YuN.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const releases = await listReleases();
  const newest = releases[0] ?? null;
  const cricketFirmware = await latestFirmware("compact");
  function bytes(n) {
    const mb = n / (1024 * 1024);
    return mb >= 1e3 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  }
  function formatDate(iso) {
    return (/* @__PURE__ */ new Date(`${iso}T00:00:00Z`)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Downloads — Vela", "heading": "Downloads", "active": "downloads", "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="downloads" data-astro-cid-i2rmdg4n> <section class="app" data-astro-cid-i2rmdg4n> <p class="lede" data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> <div class="primary card" data-astro-cid-i2rmdg4n> ${newest && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result3) => renderTemplate` <a class="btn btn--primary"${addAttribute(`/downloads/artifact/${newest.artifact_name}`, "href")} data-download-latest download data-astro-cid-i2rmdg4n>
Download Arranger ${newest.version} </a> <p class="field-hint" data-astro-cid-i2rmdg4n>Arranger is a macOS application.</p> <dl class="meta tnum" data-astro-cid-i2rmdg4n> <dt data-astro-cid-i2rmdg4n>Size</dt><dd class="size" data-astro-cid-i2rmdg4n>${bytes(newest.size_bytes)}</dd> <dt data-astro-cid-i2rmdg4n>Build</dt><dd class="build mono" data-astro-cid-i2rmdg4n>${newest.build}</dd> <dt data-astro-cid-i2rmdg4n>SHA-256</dt><dd class="digest mono" data-astro-cid-i2rmdg4n>${newest.sha256}</dd> </dl> ` })}`} </div> </section> <section class="firmware card" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Firmware</h2> ${cricketFirmware && renderTemplate`<div class="firmware__row" data-astro-cid-i2rmdg4n> <a class="btn" href="/downloads/firmware/compact/{cricketFirmware.version}" download data-astro-cid-i2rmdg4n>Download Vela Cricket Firmware ${cricketFirmware.version}</a> <p class="field-hint" data-astro-cid-i2rmdg4n>
Firmware install (web-based) — <a href="/doctor" data-astro-cid-i2rmdg4n>use the browser installer</a>.<br data-astro-cid-i2rmdg4n>
Only use this if Arranger cannot see your camera.
</p> </div>`} </section> <section class="archive" aria-label="Release archive" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Every release</h2> <ul class="releases" data-astro-cid-i2rmdg4n> ${releases.map((r, i) => renderTemplate`<li class="release" data-astro-cid-i2rmdg4n> <details class="release__details"${addAttribute(i === 0, "open")} data-release-details${addAttribute(r.version, "data-version")} data-astro-cid-i2rmdg4n> <summary data-astro-cid-i2rmdg4n> <span class="release__head" data-astro-cid-i2rmdg4n> <span class="release__title" data-astro-cid-i2rmdg4n>Arranger ${r.version}</span> <span class="release__date tnum" data-astro-cid-i2rmdg4n>Released on ${formatDate(r.released_on)}</span> <span class="release__download" data-astro-cid-i2rmdg4n><a class="btn"${addAttribute(`/downloads/artifact/${r.artifact_name}`, "href")} download data-astro-cid-i2rmdg4n>Download</a></span> </span> </summary> <div class="release__body" data-astro-cid-i2rmdg4n> <p class="release__meta tnum" data-astro-cid-i2rmdg4n> <span class="size" data-astro-cid-i2rmdg4n>${bytes(r.size_bytes)}</span> · <span class="build mono" data-astro-cid-i2rmdg4n>build ${r.build}</span> ·
<span class="digest mono" data-astro-cid-i2rmdg4n>${r.sha256}</span> </p> ${r.description && renderTemplate`<p class="release__description" data-astro-cid-i2rmdg4n>${r.description}</p>`} ${r.notes.map((group) => renderTemplate`<section class="note-group" data-astro-cid-i2rmdg4n> <h3 data-astro-cid-i2rmdg4n>${group.group}</h3> <ul data-astro-cid-i2rmdg4n> ${group.items.map((item) => renderTemplate`<li data-astro-cid-i2rmdg4n>${item}</li>`)} </ul> </section>`)} <p class="release__signoff" data-astro-cid-i2rmdg4n>The Vela team.</p> </div> </details> <a class="release__permalink"${addAttribute(`/downloads/${r.version}`, "href")} data-astro-cid-i2rmdg4n>Permalink</a> </li>`)} </ul> </section> </div> ` })} `;
}, "/app/src/pages/downloads/index.astro", void 0);
const $$file = "/app/src/pages/downloads/index.astro";
const $$url = "/downloads";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, u as unescapeHTML } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { q, one } from "../chunks/index_CC0DBeZe.mjs";
import { D as DownloadButton } from "../chunks/DownloadButton_vXGtsvXl.mjs";
import { currentCustomer } from "../chunks/session_C_3CDjrl.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2.request);
  if (customer && latest) {
    await q(
      `INSERT INTO customer_app_seen (customer_id, build) VALUES ($1, $2)
           ON CONFLICT (customer_id) DO UPDATE SET build = GREATEST(customer_app_seen.build, EXCLUDED.build), seen_at = now()`,
      [customer.id, latest.build]
    );
  }
  const releases = await q("SELECT * FROM app_release ORDER BY build DESC");
  const latest = releases[0] || null;
  const focus = Astro2.url.searchParams.get("v");
  const expandedDefault = focus && releases.find((r) => r.version === focus) ? focus : latest?.version;
  const fmtBytes = (b) => `${Number(b).toLocaleString("en-US")} bytes`;
  const cricketFw = await one(
    `SELECT f.version, f.build FROM firmware f JOIN product p ON p.id = f.product_id
   WHERE p.handle = 'compact' AND f.channel = 'general' ORDER BY f.build DESC LIMIT 1`
  );
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const renderNote = (n) => String(n).replace(/#(\d+)/g, '<span class="ref">#$1</span>');
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Downloads", "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-i2rmdg4n>Downloads</h1> <section class="card hero" data-astro-cid-i2rmdg4n> <p data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> ${latest ? renderTemplate`<p class="dl-row" data-astro-cid-i2rmdg4n> ${renderComponent($$result2, "DownloadButton", DownloadButton, { "client:load": true, "label": `Download Arranger ${latest.version}`, "artifact": latest.artifact_name, "version": latest.version, "client:component-hydration": "load", "client:component-path": "@components/DownloadButton.jsx", "client:component-export": "default", "data-astro-cid-i2rmdg4n": true })} <span class="muted small tnum" data-astro-cid-i2rmdg4n>${fmtBytes(latest.size_bytes)}</span> <span class="muted small mono digest" data-astro-cid-i2rmdg4n>${latest.sha256}</span> </p>` : null} </section> <section class="card fw" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>Firmware</h2> ${cricketFw ? renderTemplate`<p class="dl-row" data-astro-cid-i2rmdg4n> <a class="btn" href="/api/firmware/manifest?model=vela-cricket"${addAttribute(`vela-cricket-firmware-${cricketFw.version}.bin`, "download")} data-astro-cid-i2rmdg4n>Download Vela Cricket Firmware ${cricketFw.version}</a> <span class="muted small" data-astro-cid-i2rmdg4n>Firmware install (web-based): <a href="/doctor" data-astro-cid-i2rmdg4n>use the installer</a>. Only use this if Arranger cannot see your camera.</span> </p>` : renderTemplate`<p class="muted" data-astro-cid-i2rmdg4n>No firmware is published yet.</p>`} </section> <section aria-label="Release archive" data-astro-cid-i2rmdg4n> <h2 data-astro-cid-i2rmdg4n>The archive</h2> <p class="muted small" data-astro-cid-i2rmdg4n>Newest build first. Release dates are not a sort key.</p> ${releases.length === 0 ? renderTemplate`<p data-astro-cid-i2rmdg4n>No releases yet.</p>` : null} ${releases.map((r, idx) => renderTemplate`<div class="release-sep" aria-hidden="true" data-astro-cid-i2rmdg4n></div>
      <details class="release"${addAttribute(r.version === expandedDefault, "open")}${addAttribute(`arranger-${r.version}`, "id")} data-astro-cid-i2rmdg4n> <summary data-astro-cid-i2rmdg4n> <span class="tri" aria-hidden="true" data-astro-cid-i2rmdg4n>${r.version === expandedDefault ? "▾" : "▸"}</span> <span data-astro-cid-i2rmdg4n>Arranger ${r.version}</span> <span class="muted small" data-astro-cid-i2rmdg4n>Released on ${new Date(r.released_on).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span> </summary> <div class="release-body" data-astro-cid-i2rmdg4n> <p class="dl-row" data-astro-cid-i2rmdg4n> ${renderComponent($$result2, "DownloadButton", DownloadButton, { "client:load": true, "label": `Download Arranger ${r.version}`, "artifact": r.artifact_name, "version": r.version, "client:component-hydration": "load", "client:component-path": "@components/DownloadButton.jsx", "client:component-export": "default", "data-astro-cid-i2rmdg4n": true })} <span class="muted small tnum" data-astro-cid-i2rmdg4n>${fmtBytes(r.size_bytes)}</span> <span class="muted small mono digest" data-astro-cid-i2rmdg4n>${r.sha256}</span> </p> ${r.description ? renderTemplate`<p data-astro-cid-i2rmdg4n>${r.description}</p>` : null} ${GROUPS.map((g) => r.notes && r.notes[g] && r.notes[g].length ? renderTemplate`<div class="note-group" data-astro-cid-i2rmdg4n> <h3 data-astro-cid-i2rmdg4n>${g}</h3> <ul data-astro-cid-i2rmdg4n> ${r.notes[g].map((n) => renderTemplate`<li data-astro-cid-i2rmdg4n>${unescapeHTML(renderNote(n))}</li>`)} </ul> </div>` : null)} <p class="muted small" data-astro-cid-i2rmdg4n>The Vela team.</p> <p class="muted small" data-astro-cid-i2rmdg4n><a${addAttribute(`/downloads/${r.version}`, "href")} data-astro-cid-i2rmdg4n>Permalink for Arranger ${r.version}</a></p> </div> </details>`)} </section> ` })} `;
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

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, u as unescapeHTML } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { q } from "../../chunks/index_CC0DBeZe.mjs";
import { D as DownloadButton } from "../../chunks/DownloadButton_vXGtsvXl.mjs";
/* empty css                                    */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const version = Astro2.params.version;
  const releases = await q("SELECT * FROM app_release ORDER BY build DESC");
  const current = releases.find((r) => r.version === version);
  if (!current) return Astro2.redirect("/404");
  const fmtBytes = (b) => `${Number(b).toLocaleString("en-US")} bytes`;
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const renderNote = (n) => String(n).replace(/#(\d+)/g, '<span class="ref">#$1</span>');
  const date = (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": `Arranger ${current.version}`, "data-astro-cid-uhrl72me": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" data-astro-cid-uhrl72me><a href="/downloads" data-astro-cid-uhrl72me>Downloads</a> / <span data-astro-cid-uhrl72me>Arranger ${current.version}</span></nav> <h1 data-astro-cid-uhrl72me>Arranger ${current.version}</h1> <p class="muted" data-astro-cid-uhrl72me>Released on ${date(current.released_on)}. Build <span class="mono tnum" data-astro-cid-uhrl72me>${current.build}</span>.</p> <p class="dl-row" data-astro-cid-uhrl72me> ${renderComponent($$result2, "DownloadButton", DownloadButton, { "client:load": true, "label": `Download Arranger ${current.version}`, "artifact": current.artifact_name, "version": current.version, "client:component-hydration": "load", "client:component-path": "@components/DownloadButton.jsx", "client:component-export": "default", "data-astro-cid-uhrl72me": true })} <span class="muted small tnum" data-astro-cid-uhrl72me>${fmtBytes(current.size_bytes)}</span> <span class="muted small mono digest" data-astro-cid-uhrl72me>${current.sha256}</span> </p> ${current.description ? renderTemplate`<p data-astro-cid-uhrl72me>${current.description}</p>` : null}${GROUPS.map((g) => current.notes && current.notes[g] && current.notes[g].length ? renderTemplate`<div class="note-group" data-astro-cid-uhrl72me> <h2 data-astro-cid-uhrl72me>${g}</h2> <ul data-astro-cid-uhrl72me>${current.notes[g].map((n) => renderTemplate`<li data-astro-cid-uhrl72me>${unescapeHTML(renderNote(n))}</li>`)}</ul> </div>` : null)}<p class="muted small" data-astro-cid-uhrl72me>The Vela team.</p> <div class="release-sep" data-astro-cid-uhrl72me></div> <h2 data-astro-cid-uhrl72me>Every release</h2> ${releases.filter((r) => r.version !== current.version).map((r) => renderTemplate`<details class="release" data-astro-cid-uhrl72me> <summary data-astro-cid-uhrl72me> <span class="tri" aria-hidden="true" data-astro-cid-uhrl72me>▸</span> <span data-astro-cid-uhrl72me>Arranger ${r.version}</span> <span class="muted small" data-astro-cid-uhrl72me>Released on ${date(r.released_on)}</span> </summary> <div class="release-body" data-astro-cid-uhrl72me> <p class="dl-row" data-astro-cid-uhrl72me> ${renderComponent($$result2, "DownloadButton", DownloadButton, { "client:load": true, "label": `Download Arranger ${r.version}`, "artifact": r.artifact_name, "version": r.version, "client:component-hydration": "load", "client:component-path": "@components/DownloadButton.jsx", "client:component-export": "default", "data-astro-cid-uhrl72me": true })} <span class="muted small tnum" data-astro-cid-uhrl72me>${fmtBytes(r.size_bytes)}</span> <span class="muted small mono digest" data-astro-cid-uhrl72me>${r.sha256}</span> </p> ${GROUPS.map((g) => r.notes && r.notes[g] && r.notes[g].length ? renderTemplate`<div class="note-group" data-astro-cid-uhrl72me><h3 data-astro-cid-uhrl72me>${g}</h3><ul data-astro-cid-uhrl72me>${r.notes[g].map((n) => renderTemplate`<li data-astro-cid-uhrl72me>${unescapeHTML(renderNote(n))}</li>`)}</ul></div>` : null)} <p class="muted small" data-astro-cid-uhrl72me>The Vela team.</p> </div> </details>`)}` })} `;
}, "/app/src/pages/downloads/[version]/index.astro", void 0);
const $$file = "/app/src/pages/downloads/[version]/index.astro";
const $$url = "/downloads/[version]";
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { listReleases } from "../../chunks/releases_B2Vn5YuN.mjs";
/* empty css                                        */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const releases = await listReleases();
  const wanted = releases.find((r) => r.version === version) ?? null;
  if (!wanted) return Astro2.redirect("/404");
  function bytes(n) {
    const mb = n / (1024 * 1024);
    return mb >= 1e3 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  }
  function formatDate(iso) {
    return (/* @__PURE__ */ new Date(`${iso}T00:00:00Z`)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  }
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": `Arranger ${wanted.version} — Vela`, "heading": `Arranger ${wanted.version}`, "active": "downloads", "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="downloads" data-astro-cid-63uv547v> <article class="release card" data-astro-cid-63uv547v> <p class="release__date tnum" data-astro-cid-63uv547v>Released on ${formatDate(wanted.released_on)}</p> <a class="btn btn--primary"${addAttribute(`/downloads/artifact/${wanted.artifact_name}`, "href")} download data-astro-cid-63uv547v>Download</a> <p class="release__meta tnum" data-astro-cid-63uv547v> <span class="size" data-astro-cid-63uv547v>${bytes(wanted.size_bytes)}</span> · <span class="build mono" data-astro-cid-63uv547v>build ${wanted.build}</span> ·
<span class="digest mono" data-astro-cid-63uv547v>${wanted.sha256}</span> </p> ${wanted.description && renderTemplate`<p class="release__description" data-astro-cid-63uv547v>${wanted.description}</p>`} ${wanted.notes.map((group) => renderTemplate`<section class="note-group" data-astro-cid-63uv547v> <h2 data-astro-cid-63uv547v>${group.group}</h2> <ul data-astro-cid-63uv547v>${group.items.map((item) => renderTemplate`<li data-astro-cid-63uv547v>${item}</li>`)}</ul> </section>`)} <p class="release__signoff" data-astro-cid-63uv547v>The Vela team.</p> </article> <section class="others" data-astro-cid-63uv547v> <h2 data-astro-cid-63uv547v>Other releases</h2> <ul data-astro-cid-63uv547v> ${releases.filter((r) => r.version !== wanted.version).map((r) => renderTemplate`<li data-astro-cid-63uv547v><a${addAttribute(`/downloads/${r.version}`, "href")} data-astro-cid-63uv547v>Arranger ${r.version}</a> <span class="field-hint" data-astro-cid-63uv547v>Released on ${formatDate(r.released_on)}</span></li>`)} </ul> <p data-astro-cid-63uv547v><a href="/downloads" data-astro-cid-63uv547v>The whole archive</a></p> </section> </div> ` })} `;
}, "/app/src/pages/downloads/[version].astro", void 0);
const $$file = "/app/src/pages/downloads/[version].astro";
const $$url = "/downloads/[version]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$version,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

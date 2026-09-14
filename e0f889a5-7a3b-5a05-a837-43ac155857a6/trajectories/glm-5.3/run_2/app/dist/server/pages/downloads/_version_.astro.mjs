import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, u as unescapeHTML, a as addAttribute } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { a as listReleases, o as orderedNotes } from "../../chunks/releases_CuqIRam6.mjs";
import { b as bytesExact } from "../../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                        */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const { rows } = await listReleases(200, null);
  const current = rows.find((r) => r.version === Astro2.params.version) ?? null;
  rows[0] ?? null;
  function notesOf(row) {
    const parsed = typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes;
    return orderedNotes(parsed);
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Arranger ${current?.version ?? ""} — Vela`, "active": "downloads", "cartCount": cartCount, "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" data-astro-cid-63uv547v><a href="/downloads" data-astro-cid-63uv547v>Downloads</a> <span aria-hidden="true" data-astro-cid-63uv547v>/</span> <span data-astro-cid-63uv547v>Arranger ${current?.version}</span></nav> ${current ? renderTemplate`<article class="card release-page" data-astro-cid-63uv547v> <h1 data-astro-cid-63uv547v>Arranger <span class="mono" data-astro-cid-63uv547v>${current.version}</span></h1> <p class="date" data-astro-cid-63uv547v>Released on ${new Date(current.released_on).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })} · build <span class="mono" data-astro-cid-63uv547v>${current.build}</span></p> <a class="btn btn-primary" href="/download/arranger/{current.artifact_name}" data-astro-cid-63uv547v>Download Arranger ${current.version}</a> <dl class="release-meta" data-astro-cid-63uv547v> <div data-astro-cid-63uv547v><dt data-astro-cid-63uv547v>Size</dt><dd class="num" data-astro-cid-63uv547v>${bytesExact(Number(current.size_bytes))}</dd></div> <div data-astro-cid-63uv547v><dt data-astro-cid-63uv547v>Artifact</dt><dd class="mono" data-astro-cid-63uv547v>${current.artifact_name}</dd></div> <div data-astro-cid-63uv547v><dt data-astro-cid-63uv547v>Digest</dt><dd class="mono digest" data-astro-cid-63uv547v>${current.sha256}</dd></div> </dl> <p class="desc" data-astro-cid-63uv547v>${current.description}</p> <div class="note-groups" data-astro-cid-63uv547v> ${notesOf(current).map((g) => renderTemplate`<section class="note-group" data-astro-cid-63uv547v> <h2 data-astro-cid-63uv547v>${g.title}</h2> <ul data-astro-cid-63uv547v>${g.items.map((i) => renderTemplate`<li data-astro-cid-63uv547v>${unescapeHTML(i.replace(/\[(#\d+)\]/g, '<span class="mono issue">$1</span>'))}</li>`)}</ul> </section>`)} </div> <p class="signoff" data-astro-cid-63uv547v>The Vela team.</p> </article>` : renderTemplate`<div class="empty" data-astro-cid-63uv547v> <p data-astro-cid-63uv547v>That page does not exist.</p> <a class="btn" href="/downloads" data-astro-cid-63uv547v>See every release</a> </div>`}<section class="others" data-astro-cid-63uv547v> <h2 data-astro-cid-63uv547v>Other releases</h2> <ul data-astro-cid-63uv547v> ${rows.filter((r) => r.version !== current?.version).map((r) => renderTemplate`<li data-astro-cid-63uv547v><a${addAttribute(`/downloads/${r.version}`, "href")} data-astro-cid-63uv547v>Arranger <span class="mono" data-astro-cid-63uv547v>${r.version}</span></a> <span class="num muted" data-astro-cid-63uv547v>${r.build}</span></li>`)} </ul> </section> ` })} `;
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

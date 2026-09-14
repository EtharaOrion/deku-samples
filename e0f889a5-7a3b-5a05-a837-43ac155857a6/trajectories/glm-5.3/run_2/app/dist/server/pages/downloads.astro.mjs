import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute, u as unescapeHTML } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
import { a as listReleases, o as orderedNotes } from "../chunks/releases_CuqIRam6.mjs";
import { b as bytesExact } from "../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../chunks/context_Bm1YOHfv.mjs";
import { p as productByHandle } from "../chunks/catalog_BnA2aLlY.mjs";
import { f as firmwareForProduct } from "../chunks/flash_ChrB-_fE.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const { rows: releases } = await listReleases(200, null);
  const newest = releases[0] ?? null;
  const expandedVersion = Astro2.url.pathname.split("/")[2] || "";
  const cricket = await productByHandle("compact");
  const cricketFirmware = cricket ? await firmwareForProduct(cricket.id) : [];
  const latestFirmware = cricketFirmware.filter((f) => f.channel === "general")[0] ?? cricketFirmware[0] ?? null;
  function notesOf(row) {
    const parsed = typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes;
    return orderedNotes(parsed);
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads — Vela", "active": "downloads", "cartCount": cartCount, "data-astro-cid-i2rmdg4n": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-i2rmdg4n> <h1 data-astro-cid-i2rmdg4n>Downloads</h1> </div> <section class="card app-block" aria-labelledby="app-h" data-astro-cid-i2rmdg4n> <h2 id="app-h" data-astro-cid-i2rmdg4n>Arranger</h2> <p class="app-req" data-astro-cid-i2rmdg4n>Arranger requires macOS 13.0 or later. Download the app below.</p> <div class="download-row" data-astro-cid-i2rmdg4n> <a class="btn btn-primary" href="/download/arranger/{newest?.artifact_name ?? ''}" data-platform-download data-astro-cid-i2rmdg4n>Download Arranger ${newest?.version ?? ""}</a> <p class="app-note" data-platform-note hidden data-astro-cid-i2rmdg4n>Arranger is a macOS application.</p> <span class="meta" data-astro-cid-i2rmdg4n> <span class="num" data-astro-cid-i2rmdg4n>${newest ? bytesExact(Number(newest.size_bytes)) : ""}</span> <span class="mono digest" data-astro-cid-i2rmdg4n>${newest?.sha256 ?? ""}</span> </span> </div> </section> <section class="card firmware-block" aria-labelledby="fw-h" data-astro-cid-i2rmdg4n> <h2 id="fw-h" data-astro-cid-i2rmdg4n>Vela Cricket firmware</h2> <div class="download-row" data-astro-cid-i2rmdg4n> <a class="btn btn-primary" href="/download/firmware/{latestFirmware ? \`cricket-\${latestFirmware.version}.bin\` : ''}" data-astro-cid-i2rmdg4n>Download Vela Cricket Firmware ${latestFirmware?.version ?? ""}</a> <span class="meta" data-astro-cid-i2rmdg4n> <span class="num" data-astro-cid-i2rmdg4n>${latestFirmware ? bytesExact(Number(latestFirmware.size_bytes)) : ""}</span> <span class="mono digest" data-astro-cid-i2rmdg4n>${latestFirmware?.sha256 ?? ""}</span> </span> </div> <p class="alt-path" data-astro-cid-i2rmdg4n>
Firmware install (web-based).
<span class="alt-warning" data-astro-cid-i2rmdg4n>Only use this if Arranger cannot see your camera.</span> <a href="/doctor" data-astro-cid-i2rmdg4n>Open the web installer</a> </p> </section> <section aria-labelledby="archive-h" class="archive" data-astro-cid-i2rmdg4n> <h2 id="archive-h" data-astro-cid-i2rmdg4n>Every release</h2> ${releases.map((row, i) => {
    const open = expandedVersion === row.version || !expandedVersion && i === 0;
    const groups = notesOf(row);
    return renderTemplate`<article class="release" data-astro-cid-i2rmdg4n> <div class="release-bar" aria-hidden="true" data-astro-cid-i2rmdg4n></div> <details class="release-details"${addAttribute(open, "open")}${addAttribute(row.version, "data-version")} data-astro-cid-i2rmdg4n> <summary data-astro-cid-i2rmdg4n> <span class="release-title" data-astro-cid-i2rmdg4n>Arranger <span class="mono" data-astro-cid-i2rmdg4n>${row.version}</span></span> <span class="release-date" data-astro-cid-i2rmdg4n>Released on ${new Date(row.released_on).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</span> <span class="release-build num" data-astro-cid-i2rmdg4n>build <span class="mono" data-astro-cid-i2rmdg4n>${row.build}</span></span> <a class="btn release-dl" href="/download/arranger/{row.artifact_name}" data-dl-stop data-astro-cid-i2rmdg4n>Download</a> </summary> <div class="release-body" data-astro-cid-i2rmdg4n> <p class="release-desc" data-astro-cid-i2rmdg4n>${row.description}</p> <dl class="release-meta" data-astro-cid-i2rmdg4n> <div data-astro-cid-i2rmdg4n><dt data-astro-cid-i2rmdg4n>Size</dt><dd class="num" data-astro-cid-i2rmdg4n>${bytesExact(Number(row.size_bytes))}</dd></div> <div data-astro-cid-i2rmdg4n><dt data-astro-cid-i2rmdg4n>Artifact</dt><dd class="mono" data-astro-cid-i2rmdg4n>${row.artifact_name}</dd></div> <div data-astro-cid-i2rmdg4n><dt data-astro-cid-i2rmdg4n>Digest</dt><dd class="mono digest" data-astro-cid-i2rmdg4n>${row.sha256}</dd></div> </dl> <div class="note-groups" data-astro-cid-i2rmdg4n> ${groups.map((g) => renderTemplate`<section class="note-group" data-astro-cid-i2rmdg4n> <h3 data-astro-cid-i2rmdg4n>${g.title}</h3> <ul data-astro-cid-i2rmdg4n> ${g.items.map((item) => renderTemplate`<li data-astro-cid-i2rmdg4n>${unescapeHTML(item.replace(/\[(#\d+)\]/g, '<span class="mono issue">$1</span>'))}</li>`)} </ul> </section>`)} </div> <p class="release-signoff" data-astro-cid-i2rmdg4n>The Vela team.</p> <p class="release-permalink" data-astro-cid-i2rmdg4n><a${addAttribute(`/downloads/${row.version}`, "href")} data-astro-cid-i2rmdg4n>This release has its own address</a></p> </div> </details> </article>`;
  })} </section> ` })}  `;
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

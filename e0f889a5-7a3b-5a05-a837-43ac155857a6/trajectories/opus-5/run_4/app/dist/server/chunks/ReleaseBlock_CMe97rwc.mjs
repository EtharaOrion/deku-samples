import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_Dku1auYb.mjs';
import 'piccolore';
import 'clsx';
import { f as formatDate, b as formatBytes } from './format_y0Y9nLbA.mjs';
/* empty css                             */

const $$Astro = createAstro();
const $$ReleaseBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ReleaseBlock;
  const { release, open = false } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<article class="release" data-astro-cid-7vmtfvrn> <details${addAttribute(open, "open")} data-astro-cid-7vmtfvrn> <summary data-astro-cid-7vmtfvrn> <span class="sum-line" data-astro-cid-7vmtfvrn> <span class="r-title" data-astro-cid-7vmtfvrn>Arranger <span class="ident" data-astro-cid-7vmtfvrn>${release.version}</span></span> <span class="hint" data-astro-cid-7vmtfvrn>Released on ${formatDate(release.released_on)}</span> </span> <span class="disclose" aria-hidden="true" data-astro-cid-7vmtfvrn></span> </summary> <div class="body" data-astro-cid-7vmtfvrn> <div class="row controls" data-astro-cid-7vmtfvrn> <a class="btn"${addAttribute(`/api/downloads/${release.artifact_name}`, "href")} download data-astro-cid-7vmtfvrn>
Download Arranger ${release.version} </a> <span class="hint tnum" data-astro-cid-7vmtfvrn>${formatBytes(release.size_bytes)}</span> </div> <p class="digest ident" title="SHA-256" data-astro-cid-7vmtfvrn>${release.sha256}</p> ${release.description && renderTemplate`<p class="desc" data-astro-cid-7vmtfvrn>${release.description}</p>`} ${release.notes.map((group) => renderTemplate`<section class="group" data-astro-cid-7vmtfvrn> <h3 data-astro-cid-7vmtfvrn>${group.group}</h3> <ul data-astro-cid-7vmtfvrn> ${group.items.map((item) => renderTemplate`<li data-astro-cid-7vmtfvrn>${item}</li>`)} </ul> </section>`)} <p class="signoff" data-astro-cid-7vmtfvrn>The Vela team.</p> <p data-astro-cid-7vmtfvrn><a class="perma"${addAttribute(`/downloads/${release.version}`, "href")} data-astro-cid-7vmtfvrn>Link to this release</a></p> </div> </details> </article> `;
}, "/app/src/components/ReleaseBlock.astro", void 0);

export { $$ReleaseBlock as $ };

import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_rOUT-VGP.mjs';
import 'piccolore';
import 'clsx';
import { f as formatDate, d as formatBytes } from './api_D4zreuKm.mjs';
/* empty css                             */

const $$Astro = createAstro();
const $$ReleaseBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ReleaseBlock;
  const { release, open = false } = Astro2.props;
  const groups = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  return renderTemplate`<!-- A disclosure that works with no scripting and is keyboard operable. The whole
     archive is present in the markup whatever the collapse state, so an in-page
     find and a crawler both see all of it. -->${maybeRenderHead()}<details class="release"${addAttribute(open, "open")} data-astro-cid-7vmtfvrn> <summary data-astro-cid-7vmtfvrn> <span class="row-between" style="width:100%" data-astro-cid-7vmtfvrn> <span data-astro-cid-7vmtfvrn> <span style="font-weight:700;font-size:18px" data-astro-cid-7vmtfvrn>Arranger <span class="version" data-astro-cid-7vmtfvrn>${release.version}</span></span> <span class="small muted" style="display:block;margin-top:var(--unit)" data-astro-cid-7vmtfvrn>
Released on ${formatDate(release.released_on)} </span> </span> <span class="small muted tnum" data-astro-cid-7vmtfvrn>Build ${release.build}</span> </span> </summary> <div class="release-body" data-astro-cid-7vmtfvrn> <div class="row" style="gap:calc(var(--unit)*3);margin-bottom:calc(var(--unit)*4)" data-astro-cid-7vmtfvrn> <a class="btn btn-secondary btn-sm"${addAttribute(`/downloads/${release.version}`, "href")}${addAttribute(release.artifact_name, "download")} data-astro-cid-7vmtfvrn>
Download Arranger ${release.version} </a> <span class="small muted bytes" data-astro-cid-7vmtfvrn>${formatBytes(release.size_bytes)}</span> </div> <p class="tiny muted digest" style="word-break:break-all;margin-bottom:calc(var(--unit)*4)" data-astro-cid-7vmtfvrn> <span class="visually-hidden" data-astro-cid-7vmtfvrn>SHA-256 digest: </span>${release.sha256} </p> ${release.description && renderTemplate`<p class="small" style="margin-bottom:calc(var(--unit)*4)" data-astro-cid-7vmtfvrn>${release.description}</p>`} ${groups.map((g) => release.notes[g] && release.notes[g].length > 0 && renderTemplate`<div style="margin-bottom:calc(var(--unit)*4)" data-astro-cid-7vmtfvrn> <h4 style="font-size:14px;line-height:21px;margin-bottom:calc(var(--unit)*2)" data-astro-cid-7vmtfvrn>${g}</h4> <ul style="padding-inline-start:calc(var(--unit)*5);max-width:70ch" data-astro-cid-7vmtfvrn> ${release.notes[g].map((n) => renderTemplate`<li class="small" style="margin-bottom:var(--unit)" data-astro-cid-7vmtfvrn>${n}</li>`)} </ul> </div>`)} <p class="small muted" data-astro-cid-7vmtfvrn>The Vela team.</p> </div> </details> `;
}, "/app/src/components/ReleaseBlock.astro", void 0);

export { $$ReleaseBlock as $ };

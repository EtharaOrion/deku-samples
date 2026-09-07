import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, b as createAstro } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import 'clsx';
import { f as formatDate, d as formatBytes } from './api_eUbQd3xF.mjs';
/* empty css                             */

const $$Astro = createAstro();
const $$ReleaseBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ReleaseBlock;
  const { release, expanded } = Astro2.props;
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const groups = GROUPS.filter((g) => release.notes?.[g]?.length);
  return renderTemplate`${maybeRenderHead()}<article class="release"${addAttribute(`release-${release.version}`, "id")} data-astro-cid-7vmtfvrn> <!--
    A disclosure that works with no scripting and is keyboard operable. The whole
    archive is present in the markup whatever the collapse state, so an in-page
    find and a crawler both see all of it.
  --> <details${addAttribute(expanded, "open")} data-astro-cid-7vmtfvrn> <summary data-astro-cid-7vmtfvrn> <span class="summary-inner" data-astro-cid-7vmtfvrn> <span class="titles" data-astro-cid-7vmtfvrn> <h2 data-astro-cid-7vmtfvrn>Arranger <span class="version mono" data-astro-cid-7vmtfvrn>${release.version}</span></h2> <p class="dateline" data-astro-cid-7vmtfvrn>
Released on <time${addAttribute(release.released_on, "datetime")} data-astro-cid-7vmtfvrn>${formatDate(release.released_on)}</time> <span class="build-note" data-astro-cid-7vmtfvrn> · build <span class="build mono" data-astro-cid-7vmtfvrn>${release.build}</span></span> </p> </span> <span class="marker" aria-hidden="true" data-astro-cid-7vmtfvrn></span> </span> </summary> <div class="body" data-astro-cid-7vmtfvrn> <p class="description" data-astro-cid-7vmtfvrn>${release.description}</p> <div class="artifact" data-astro-cid-7vmtfvrn> <a class="btn btn-secondary"${addAttribute(`/downloads/${release.version}`, "href")}${addAttribute(release.artifact_name, "download")} data-astro-cid-7vmtfvrn>
Download Arranger ${release.version} </a> <span class="meta" data-astro-cid-7vmtfvrn> <span class="bytes tnum" data-astro-cid-7vmtfvrn>${formatBytes(release.size_bytes)}</span> <span class="digest mono" data-astro-cid-7vmtfvrn>${release.sha256}</span> </span> </div> ${groups.map((group) => renderTemplate`<section class="group" data-astro-cid-7vmtfvrn> <h3 data-astro-cid-7vmtfvrn>${group}</h3> <ul data-astro-cid-7vmtfvrn> ${release.notes[group].map((note) => renderTemplate`<li data-astro-cid-7vmtfvrn> ${note.text} ${note.issue && renderTemplate`<span class="issue mono" data-astro-cid-7vmtfvrn> ${note.issue}</span>`} </li>`)} </ul> </section>`)} <p class="signoff" data-astro-cid-7vmtfvrn>The Vela team.</p> </div> </details> </article> `;
}, "/app/src/components/ReleaseBlock.astro", void 0);

export { $$ReleaseBlock as $ };

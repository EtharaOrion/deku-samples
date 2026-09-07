import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, k as renderComponent, l as Fragment, h as createAstro } from './astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { f as formatDate } from './format_Dm8rsWwp.mjs';
import { b as formatBytes } from './api_-Wd5sQnB.mjs';

const $$Astro = createAstro();
const $$ReleaseBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ReleaseBlock;
  const { release, open = false } = Astro2.props;
  const GROUPS = ["Newly Added", "Improvements", "Bug Fixes", "Known Issues"];
  const notes = release.notes || {};
  return renderTemplate`${maybeRenderHead()}<details class="release"${addAttribute(open, "open")}> <summary> <div class="release-head"> <h3 class="release-title">Arranger <span class="version">${release.version}</span></h3> <span class="release-date">Released on ${formatDate(release.released_on)}</span> <span class="release-disclose"></span> </div> </summary> <div class="release-body"> ${release.description && renderTemplate`<p style="margin-top: 0">${release.description}</p>`} <p> <a class="btn btn-quiet btn-small"${addAttribute(`/api/releases/${encodeURIComponent(release.version)}/artifact`, "href")} download>
Download Arranger ${release.version} </a> <span class="dl-meta" style="margin-left: 0.75rem"> <span class="bytes">${formatBytes(release.size_bytes)}</span> bytes · build <span class="build">${release.build}</span> </span> </p> <p class="dl-meta"><span class="digest">${release.sha256}</span></p> ${GROUPS.map((g) => notes[g] && notes[g].length > 0 && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <h4>${g}</h4> <ul>${notes[g].map((n) => renderTemplate`<li>${n}</li>`)}</ul> ` })}`)} <p class="release-sign">The Vela team.</p> </div> </details>`;
}, "/app/src/components/ReleaseBlock.astro", void 0);

export { $$ReleaseBlock as $ };

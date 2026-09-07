import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$ReleaseBlock } from '../../chunks/ReleaseBlock_CiRhaFGt.mjs';
import { a as apiGet } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                        */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const viewer = await viewerFor(Astro2.request);
  const [releases, one] = await Promise.all([
    apiGet(Astro2.request, "/releases?page_size=100"),
    apiGet(Astro2.request, `/releases/${version}`)
  ]);
  const list = releases.ok ? releases.data.data : [];
  const found = one.ok ? one.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": found ? `Arranger ${found.version} \u2014 Vela` : "Downloads \u2014 Vela", "current": "downloads", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-63uv547v> <a href="/downloads" data-astro-cid-63uv547v>Downloads</a> <span aria-hidden="true" data-astro-cid-63uv547v>/</span> <span class="mono" data-astro-cid-63uv547v>${version}</span> </nav> ${!found && renderTemplate`<div class="empty-state" data-astro-cid-63uv547v> <p data-astro-cid-63uv547v>That release does not exist.</p> <a class="btn btn-secondary" href="/downloads" data-astro-cid-63uv547v>Back to downloads</a> </div>`}${found && renderTemplate`<section class="archive" aria-labelledby="archive-heading" data-astro-cid-63uv547v> <h1 id="archive-heading" data-astro-cid-63uv547v>Arranger <span class="version mono" data-astro-cid-63uv547v>${found.version}</span></h1> <!-- This address renders this release expanded with the rest collapsed,
           and the whole archive is still present in the markup. --> ${list.map((release, i) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-63uv547v": true }, { "default": async ($$result3) => renderTemplate`${i > 0 && renderTemplate`<hr class="dashed-bar" data-astro-cid-63uv547v>`}${renderComponent($$result3, "ReleaseBlock", $$ReleaseBlock, { "release": release, "expanded": release.version === found.version, "data-astro-cid-63uv547v": true })} ` })}`)} </section>`}` })} `;
}, "/app/src/pages/downloads/[version].astro", void 0);

const $$file = "/app/src/pages/downloads/[version].astro";
const $$url = "/downloads/[version]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$version,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

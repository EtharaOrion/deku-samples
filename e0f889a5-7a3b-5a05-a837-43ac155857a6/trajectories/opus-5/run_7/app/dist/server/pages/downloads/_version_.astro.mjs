import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { $ as $$ReleaseBlock } from '../../chunks/ReleaseBlock_Dp_QZfVE.mjs';
import { a as apiGet, d as formatBytes } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const v = await viewer(Astro2);
  const rel = await apiGet(Astro2.request, "/releases?page_size=100");
  const releases = rel.ok ? rel.data.data : [];
  const wanted = releases.find((r) => r.version === version);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": wanted ? `Arranger ${wanted.version} \u2014 Vela` : "Release \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate`${!wanted ? renderTemplate`${maybeRenderHead()}<div> <h1 class="page-title">That page does not exist.</h1> <p class="page-lede">There is no release with that version number.</p> <p><a class="btn btn-secondary" href="/downloads">Go to downloads</a></p> </div>` : renderTemplate`<div> <nav aria-label="Breadcrumb" class="small muted" style="margin-bottom:calc(var(--unit)*4)"> <a href="/downloads">Downloads</a> <span aria-hidden="true">/</span> <span>Arranger ${wanted.version}</span> </nav> <h1 class="page-title">Arranger <span class="version">${wanted.version}</span></h1> <p class="page-lede"> <span class="bytes">${formatBytes(wanted.size_bytes)}</span> <span class="muted"> · build </span><span class="build">${wanted.build}</span> </p> <section class="section" aria-labelledby="archive-h"> <h2 class="section-title" id="archive-h">Release archive</h2>  ${releases.map((r, i) => renderTemplate`<div> ${i > 0 && renderTemplate`<div class="release-rule" aria-hidden="true"></div>`} ${renderComponent($$result2, "ReleaseBlock", $$ReleaseBlock, { "release": r, "open": r.version === wanted.version })} </div>`)} </section> </div>`}` })}`;
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

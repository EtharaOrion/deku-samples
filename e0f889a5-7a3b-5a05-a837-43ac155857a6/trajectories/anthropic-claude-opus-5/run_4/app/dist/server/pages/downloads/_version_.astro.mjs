import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$ReleaseBlock } from '../../chunks/ReleaseBlock_CMe97rwc.mjs';
import '../../chunks/server_SMyiD-DF.mjs';
import { g as getRelease, l as listReleases } from '../../chunks/releases_Clz7nfZG.mjs';
/* empty css                                        */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const one = await getRelease(version);
  if (!one) {
    return new Response(null, { status: 404 });
  }
  const releases = await listReleases({ limit: null });
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Arranger ${one.version} \u2014 Vela`, "description": one.description, "data-astro-cid-63uv547v": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-63uv547v> <header class="stack stack-2" data-astro-cid-63uv547v> <p data-astro-cid-63uv547v><a href="/downloads" data-astro-cid-63uv547v>Downloads</a></p> <h1 data-astro-cid-63uv547v>Arranger <span class="ident" data-astro-cid-63uv547v>${one.version}</span></h1> </header> <section class="archive stack stack-2" data-astro-cid-63uv547v> <ol class="release-list" data-astro-cid-63uv547v> ${releases.map((release, i) => renderTemplate`<li data-astro-cid-63uv547v> ${i > 0 && renderTemplate`<div class="separator" aria-hidden="true" data-astro-cid-63uv547v></div>`} ${renderComponent($$result2, "ReleaseBlock", $$ReleaseBlock, { "release": release, "open": release.version === one.version, "data-astro-cid-63uv547v": true })} </li>`)} </ol> </section> </div> ` })} `;
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

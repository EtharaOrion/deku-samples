import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$DownloadsPage } from '../../chunks/DownloadsPage_DMoAiHX6.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$version = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$version;
  const { version } = Astro2.params;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const one = await apiGet(`/api/releases/${encodeURIComponent(version)}`, Astro2);
  if (!one.ok) return new Response(null, { status: 404 });
  const releasesRes = await apiGet("/api/releases?page_size=100", Astro2);
  const firmwareRes = await apiGet("/api/firmware/manifest?model=compact", Astro2);
  return renderTemplate`<!-- Every release has its own address which renders it expanded with the rest
     collapsed. -->${renderComponent($$result, "DownloadsPage", $$DownloadsPage, { "releases": releasesRes.ok ? releasesRes.body.data : [], "firmware": firmwareRes.ok ? firmwareRes.body : null, "expanded": version, "customer": customer, "cartCount": cart?.item_count ?? 0 })}`;
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

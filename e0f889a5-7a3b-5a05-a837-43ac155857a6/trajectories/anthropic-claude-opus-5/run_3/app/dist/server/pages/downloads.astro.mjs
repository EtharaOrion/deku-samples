import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$DownloadsPage } from '../chunks/DownloadsPage_DMoAiHX6.mjs';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../chunks/server-fetch_DBHxzT0a.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const releasesRes = await apiGet("/api/releases?page_size=100", Astro2);
  const firmwareRes = await apiGet("/api/firmware/manifest?model=compact", Astro2);
  return renderTemplate`${renderComponent($$result, "DownloadsPage", $$DownloadsPage, { "releases": releasesRes.ok ? releasesRes.body.data : [], "firmware": firmwareRes.ok ? firmwareRes.body : null, "expanded": null, "customer": customer, "cartCount": cart?.item_count ?? 0 })}`;
}, "/app/src/pages/downloads/index.astro", void 0);

const $$file = "/app/src/pages/downloads/index.astro";
const $$url = "/downloads";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

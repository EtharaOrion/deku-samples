import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment, a as addAttribute } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$OrderDetail } from '../../chunks/OrderDetail_BIq-eNG8.mjs';
import { a as apiGet, b as authHeaders } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const accessToken = Astro2.url.searchParams.get("access_token");
  const justPlaced = Boolean(accessToken);
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(
    Astro2.request,
    `/orders/${number}${accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : ""}`,
    { headers: authHeaders(Astro2.request) }
  );
  const order = result.ok ? result.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number} \u2014 Vela` : "Order \u2014 Vela", "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate`${!order && renderTemplate`${maybeRenderHead()}<div class="empty-state" data-astro-cid-cxx6wafo> <p data-astro-cid-cxx6wafo>${result.ok ? "That order does not exist." : result.error.message}</p> <p class="muted" data-astro-cid-cxx6wafo>An order opens from the link in its confirmation mail, or from your account.</p> <a class="btn btn-secondary" href="/account/orders" data-astro-cid-cxx6wafo>Go to your orders</a> </div>`}${order && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate`${justPlaced && renderTemplate`<div class="confirmed" role="status" data-astro-cid-cxx6wafo> <!-- Success is stated in words before it is coloured. --> <h1 data-astro-cid-cxx6wafo>Order ${order.number} is confirmed. We have emailed ${order.email}.</h1> <a class="btn keep"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-cxx6wafo>Keep track of this order</a> </div>`}${!justPlaced && renderTemplate`<h1 class="plain" data-astro-cid-cxx6wafo>Order ${order.number}</h1>`}${renderComponent($$result3, "OrderDetail", $$OrderDetail, { "order": order, "showRegister": Boolean(viewer.customer), "data-astro-cid-cxx6wafo": true })} ` })}`}` })} `;
}, "/app/src/pages/orders/[number].astro", void 0);

const $$file = "/app/src/pages/orders/[number].astro";
const $$url = "/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

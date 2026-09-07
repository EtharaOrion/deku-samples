import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment } from '../../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, s as signInRedirect, $ as $$Shell } from '../../../chunks/page_2k6pLPlp.mjs';
import { $ as $$OrderDetail } from '../../../chunks/OrderDetail_BIq-eNG8.mjs';
import { a as apiGet, b as authHeaders } from '../../../chunks/api_eUbQd3xF.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const viewer = await viewerFor(Astro2.request);
  if (!viewer.customer) return signInRedirect(`/account/orders/${number}`);
  const result = await apiGet(
    Astro2.request,
    `/account/orders/${number}`,
    { headers: authHeaders(Astro2.request) }
  );
  const order = result.ok ? result.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number} \u2014 Vela` : "Order \u2014 Vela", "current": "orders", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-th46ys4i> <a href="/account/orders" data-astro-cid-th46ys4i>Orders</a> <span aria-hidden="true" data-astro-cid-th46ys4i>/</span> <span class="mono" data-astro-cid-th46ys4i>${number}</span> </nav> ${!order && renderTemplate`<div class="empty-state" data-astro-cid-th46ys4i> <p data-astro-cid-th46ys4i>That order does not exist.</p> <a class="btn btn-secondary" href="/account/orders" data-astro-cid-th46ys4i>Back to your orders</a> </div>`}${order && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-th46ys4i": true }, { "default": async ($$result3) => renderTemplate` <h1 data-astro-cid-th46ys4i>Order <span class="order-number mono" data-astro-cid-th46ys4i>${order.number}</span></h1> ${renderComponent($$result3, "OrderDetail", $$OrderDetail, { "order": order, "showRegister": true, "data-astro-cid-th46ys4i": true })} ` })}`}` })} `;
}, "/app/src/pages/account/orders/[number].astro", void 0);

const $$file = "/app/src/pages/account/orders/[number].astro";
const $$url = "/account/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

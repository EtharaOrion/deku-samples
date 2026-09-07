import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, F as Fragment, a as addAttribute } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, s as signInRedirect, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { a as apiGet, b as authHeaders, f as formatDate, c as formatMoney } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                    */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const viewer = await viewerFor(Astro2.request);
  if (!viewer.customer) return signInRedirect("/account/orders");
  const cursor = Astro2.url.searchParams.get("cursor");
  const result = await apiGet(
    Astro2.request,
    `/account/orders?page_size=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    { headers: authHeaders(Astro2.request) }
  );
  const orders = result.ok ? result.data.data : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Orders \u2014 Vela", "current": "orders", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-fdv6b7ge>Orders</h1> ${!result.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-fdv6b7ge> ${result.error.message} ${result.error.request_id && renderTemplate`<span class="mono" data-astro-cid-fdv6b7ge> Reference ${result.error.request_id}.</span>`} </p>`}${result.ok && orders.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-fdv6b7ge> <p data-astro-cid-fdv6b7ge>No orders yet.</p> <a class="btn btn-secondary" href="/shop" data-astro-cid-fdv6b7ge>Go to the shop</a> </div>`}${orders.length > 0 && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result3) => renderTemplate` <table class="table orders" data-astro-cid-fdv6b7ge> <caption class="visually-hidden" data-astro-cid-fdv6b7ge>Your orders, newest first</caption> <thead data-astro-cid-fdv6b7ge> <tr data-astro-cid-fdv6b7ge> <th scope="col" data-astro-cid-fdv6b7ge>Order</th> <th scope="col" data-astro-cid-fdv6b7ge>Date</th> <th scope="col" data-astro-cid-fdv6b7ge>Items</th> <th scope="col" data-astro-cid-fdv6b7ge>State</th> <th scope="col" class="num" data-astro-cid-fdv6b7ge>Total</th> </tr> </thead> <tbody data-astro-cid-fdv6b7ge> ${orders.map((order) => renderTemplate`<tr data-astro-cid-fdv6b7ge> <td data-astro-cid-fdv6b7ge><a class="order-number mono"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-fdv6b7ge>${order.number}</a></td> <td data-astro-cid-fdv6b7ge><time${addAttribute(order.placed_at, "datetime")} data-astro-cid-fdv6b7ge>${formatDate(order.placed_at)}</time></td> <td data-astro-cid-fdv6b7ge> ${order.first_title}${order.extra_lines > 0 ? ` and ${order.extra_lines} more` : ""} </td> <td data-astro-cid-fdv6b7ge><span${addAttribute(`chip chip-${order.chip.tone}`, "class")} data-astro-cid-fdv6b7ge>${order.chip.label}</span></td> <td class="num tnum" data-astro-cid-fdv6b7ge>${formatMoney(order.total_minor, order.currency)}</td> </tr>`)} </tbody> </table> ${result.ok && result.data.has_more && result.data.next_cursor && renderTemplate`<a class="btn btn-secondary more"${addAttribute(`/account/orders?cursor=${encodeURIComponent(result.data.next_cursor)}`, "href")} data-astro-cid-fdv6b7ge>
Older orders
</a>`}` })}`}` })} `;
}, "/app/src/pages/account/orders/index.astro", void 0);

const $$file = "/app/src/pages/account/orders/index.astro";
const $$url = "/account/orders";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

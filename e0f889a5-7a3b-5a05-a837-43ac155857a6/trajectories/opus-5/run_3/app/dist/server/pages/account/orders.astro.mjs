import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { r as requirePageCustomer } from '../../chunks/guard_CgiEvtXQ.mjs';
import { a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { o as orderChip, a as formatDateShort, b as formatMoney } from '../../chunks/app_BbZzWQ31.mjs';
/* empty css                                    */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const { customer, redirect } = await requirePageCustomer(Astro2);
  if (redirect) return redirect;
  const cart = await pageCart(Astro2);
  const cursor = Astro2.url.searchParams.get("cursor");
  const query = cursor ? `?page_size=20&cursor=${encodeURIComponent(cursor)}` : "?page_size=20";
  const res = await apiGet(`/api/account/orders${query}`, Astro2);
  const orders = res.ok ? res.body.data : [];
  const nextCursor = res.ok ? res.body.next_cursor : null;
  const hasMore = res.ok ? res.body.has_more : false;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Orders \u2014 Vela", "current": "orders", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-fdv6b7ge> <h1 class="page-title" data-astro-cid-fdv6b7ge>Orders</h1> <p class="page-sub" data-astro-cid-fdv6b7ge>Newest first.</p> </div> ${orders.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-fdv6b7ge> <p data-astro-cid-fdv6b7ge>No orders yet.</p> <p data-astro-cid-fdv6b7ge> <a href="/shop" data-astro-cid-fdv6b7ge>Shop</a> </p> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result3) => renderTemplate` <table class="table" data-astro-cid-fdv6b7ge> <thead data-astro-cid-fdv6b7ge> <tr data-astro-cid-fdv6b7ge> <th scope="col" data-astro-cid-fdv6b7ge>Order</th> <th scope="col" data-astro-cid-fdv6b7ge>Placed</th> <th scope="col" data-astro-cid-fdv6b7ge>What</th> <th scope="col" data-astro-cid-fdv6b7ge>State</th> <th scope="col" class="right" data-astro-cid-fdv6b7ge>
Total
</th> </tr> </thead> <tbody data-astro-cid-fdv6b7ge> ${orders.map((order) => {
    const chip = orderChip(order);
    return renderTemplate`<tr data-astro-cid-fdv6b7ge> <td data-astro-cid-fdv6b7ge> <a class="order-number"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-fdv6b7ge> ${order.number} </a> </td> <td class="num" data-astro-cid-fdv6b7ge>${formatDateShort(order.placed_at)}</td> <td data-astro-cid-fdv6b7ge> ${order.first_line_title} ${order.extra_line_count > 0 && renderTemplate`<span class="muted" data-astro-cid-fdv6b7ge> and ${order.extra_line_count} more</span>`} </td> <td data-astro-cid-fdv6b7ge> <span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-fdv6b7ge>${chip.text}</span> </td> <td class="right money" data-astro-cid-fdv6b7ge>${formatMoney(order.total_minor)}</td> </tr>`;
  })} </tbody> </table> ${hasMore && nextCursor && renderTemplate`<p class="more" data-astro-cid-fdv6b7ge> <a class="btn btn--secondary"${addAttribute(`/account/orders?cursor=${encodeURIComponent(nextCursor)}`, "href")} data-astro-cid-fdv6b7ge>
Older orders
</a> </p>`}` })}`}` })} `;
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

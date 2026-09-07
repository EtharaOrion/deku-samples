import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { r as requirePageCustomer } from '../chunks/guard_CgiEvtXQ.mjs';
import { a as pageCart, b as apiGet } from '../chunks/server-fetch_DBHxzT0a.mjs';
import { o as orderChip, a as formatDateShort, b as formatMoney } from '../chunks/app_BbZzWQ31.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const { customer, redirect } = await requirePageCustomer(Astro2);
  if (redirect) return redirect;
  const cart = await pageCart(Astro2);
  const [devicesRes, ordersRes, releasesRes] = await Promise.all([
    apiGet("/api/account/devices?page_size=100", Astro2).catch(() => ({ ok: false })),
    apiGet("/api/account/orders?page_size=2", Astro2).catch(() => ({ ok: false })),
    apiGet("/api/releases?page_size=1", Astro2).catch(() => ({ ok: false }))
  ]);
  const devices = devicesRes.ok ? devicesRes.body.data : null;
  const orders = ordersRes.ok ? ordersRes.body.data : null;
  const newest = releasesRes.ok ? releasesRes.body.data[0] : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Account \u2014 Vela", "current": "account", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-idhuhdga> <h1 class="page-title" data-astro-cid-idhuhdga>${customer.name}</h1> <p class="page-sub" data-astro-cid-idhuhdga>${customer.email}</p> </div> <div class="overview stack" data-astro-cid-idhuhdga> <!-- Cameras first: the order a camera owner arrives with, deliberately not
         a shop's order. --> <section data-astro-cid-idhuhdga> <div class="row row--between section-head" data-astro-cid-idhuhdga> <h2 class="section-title" data-astro-cid-idhuhdga>Cameras</h2> <a class="btn btn--quiet btn--small" href="/account/cameras" data-astro-cid-idhuhdga>All cameras</a> </div> ${devices === null ? renderTemplate`<div class="notice notice--error" data-astro-cid-idhuhdga> <span class="notice__body" data-astro-cid-idhuhdga>
We could not load your cameras. Reload the page to try again.
</span> </div>` : devices.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No cameras registered yet.</p> <p data-astro-cid-idhuhdga> <a href="/account/cameras" data-astro-cid-idhuhdga>Register one</a> </p> </div>` : renderTemplate`<ul class="mini-grid" role="list" data-astro-cid-idhuhdga> ${devices.slice(0, 4).map((device) => renderTemplate`<li class="card" data-astro-cid-idhuhdga> <div class="row row--between" data-astro-cid-idhuhdga> <span class="strong" data-astro-cid-idhuhdga>${device.model}</span> ${device.never_connected ? renderTemplate`<span class="chip chip--neutral" data-astro-cid-idhuhdga>Not yet connected</span>` : device.update_available ? renderTemplate`<span class="chip chip--progress" data-astro-cid-idhuhdga>Update available</span>` : renderTemplate`<span class="chip chip--done" data-astro-cid-idhuhdga>Up to date</span>`} </div> <p class="serial mini-serial" data-astro-cid-idhuhdga>${device.serial}</p> <a class="small"${addAttribute(`/account/cameras/${device.serial}`, "href")} data-astro-cid-idhuhdga>
Open
</a> </li>`)} </ul>`} </section> <!-- Then the two most recent orders. --> <section data-astro-cid-idhuhdga> <div class="row row--between section-head" data-astro-cid-idhuhdga> <h2 class="section-title" data-astro-cid-idhuhdga>Recent orders</h2> <a class="btn btn--quiet btn--small" href="/account/orders" data-astro-cid-idhuhdga>All orders</a> </div> ${orders === null ? renderTemplate`<div class="notice notice--error" data-astro-cid-idhuhdga> <span class="notice__body" data-astro-cid-idhuhdga>
We could not load your orders. Reload the page to try again.
</span> </div>` : orders.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No orders yet.</p> <p data-astro-cid-idhuhdga> <a href="/shop" data-astro-cid-idhuhdga>Shop</a> </p> </div>` : renderTemplate`<table class="table" data-astro-cid-idhuhdga> <thead data-astro-cid-idhuhdga> <tr data-astro-cid-idhuhdga> <th scope="col" data-astro-cid-idhuhdga>Order</th> <th scope="col" data-astro-cid-idhuhdga>Placed</th> <th scope="col" data-astro-cid-idhuhdga>State</th> <th scope="col" class="right" data-astro-cid-idhuhdga>
Total
</th> </tr> </thead> <tbody data-astro-cid-idhuhdga> ${orders.map((order) => {
    const chip = orderChip(order);
    return renderTemplate`<tr data-astro-cid-idhuhdga> <td data-astro-cid-idhuhdga> <a class="order-number"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-idhuhdga> ${order.number} </a> </td> <td class="num" data-astro-cid-idhuhdga>${formatDateShort(order.placed_at)}</td> <td data-astro-cid-idhuhdga> <span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-idhuhdga>${chip.text}</span> </td> <td class="right money" data-astro-cid-idhuhdga>${formatMoney(order.total_minor)}</td> </tr>`;
  })} </tbody> </table>`} </section> <!-- Then the current application version. --> <section data-astro-cid-idhuhdga> <h2 class="section-title" data-astro-cid-idhuhdga>Software</h2> ${newest ? renderTemplate`<div class="card row row--between" data-astro-cid-idhuhdga> <span data-astro-cid-idhuhdga>
Arranger <span class="version" data-astro-cid-idhuhdga>${newest.version}</span> is the current release.
</span> <a class="btn btn--secondary btn--small"${addAttribute(`/downloads/${newest.version}`, "href")} data-astro-cid-idhuhdga>
Download
</a> </div>` : renderTemplate`<div class="empty" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>We could not load the release list.</p> </div>`} </section> </div> ` })} `;
}, "/app/src/pages/account/index.astro", void 0);

const $$file = "/app/src/pages/account/index.astro";
const $$url = "/account";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

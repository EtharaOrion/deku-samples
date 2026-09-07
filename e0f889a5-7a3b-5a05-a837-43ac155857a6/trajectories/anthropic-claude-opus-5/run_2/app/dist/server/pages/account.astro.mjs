import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, s as signInRedirect, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
import { $ as $$CameraCard } from '../chunks/CameraCard_C8eUlRc3.mjs';
import { a as apiGet, b as authHeaders, f as formatDate, c as formatMoney, d as formatBytes } from '../chunks/api_eUbQd3xF.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const viewer = await viewerFor(Astro2.request);
  if (!viewer.customer) return signInRedirect("/account");
  const [devicesRes, ordersRes, releasesRes] = await Promise.all([
    apiGet(Astro2.request, "/account/devices?page_size=12", { headers: authHeaders(Astro2.request) }),
    apiGet(Astro2.request, "/account/orders?page_size=2", { headers: authHeaders(Astro2.request) }),
    apiGet(Astro2.request, "/releases?page_size=1")
  ]);
  const devices = devicesRes.ok ? devicesRes.data.data : [];
  const orders = ordersRes.ok ? ordersRes.data.data : [];
  const latest = releasesRes.ok ? releasesRes.data.data[0] : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Your account \u2014 Vela", "current": "account", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-idhuhdga>Your account</h1> <p class="who" data-astro-cid-idhuhdga>${viewer.customer.name} · ${viewer.customer.email}</p>  <section class="block" aria-labelledby="cameras-heading" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga> <h2 id="cameras-heading" data-astro-cid-idhuhdga>Your cameras</h2> <a class="btn btn-quiet btn-small" href="/account/cameras" data-astro-cid-idhuhdga>All cameras</a> </div> ${!devicesRes.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-idhuhdga>
We could not load your cameras.
${devicesRes.error.request_id && renderTemplate`<span class="mono" data-astro-cid-idhuhdga> Reference ${devicesRes.error.request_id}.</span>`} </p>`} ${devicesRes.ok && devices.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No cameras registered yet.</p> <a class="btn btn-secondary" href="/account/cameras" data-astro-cid-idhuhdga>Register one</a> </div>`} ${devices.length > 0 && renderTemplate`<ul class="grid" data-astro-cid-idhuhdga> ${devices.map((device) => renderTemplate`<li data-astro-cid-idhuhdga>${renderComponent($$result2, "CameraCard", $$CameraCard, { "device": device, "data-astro-cid-idhuhdga": true })}</li>`)} </ul>`} </section> <section class="block" aria-labelledby="orders-heading" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga> <h2 id="orders-heading" data-astro-cid-idhuhdga>Recent orders</h2> <a class="btn btn-quiet btn-small" href="/account/orders" data-astro-cid-idhuhdga>All orders</a> </div> ${!ordersRes.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-idhuhdga>
We could not load your orders.
${ordersRes.error.request_id && renderTemplate`<span class="mono" data-astro-cid-idhuhdga> Reference ${ordersRes.error.request_id}.</span>`} </p>`} ${ordersRes.ok && orders.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No orders yet.</p> <a class="btn btn-secondary" href="/shop" data-astro-cid-idhuhdga>Go to the shop</a> </div>`} ${orders.length > 0 && renderTemplate`<ul class="orders" data-astro-cid-idhuhdga> ${orders.map((order) => renderTemplate`<li data-astro-cid-idhuhdga> <a${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-idhuhdga> <span class="order-number mono" data-astro-cid-idhuhdga>${order.number}</span> <span class="order-date" data-astro-cid-idhuhdga>${formatDate(order.placed_at)}</span> <span class="order-title" data-astro-cid-idhuhdga> ${order.first_title}${order.extra_lines > 0 ? ` and ${order.extra_lines} more` : ""} </span> <span${addAttribute(`chip chip-${order.chip.tone}`, "class")} data-astro-cid-idhuhdga>${order.chip.label}</span> <span class="order-total tnum" data-astro-cid-idhuhdga>${formatMoney(order.total_minor, order.currency)}</span> </a> </li>`)} </ul>`} </section> <section class="block" aria-labelledby="software-heading" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga> <h2 id="software-heading" data-astro-cid-idhuhdga>Software</h2> <a class="btn btn-quiet btn-small" href="/downloads" data-astro-cid-idhuhdga>All releases</a> </div> ${!releasesRes.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-idhuhdga>We could not load the current version.</p>`} ${latest && renderTemplate`<div class="software card" data-astro-cid-idhuhdga> <div data-astro-cid-idhuhdga> <p class="software-title" data-astro-cid-idhuhdga>Arranger <span class="version mono" data-astro-cid-idhuhdga>${latest.version}</span></p> <p class="muted" data-astro-cid-idhuhdga>
Released ${formatDate(latest.released_on)} · <span class="bytes tnum" data-astro-cid-idhuhdga>${formatBytes(latest.size_bytes)}</span> </p> </div> <a class="btn btn-secondary"${addAttribute(`/downloads/${latest.version}`, "href")} data-astro-cid-idhuhdga>Download</a> </div>`} </section> ` })} `;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, s as signInRedirect, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { a as apiGet, f as formatDate, b as formatMinor } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const v = await viewer(Astro2);
  if (!v.signedIn) return signInRedirect(Astro2);
  const cursor = Astro2.url.searchParams.get("cursor");
  const q = cursor ? `?page_size=20&cursor=${encodeURIComponent(cursor)}` : "?page_size=20";
  const res = await apiGet(Astro2.request, `/account/orders${q}`, { token: v.token });
  const orders = res.ok ? res.data.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Your orders \u2014 Vela", "signedIn": true, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Your orders</h1> <p class="page-lede">Newest first.</p> ${orders === null ? renderTemplate`<div class="notice notice-danger" role="alert"><p>We could not load your orders. Reload the page to try again.</p></div>` : orders.length === 0 ? renderTemplate`<div class="empty"> <p>You have not ordered anything yet.</p> <p class="small" style="margin-top:calc(var(--unit)*2)"><a href="/shop">Go to the shop</a>.</p> </div>` : renderTemplate`<div> <table class="data" style="max-width:64rem"> <thead> <tr> <th scope="col">Order</th> <th scope="col">Date</th> <th scope="col">Items</th> <th scope="col" class="num">Total</th> <th scope="col">State</th> </tr> </thead> <tbody> ${orders.map((o) => renderTemplate`<tr> <td><a class="order-number"${addAttribute(`/account/orders/${o.number}`, "href")}>${o.number}</a></td> <td class="tnum">${formatDate(o.placed_at)}</td> <td>${o.first_title}${o.more_count > 0 && renderTemplate`<span class="muted"> and ${o.more_count} more</span>`}</td> <td class="num money">${formatMinor(o.total_minor)}</td>  <td><span class="chip">${o.state_phrase}</span></td> </tr>`)} </tbody> </table> ${res.data.has_more && renderTemplate`<p style="margin-top:calc(var(--unit)*5)"> <a class="btn btn-secondary"${addAttribute(`/account/orders?cursor=${encodeURIComponent(res.data.next_cursor)}`, "href")}>
Older orders
</a> </p>`} </div>`}` })}`;
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

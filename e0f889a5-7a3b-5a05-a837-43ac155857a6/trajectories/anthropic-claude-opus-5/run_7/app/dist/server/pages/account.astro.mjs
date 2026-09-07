import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { v as viewer, s as signInRedirect, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { a as apiGet, f as formatDate, b as formatMinor } from '../chunks/api_D4zreuKm.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const v = await viewer(Astro2);
  if (!v.signedIn) return signInRedirect(Astro2);
  const res = await apiGet(Astro2.request, "/account/overview", { token: v.token });
  const overview = res.ok ? res.data : null;
  const devices = overview?.devices ?? null;
  const orders = overview?.orders ?? null;
  const release = overview?.latest_release ?? null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Your account \u2014 Vela", "signedIn": true, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Your account</h1> <p class="page-lede">${v.customer.name}, signed in as ${v.customer.email}.</p>  <section class="section" aria-labelledby="cameras-h"> <div class="row-between" style="margin-bottom:calc(var(--unit)*3)"> <h2 class="section-title" id="cameras-h" style="margin:0;border:0;padding:0">Your cameras</h2> <a class="small" href="/account/cameras">All cameras</a> </div> ${devices === null ? renderTemplate`<div class="notice notice-danger"><p>We could not load your cameras. The rest of this page still works.</p></div>` : devices.length === 0 ? renderTemplate`<div class="empty"><p>No cameras registered yet.</p> <p class="small"><a href="/account/cameras">Register one</a>.</p></div>` : renderTemplate`<div class="grid-3"> ${devices.slice(0, 3).map((d) => renderTemplate`<article class="card"> <h3 style="font-size:16px;line-height:24px">${d.nickname || d.model}</h3> <p class="small muted">${d.model} — ${d.option_value}</p> <p class="serial small" style="margin-top:calc(var(--unit)*2)">${d.serial}</p> <div class="row" style="margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*2)"> ${d.never_connected ? renderTemplate`<span class="chip">Not yet connected</span>` : d.update_available ? renderTemplate`<span class="chip chip-progress">Update available</span>` : renderTemplate`<span class="chip chip-done">Up to date</span>`} ${d.warranty_until && renderTemplate`<span class="chip"> ${d.warranty_expired ? "Warranty ended" : `Warranty to ${formatDate(d.warranty_until)}`} </span>`} </div> </article>`)} </div>`} </section> <section class="section" aria-labelledby="orders-h"> <div class="row-between" style="margin-bottom:calc(var(--unit)*3)"> <h2 class="section-title" id="orders-h" style="margin:0;border:0;padding:0">Recent orders</h2> <a class="small" href="/account/orders">All orders</a> </div> ${orders === null ? renderTemplate`<div class="notice notice-danger"><p>We could not load your orders.</p></div>` : orders.length === 0 ? renderTemplate`<div class="empty"><p>You have not ordered anything yet.</p> <p class="small"><a href="/shop">Go to the shop</a>.</p></div>` : renderTemplate`<table class="data" style="max-width:60rem"> <thead> <tr> <th scope="col">Order</th> <th scope="col">Date</th> <th scope="col">Items</th> <th scope="col" class="num">Total</th> <th scope="col">State</th> </tr> </thead> <tbody> ${orders.map((o) => renderTemplate`<tr> <td><a class="order-number"${addAttribute(`/account/orders/${o.number}`, "href")}>${o.number}</a></td> <td class="tnum">${formatDate(o.placed_at)}</td> <td>${o.first_title}${o.more_count > 0 && renderTemplate`<span class="muted"> and ${o.more_count} more</span>`}</td> <td class="num money">${formatMinor(o.total_minor)}</td> <td><span class="chip">${o.state_phrase}</span></td> </tr>`)} </tbody> </table>`} </section> <section class="section" aria-labelledby="app-h"> <h2 class="section-title" id="app-h">The application</h2> ${release === null ? renderTemplate`<div class="notice notice-danger"><p>We could not load the application version.</p></div>` : renderTemplate`<p>
The current version is Arranger <span class="version">${release.version}</span>,
        released ${formatDate(release.released_on)}.
<a href="/downloads" style="margin-inline-start:calc(var(--unit)*2)">Downloads</a> </p>`} </section> ` })}`;
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

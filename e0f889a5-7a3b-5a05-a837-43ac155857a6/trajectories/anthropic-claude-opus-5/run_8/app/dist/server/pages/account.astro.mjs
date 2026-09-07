import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, l as Fragment } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch, f as formatMinor } from '../chunks/api_-Wd5sQnB.mjs';
import { r as requireCustomer } from '../chunks/guard_CmdfjCBR.mjs';
import { a as formatDateShort, f as formatDate } from '../chunks/format_Dm8rsWwp.mjs';
/* empty css                                    */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const guard = await requireCustomer(Astro2);
  if (guard.redirect) return guard.redirect;
  const customer = guard.customer;
  const [devRes, ordRes, relRes] = await Promise.all([
    apiFetch(Astro2, "/api/account/devices?page_size=100"),
    apiFetch(Astro2, "/api/account/orders?page_size=2"),
    apiFetch(Astro2, "/api/releases?page_size=1")
  ]);
  const devices = devRes.status === 200 ? devRes.data.data : null;
  const orders = ordRes.status === 200 ? ordRes.data.data : null;
  const newest = relRes.status === 200 ? relRes.data.data[0] : null;
  const seen = devices && devices.length ? devices.map((d) => d.firmware_version).filter(Boolean) : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Account", "current": "account" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Your account</h1> <p>${customer.name} · ${customer.email}</p> </div> <div class="overview-cols"> <section aria-labelledby="ov-cameras"> <h2 class="section-head" id="ov-cameras">Your cameras</h2> ${devices === null && renderTemplate`<p class="notice notice-wrong">We could not load your cameras. The rest of this page is fine.</p>`} ${devices && devices.length === 0 && renderTemplate`<p class="empty">No cameras registered yet. <a href="/account/cameras">Register one.</a></p>`} ${devices && devices.length > 0 && renderTemplate`<div class="acct-grid"> ${devices.slice(0, 3).map((d) => renderTemplate`<article class="cam-card"> <h3 class="cam-model">${d.model}</h3> <p class="cam-nick">${d.nickname || "No name yet"}</p> <a class="cam-serial serial"${addAttribute(`/account/cameras/${d.serial}`, "href")}>${d.serial}</a> <div class="cam-chips"> <span${addAttribute(`chip ${d.update_available ? "chip-progress" : d.firmware_version ? "chip-finished" : "chip-neutral"}`, "class")}> ${d.update_available ? "Update available" : d.firmware_version ? `Firmware ${d.firmware_version}` : "Not yet connected"} </span> </div> </article>`)} </div>`} ${devices && devices.length > 0 && renderTemplate`<p style="margin-top: 1rem"><a href="/account/cameras" class="small">All your cameras</a></p>`} </section> <section aria-labelledby="ov-orders"> <h2 class="section-head" id="ov-orders">Your two most recent orders</h2> ${orders === null && renderTemplate`<p class="notice notice-wrong">We could not load your orders. The rest of this page is fine.</p>`} ${orders && orders.length === 0 && renderTemplate`<p class="empty">No orders yet. <a href="/shop">Look at what we build.</a></p>`} ${orders && orders.length > 0 && renderTemplate`<div> ${orders.map((o) => renderTemplate`<a class="order-row"${addAttribute(`/account/orders/${o.number}`, "href")}> <span> <span class="order-number">${o.number}</span><br> <span class="muted small">${formatDateShort(o.placed_at)}</span> </span> <span>${o.lines.filter((l) => l.kind !== "protection")[0]?.title_snapshot || ""}</span> <span class="money">${formatMinor(o.total_minor)}</span> <span> <span${addAttribute(`chip ${o.fulfilment_status === "fulfilled" ? "chip-finished" : "chip-progress"}`, "class")}>${o.state_phrase}</span> </span> </a>`)} <p style="margin-top: 1rem"><a href="/account/orders" class="small">All your orders</a></p> </div>`} </section> <section aria-labelledby="ov-software"> <h2 class="section-head" id="ov-software">The software</h2> ${!newest && renderTemplate`<p class="notice notice-wrong">We could not load the current version.</p>`} ${newest && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <p class="small">
The current version is Arranger <span class="version">${newest.version}</span>, released on ${formatDate(newest.released_on)}.
${seen.length > 0 ? " Your cameras have all reported a version, so you will see whether each one is behind on its own card." : " None of your cameras has reported a version yet, so we cannot say whether any is behind."} </p> <p style="margin-top: 1rem"> <a class="btn btn-quiet btn-small" href="/downloads">Downloads</a> </p> ` })}`} </section> </div> ` })}`;
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

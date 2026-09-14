import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { q, one } from "../chunks/index_CC0DBeZe.mjs";
import { currentCustomer } from "../chunks/session_C_3CDjrl.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2.request);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent("/account")}`);
  const devices = await q(
    `SELECT d.serial, d.nickname, d.firmware_version, d.warranty_until, p.title AS model,
          (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel='general' ORDER BY f.build DESC LIMIT 1) AS latest
   FROM device_ownership o JOIN device d ON d.id = o.device_id JOIN product p ON p.id = d.product_id
   WHERE o.customer_id = $1 AND o.released_at IS NULL ORDER BY o.id DESC`,
    [customer.id]
  );
  const orders = await q("SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 2", [customer.id]);
  const latestApp = await one("SELECT version, build FROM app_release ORDER BY build DESC LIMIT 1");
  const seen = await one("SELECT build FROM customer_app_seen WHERE customer_id = $1", [customer.id]);
  const fmt = (m) => {
    const abs = Math.abs(m);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  const date = (d) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Account", "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-idhuhdga>Your account</h1> <p class="muted" data-astro-cid-idhuhdga>Signed in as ${customer.email}.</p> <section class="block" aria-label="Your cameras" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Cameras</h2> ${devices.length === 0 ? renderTemplate`<p data-astro-cid-idhuhdga>No cameras registered yet. <a href="/account/cameras" data-astro-cid-idhuhdga>Register one</a>.</p>` : renderTemplate`<ul class="camera-list" data-astro-cid-idhuhdga> ${devices.map((d) => renderTemplate`<li class="card" data-astro-cid-idhuhdga> <a${addAttribute(`/account/cameras/${d.serial}`, "href")} data-astro-cid-idhuhdga><strong data-astro-cid-idhuhdga>${d.model}</strong> ${d.nickname ? renderTemplate`<span class="muted" data-astro-cid-idhuhdga>“${d.nickname}”</span>` : null}</a> <div class="mono" data-astro-cid-idhuhdga>${d.serial}</div> <div class="chips" data-astro-cid-idhuhdga> <span class="chip" data-astro-cid-idhuhdga>${d.firmware_version ? `Firmware ${d.firmware_version}` : "Not yet connected"}</span> ${d.firmware_version && d.latest && d.firmware_version !== d.latest ? renderTemplate`<span class="chip chip-warn" data-astro-cid-idhuhdga>Update available</span>` : null} <span class="chip" data-astro-cid-idhuhdga>${d.warranty_until ? `Warranty to ${date(d.warranty_until)}` : "No warranty date"}</span> </div> </li>`)} </ul>`} </section> <section class="block" aria-label="Recent orders" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Orders</h2> ${orders.length === 0 ? renderTemplate`<p data-astro-cid-idhuhdga>No orders yet.</p>` : renderTemplate`<ul class="order-list" data-astro-cid-idhuhdga> ${orders.map((o) => renderTemplate`<li class="card" data-astro-cid-idhuhdga> <a${addAttribute(`/account/orders/${o.number}`, "href")} class="mono" data-astro-cid-idhuhdga>${o.number}</a> <div class="muted small" data-astro-cid-idhuhdga>${date(o.placed_at)}</div> <div class="tnum" data-astro-cid-idhuhdga>${fmt(o.total_minor)}</div> </li>`)} </ul>`} <p data-astro-cid-idhuhdga><a href="/account/orders" data-astro-cid-idhuhdga>All orders</a></p> </section> <section class="block" aria-label="Software" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Software</h2> <p data-astro-cid-idhuhdga>Arranger <span class="mono" data-astro-cid-idhuhdga>${latestApp?.version}</span> is the current version.</p> ${seen && seen.build < (latestApp?.build ?? 0) ? renderTemplate`<p class="notice" data-astro-cid-idhuhdga>There is a newer Arranger than the one you last saw. <a href="/downloads" data-astro-cid-idhuhdga>See the release</a>.</p>` : renderTemplate`<p class="muted" data-astro-cid-idhuhdga>You are up to date.</p>`} </section> ` })} `;
}, "/app/src/pages/account/index.astro", void 0);
const $$file = "/app/src/pages/account/index.astro";
const $$url = "/account";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

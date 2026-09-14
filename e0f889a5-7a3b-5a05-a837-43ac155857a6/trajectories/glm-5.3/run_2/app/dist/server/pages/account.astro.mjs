import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
import { r as requirePageCustomer, s as signInRedirect } from "../chunks/pageguard_DqzDYTwd.mjs";
import { b as devicesForCustomer, a as deviceView } from "../chunks/devices_BeE0c41C.mjs";
import { q } from "../chunks/pool_DifDkjYx.mjs";
import { o as orderView } from "../chunks/orders_CMRlzCpx.mjs";
import { l as latestRelease } from "../chunks/releases_CuqIRam6.mjs";
import { l as lastSeenReleaseBuild } from "../chunks/cart_CB9dsG5b.mjs";
import { m as money, o as orderChip } from "../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../chunks/context_Bm1YOHfv.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await requirePageCustomer(Astro2);
  if (!customer) return Astro2.redirect(signInRedirect("/account"));
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  let cameras = [];
  let orders = [];
  let appBlock = null;
  let cameraError = false;
  let orderError = false;
  try {
    const res = await devicesForCustomer(customer.id, 100, null);
    cameras = await Promise.all(res.rows.map((d) => deviceView(d)));
  } catch {
    cameraError = true;
  }
  try {
    const res = await q("SELECT * FROM order_row WHERE customer_id = $1 ORDER BY placed_at DESC NULLS LAST, id DESC LIMIT 2", [customer.id]);
    orders = await Promise.all(res.rows.map((o) => orderView(o)));
  } catch {
    orderError = true;
  }
  try {
    const latest = await latestRelease();
    const lastSeen = await lastSeenReleaseBuild(customer.id);
    appBlock = {
      latest_version: latest?.version ?? null,
      latest_build: latest ? Number(latest.build) : null,
      last_seen_build: lastSeen,
      newer: latest ? lastSeen === null || Number(latest.build) > lastSeen : false
    };
  } catch {
    appBlock = null;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Account — Vela", "active": "account", "customer": { email: customer.email, name: customer.name }, "cartCount": cartCount, "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-idhuhdga> <h1 data-astro-cid-idhuhdga>${customer.name}</h1> <p class="lede" data-astro-cid-idhuhdga>${customer.email}</p> </div> <section class="block" aria-labelledby="cameras-h" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga> <h2 id="cameras-h" data-astro-cid-idhuhdga>Cameras</h2> <a class="btn" href="/account/cameras" data-astro-cid-idhuhdga>All cameras</a> </div> ${cameraError ? renderTemplate`<p class="inline-error" data-astro-cid-idhuhdga>Something went wrong at our end. Try again in a moment.</p>` : cameras.length === 0 ? renderTemplate`<p class="muted" data-astro-cid-idhuhdga>No cameras registered yet.</p>` : renderTemplate`<ul class="camera-list" data-astro-cid-idhuhdga> ${cameras.map((c) => renderTemplate`<li class="card camera" data-astro-cid-idhuhdga> <a class="camera-link"${addAttribute(`/account/cameras/${c.serial}`, "href")} data-astro-cid-idhuhdga> <span class="camera-title" data-astro-cid-idhuhdga>${c.nickname || c.model}</span> <span class="mono camera-serial" data-astro-cid-idhuhdga>${c.serial}</span> <span class="camera-chips" data-astro-cid-idhuhdga> <span${addAttribute(c.never_connected ? "chip" : c.update_available ? "chip chip-low" : "chip chip-ok", "class")} data-astro-cid-idhuhdga> ${c.never_connected ? "Not yet connected" : c.update_available ? `Update available (${c.latest_firmware_version})` : `Firmware ${c.firmware_version}`} </span> ${c.warranty_until ? renderTemplate`<span class="chip" data-astro-cid-idhuhdga>Warranty to ${c.warranty_until}</span>` : null} </span> </a> </li>`)} </ul>`} </section> <section class="block" aria-labelledby="orders-h" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga> <h2 id="orders-h" data-astro-cid-idhuhdga>Recent orders</h2> <a class="btn" href="/account/orders" data-astro-cid-idhuhdga>All orders</a> </div> ${orderError ? renderTemplate`<p class="inline-error" data-astro-cid-idhuhdga>Something went wrong at our end. Try again in a moment.</p>` : orders.length === 0 ? renderTemplate`<p class="muted" data-astro-cid-idhuhdga>No orders yet.</p>` : renderTemplate`<ul class="order-list" data-astro-cid-idhuhdga> ${orders.map((o) => renderTemplate`<li class="card order" data-astro-cid-idhuhdga> <a class="order-link"${addAttribute(`/account/orders/${o.number}`, "href")} data-astro-cid-idhuhdga> <span class="mono order-number" data-astro-cid-idhuhdga>${o.number}</span> <span class="order-first" data-astro-cid-idhuhdga>${o.lines[0]?.title_snapshot ?? "Order"}${o.lines.length > 1 ? ` and ${o.lines.length - 1} more` : ""}</span> <span class="num order-total" data-astro-cid-idhuhdga>${money(o.total_minor)}</span> <span class="chip" data-astro-cid-idhuhdga>${orderChip(o)}</span> </a> </li>`)} </ul>`} </section> <section class="block" aria-labelledby="app-h" data-astro-cid-idhuhdga> <div class="block-head" data-astro-cid-idhuhdga><h2 id="app-h" data-astro-cid-idhuhdga>Software</h2></div> ${appBlock ? renderTemplate`<p class="muted" data-astro-cid-idhuhdga>
The current version of Arranger is <span class="mono" data-astro-cid-idhuhdga>${appBlock.latest_version}</span> (build <span class="mono" data-astro-cid-idhuhdga>${appBlock.latest_build}</span>).
${appBlock.newer ? " It is newer than the one you last saw." : " You have already seen it."} <a href="/downloads" data-astro-cid-idhuhdga>See the downloads</a> </p>` : renderTemplate`<p class="inline-error" data-astro-cid-idhuhdga>Something went wrong at our end. Try again in a moment.</p>`} </section> ` })} `;
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

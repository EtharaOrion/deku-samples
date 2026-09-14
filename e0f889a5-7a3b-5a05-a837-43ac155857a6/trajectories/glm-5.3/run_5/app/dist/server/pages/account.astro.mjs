import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../chunks/PageShell_DYrBPb7v.mjs";
import { a as devicesForCustomer, t as toDeviceView } from "../chunks/devices_CusoPqEi.mjs";
import { q } from "../chunks/db_C-9WqIXq.mjs";
import { listReleases } from "../chunks/releases_B2Vn5YuN.mjs";
import { d as dollars } from "../chunks/cart_BmbV16eC.mjs";
/* empty css                                 */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  if (!customer) return Astro2.redirect("/sign-in?redirect=/account");
  const devices = (await devicesForCustomer(customer.id)).map(toDeviceView);
  const orders = await q(
    `SELECT o.*, (SELECT l.title_snapshot FROM order_line l WHERE l.order_id = o.id ORDER BY l.id ASC LIMIT 1) AS first_line,
          (SELECT count(*)::int FROM order_line l WHERE l.order_id = o.id) AS line_count
     FROM "order" o WHERE o.customer_id = $1 ORDER BY o.placed_at DESC, o.id DESC LIMIT 2`,
    [customer.id]
  );
  const releases = await listReleases();
  const latest = releases[0] ?? null;
  const lastSeen = Astro2.cookies.get("vela_app_seen")?.value ?? null;
  const isNewer = latest && (!lastSeen || compareBuilds(latest.version, lastSeen) > 0);
  function compareBuilds(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] ?? 0, y = pb[i] ?? 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }
  if (latest) Astro2.cookies.set("vela_app_seen", latest.version, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Your account — Vela", "heading": "Overview", "active": "account", "customer": { name: customer.name, email: customer.email }, "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="overview" data-astro-cid-idhuhdga> <section class="block" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Your cameras</h2> ${devices.length === 0 ? renderTemplate`<p class="empty-note" data-astro-cid-idhuhdga>No cameras registered yet.</p>` : renderTemplate`<ul class="cameras" data-astro-cid-idhuhdga> ${devices.map((d) => renderTemplate`<li class="camera card" data-astro-cid-idhuhdga> <a class="camera__link"${addAttribute(`/account/cameras/${d.serial}`, "href")} data-astro-cid-idhuhdga> <span class="camera__model" data-astro-cid-idhuhdga>${d.model}</span> <span class="camera__serial serial" data-astro-cid-idhuhdga>${d.serial}</span> <span class="camera__chips" data-astro-cid-idhuhdga> ${d.update_available ? renderTemplate`<span class="chip chip--progress" data-astro-cid-idhuhdga>Update available</span>` : d.firmware_version ? renderTemplate`<span class="chip chip--done" data-astro-cid-idhuhdga>Up to date</span>` : renderTemplate`<span class="chip" data-astro-cid-idhuhdga>Not yet connected</span>`} <span class="chip" data-astro-cid-idhuhdga>Warranty ${d.warranty_until ?? "unknown"}</span> </span> </a> </li>`)} </ul>`} <a class="btn" href="/account/cameras" data-astro-cid-idhuhdga>Register a camera</a> </section> <section class="block" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Recent orders</h2> ${orders.length === 0 ? renderTemplate`<p class="empty-note" data-astro-cid-idhuhdga>No orders yet.</p>` : renderTemplate`<ul class="orders" data-astro-cid-idhuhdga> ${orders.map((o) => renderTemplate`<li class="order card" data-astro-cid-idhuhdga> <a${addAttribute(`/account/orders/${o.number}`, "href")} data-astro-cid-idhuhdga> <span class="serial order-number" data-astro-cid-idhuhdga>${o.number}</span> <span data-astro-cid-idhuhdga>${o.first_line}${o.line_count > 1 ? ` and ${o.line_count - 1} more` : ""}</span> <span class="tnum" data-astro-cid-idhuhdga>${dollars(Number(o.total_minor))}</span> </a> </li>`)} </ul>`} <a class="btn" href="/account/orders" data-astro-cid-idhuhdga>All orders</a> </section> <section class="block" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Software</h2> ${latest ? renderTemplate`<dl data-astro-cid-idhuhdga> <dt data-astro-cid-idhuhdga>Current application version</dt><dd class="mono" data-astro-cid-idhuhdga>${latest.version}</dd> <dt data-astro-cid-idhuhdga>Newer than the one you last saw</dt> <dd data-astro-cid-idhuhdga>${isNewer ? "Yes" : "No"}</dd> </dl>` : renderTemplate`<p class="empty-note" data-astro-cid-idhuhdga>No releases published yet.</p>`} <a class="btn" href="/downloads" data-astro-cid-idhuhdga>Downloads</a> </section> </div> ` })} `;
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

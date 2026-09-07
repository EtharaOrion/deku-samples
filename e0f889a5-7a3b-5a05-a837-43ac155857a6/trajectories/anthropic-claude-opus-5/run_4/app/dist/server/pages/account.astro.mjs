import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { $ as $$CameraCard } from '../chunks/CameraCard_Cq2nTa3a.mjs';
import { c as currentCustomer, s as signInRedirect, q as query } from '../chunks/server_SMyiD-DF.mjs';
import { f as formatDate, a as formatMinor } from '../chunks/format_y0Y9nLbA.mjs';
import { A as ACCOUNT_ORDER_PREDICATE, o as orderLines, s as statePhrase } from '../chunks/orders_D-zVuqOa.mjs';
/* empty css                                 */
import { l as listDevicesForCustomer } from '../chunks/devices_BvEkuw7E.mjs';
import { n as newestRelease } from '../chunks/releases_Clz7nfZG.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2);
  if (!customer) return signInRedirect(Astro2);
  let devices = null;
  let devicesFailed = false;
  try {
    devices = await listDevicesForCustomer(customer.id, { limit: 4 });
  } catch {
    devicesFailed = true;
  }
  let orders = null;
  let ordersFailed = false;
  try {
    const { rows } = await query(
      `SELECT * FROM "order" WHERE ${ACCOUNT_ORDER_PREDICATE} ORDER BY id DESC LIMIT 2`,
      [customer.id, customer.email]
    );
    orders = [];
    for (const row of rows) {
      const lines = await orderLines(row.id);
      orders.push({
        number: row.number,
        placed_at: row.placed_at,
        total_minor: Number(row.total_minor),
        currency: row.currency,
        state_phrase: statePhrase(row),
        first_line_title: lines.length ? lines[0].title_snapshot : null,
        extra: Math.max(lines.length - 1, 0)
      });
    }
  } catch {
    ordersFailed = true;
  }
  let software = null;
  let softwareFailed = false;
  try {
    const newest = await newestRelease();
    const { rows } = await query(`SELECT build FROM account_seen_release WHERE customer_id = $1`, [customer.id]);
    software = {
      newest,
      isNewer: newest ? !rows.length || Number(rows[0].build) < newest.build : false
    };
  } catch {
    softwareFailed = true;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Account \u2014 Vela", "description": "Your cameras, your orders and the software.", "data-astro-cid-idhuhdga": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-10" data-astro-cid-idhuhdga> <header class="stack stack-2" data-astro-cid-idhuhdga> <h1 data-astro-cid-idhuhdga>Your account</h1> <p class="hint" data-astro-cid-idhuhdga>Signed in as ${customer.email}</p> </header> <!-- Cameras first, then the two most recent orders, then the software. --> <section class="stack stack-4" data-astro-cid-idhuhdga> <div class="row-between" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Your cameras</h2> <a href="/account/cameras" data-astro-cid-idhuhdga>All cameras</a> </div> ${devicesFailed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-idhuhdga>We could not load your cameras. Reload the page to try again.</p>` : devices.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No cameras registered yet.</p> <a href="/account/cameras" data-astro-cid-idhuhdga>Register one</a> </div>` : renderTemplate`<ul class="grid" data-astro-cid-idhuhdga> ${devices.slice(0, 3).map((device) => renderTemplate`<li data-astro-cid-idhuhdga>${renderComponent($$result2, "CameraCard", $$CameraCard, { "device": device, "data-astro-cid-idhuhdga": true })}</li>`)} </ul>`} </section> <section class="stack stack-4" data-astro-cid-idhuhdga> <div class="row-between" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Recent orders</h2> <a href="/account/orders" data-astro-cid-idhuhdga>All orders</a> </div> ${ordersFailed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-idhuhdga>We could not load your orders. Reload the page to try again.</p>` : orders.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-idhuhdga> <p data-astro-cid-idhuhdga>No orders yet.</p> <a href="/shop" data-astro-cid-idhuhdga>Shop</a> </div>` : renderTemplate`<table class="table" data-astro-cid-idhuhdga> <thead data-astro-cid-idhuhdga> <tr data-astro-cid-idhuhdga> <th data-astro-cid-idhuhdga>Order</th><th data-astro-cid-idhuhdga>Placed</th><th data-astro-cid-idhuhdga>Items</th> <th data-astro-cid-idhuhdga>State</th><th class="num" data-astro-cid-idhuhdga>Total</th> </tr> </thead> <tbody data-astro-cid-idhuhdga> ${orders.map((order) => renderTemplate`<tr data-astro-cid-idhuhdga> <td data-astro-cid-idhuhdga><a class="ident"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-idhuhdga>${order.number}</a></td> <td data-astro-cid-idhuhdga>${formatDate(order.placed_at)}</td> <td data-astro-cid-idhuhdga>${order.first_line_title}${order.extra > 0 && ` and ${order.extra} more`}</td> <td data-astro-cid-idhuhdga><span class="chip" data-astro-cid-idhuhdga>${order.state_phrase}</span></td> <td class="num money" data-astro-cid-idhuhdga>${formatMinor(order.total_minor, order.currency)}</td> </tr>`)} </tbody> </table>`} </section> <section class="stack stack-3" data-astro-cid-idhuhdga> <h2 data-astro-cid-idhuhdga>Software</h2> ${softwareFailed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-idhuhdga>We could not load the software list.</p>` : software.newest && renderTemplate`<div class="card software" data-astro-cid-idhuhdga> <div data-astro-cid-idhuhdga> <p class="s-title" data-astro-cid-idhuhdga>Arranger <span class="ident" data-astro-cid-idhuhdga>${software.newest.version}</span></p> <p class="hint" data-astro-cid-idhuhdga>Released on ${formatDate(software.newest.released_on)}</p> </div> ${software.isNewer && renderTemplate`<span class="chip chip-progress" data-astro-cid-idhuhdga>Newer than the one you last saw</span>`} <a class="btn" href="/downloads" data-astro-cid-idhuhdga>Downloads</a> </div>`} </section> </div> ` })} `;
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

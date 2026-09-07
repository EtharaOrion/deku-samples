import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { c as currentCustomer, s as signInRedirect, q as query } from '../../chunks/server_SMyiD-DF.mjs';
import { A as ACCOUNT_ORDER_PREDICATE, o as orderLines, s as statePhrase } from '../../chunks/orders_D-zVuqOa.mjs';
import { f as formatDate, a as formatMinor } from '../../chunks/format_y0Y9nLbA.mjs';
/* empty css                                    */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2);
  if (!customer) return signInRedirect(Astro2);
  const PAGE_SIZE = 50;
  const rawCursor = Astro2.url.searchParams.get("before");
  const beforeId = /^[0-9]+$/.test(rawCursor || "") ? rawCursor : null;
  let orders = [];
  let hasMore = false;
  let nextCursor = null;
  let failed = false;
  try {
    const params = [customer.id, customer.email];
    let where = ACCOUNT_ORDER_PREDICATE;
    if (beforeId) {
      params.push(beforeId);
      where += ` AND id < $${params.length}`;
    }
    params.push(PAGE_SIZE + 1);
    const { rows } = await query(
      `SELECT * FROM "order" WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
      params
    );
    hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    if (hasMore && page.length) nextCursor = String(page[page.length - 1].id);
    for (const row of page) {
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
    failed = true;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Orders \u2014 Vela", "description": "Your order history.", "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-fdv6b7ge> <h1 data-astro-cid-fdv6b7ge>Your orders</h1> ${failed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-fdv6b7ge>We could not load your orders. Reload the page to try again.</p>` : orders.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-fdv6b7ge> <p data-astro-cid-fdv6b7ge>No orders yet.</p> <a href="/shop" data-astro-cid-fdv6b7ge>Shop</a> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-fdv6b7ge": true }, { "default": async ($$result3) => renderTemplate` <table class="table" data-astro-cid-fdv6b7ge> <caption class="visually-hidden" data-astro-cid-fdv6b7ge>Orders, newest first</caption> <thead data-astro-cid-fdv6b7ge> <tr data-astro-cid-fdv6b7ge> <th data-astro-cid-fdv6b7ge>Order</th> <th data-astro-cid-fdv6b7ge>Placed</th> <th data-astro-cid-fdv6b7ge>Items</th> <th data-astro-cid-fdv6b7ge>State</th> <th class="num" data-astro-cid-fdv6b7ge>Total</th> </tr> </thead> <tbody data-astro-cid-fdv6b7ge> ${orders.map((order) => renderTemplate`<tr data-astro-cid-fdv6b7ge> <td data-astro-cid-fdv6b7ge><a class="ident"${addAttribute(`/account/orders/${order.number}`, "href")} data-astro-cid-fdv6b7ge>${order.number}</a></td> <td data-astro-cid-fdv6b7ge>${formatDate(order.placed_at)}</td> <td data-astro-cid-fdv6b7ge> ${order.first_line_title} ${order.extra > 0 && renderTemplate`<span class="hint" data-astro-cid-fdv6b7ge> and ${order.extra} more</span>`} </td>  <td data-astro-cid-fdv6b7ge><span class="chip" data-astro-cid-fdv6b7ge>${order.state_phrase}</span></td> <td class="num money" data-astro-cid-fdv6b7ge>${formatMinor(order.total_minor, order.currency)}</td> </tr>`)} </tbody> </table> ${hasMore && renderTemplate`<p data-astro-cid-fdv6b7ge> <a class="btn"${addAttribute(`/account/orders?before=${nextCursor}`, "href")} data-astro-cid-fdv6b7ge>Older orders</a> </p>`}${beforeId && renderTemplate`<p data-astro-cid-fdv6b7ge><a href="/account/orders" data-astro-cid-fdv6b7ge>Back to the newest</a></p>`}` })}`} </div> ` })} `;
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

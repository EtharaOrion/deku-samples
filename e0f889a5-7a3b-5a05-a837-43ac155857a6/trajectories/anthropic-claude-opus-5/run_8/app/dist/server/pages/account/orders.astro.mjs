import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch, f as formatMinor } from '../../chunks/api_-Wd5sQnB.mjs';
import { r as requireCustomer } from '../../chunks/guard_CmdfjCBR.mjs';
import { a as formatDateShort } from '../../chunks/format_Dm8rsWwp.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const guard = await requireCustomer(Astro2);
  if (guard.redirect) return guard.redirect;
  const cursor = Astro2.url.searchParams.get("cursor") || "";
  const res = await apiFetch(Astro2, `/api/account/orders?page_size=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  const orders = res.status === 200 ? res.data.data : [];
  const hasMore = res.status === 200 && res.data.has_more;
  const nextCursor = res.status === 200 ? res.data.next_cursor : null;
  const failed = res.status !== 200;
  function summary(o) {
    const goods = o.lines.filter((l) => l.kind !== "protection");
    const first = goods[0] ?? o.lines[0];
    const more = goods.length - 1;
    return more > 0 ? `${first.title_snapshot} and ${more} more` : first ? first.title_snapshot : "";
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Orders", "current": "orders" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Orders</h1> </div> ${failed && renderTemplate`<p class="notice notice-wrong">We could not load your orders. Reload the page and it will try again.</p>`}${!failed && orders.length === 0 && renderTemplate`<p class="empty">No orders yet. <a href="/shop">Look at what we build.</a></p>`}${orders.length > 0 && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div role="table" aria-label="Your orders"> <div class="order-row" role="row" style="font-weight: 700; color: var(--fg-muted); font-size: 13px"> <span role="columnheader">Number</span> <span role="columnheader">What</span> <span role="columnheader">Total</span> <span role="columnheader">State</span> </div> ${orders.map((o) => renderTemplate`<a class="order-row"${addAttribute(`/account/orders/${o.number}`, "href")} role="row"> <span role="cell"> <span class="order-number">${o.number}</span><br> <span class="muted small">${formatDateShort(o.placed_at)}</span> </span> <span role="cell">${summary(o)}</span> <span role="cell" class="money">${formatMinor(o.total_minor)} <span class="muted small">${o.currency.toUpperCase()}</span></span> <span role="cell"> <span${addAttribute(`chip ${o.status === "cancelled" ? "chip-wrong" : o.fulfilment_status === "fulfilled" ? "chip-finished" : "chip-progress"}`, "class")}> ${o.state_phrase} </span> </span> </a>`)} </div> ${hasMore && nextCursor && renderTemplate`<p style="margin-top: 2rem"> <a class="btn btn-quiet"${addAttribute(`/account/orders?cursor=${encodeURIComponent(nextCursor)}`, "href")}>Older orders</a> </p>`}` })}`}` })}`;
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

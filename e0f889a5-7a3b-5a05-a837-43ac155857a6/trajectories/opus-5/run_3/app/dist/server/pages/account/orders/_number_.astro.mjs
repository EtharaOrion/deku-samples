import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_5xqhq6uI.mjs';
import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { r as requirePageCustomer } from '../../../chunks/guard_CgiEvtXQ.mjs';
import { a as pageCart, b as apiGet } from '../../../chunks/server-fetch_DBHxzT0a.mjs';
import { o as orderChip, a as formatDateShort, b as formatMoney } from '../../../chunks/app_BbZzWQ31.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

function ClaimSerial({
  serial
}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  async function claim() {
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/account/devices", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          serial
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("idle");
        setError(body?.message || "That did not work.");
        return;
      }
      setState("done");
    } catch {
      setState("idle");
      setError("That did not work.");
    }
  }
  if (state === "done") {
    return jsxs("span", {
      class: "claimed small",
      role: "status",
      children: ["Registered to you.", jsx("style", {
        children: `.claimed { color: var(--done); }`
      })]
    });
  }
  return jsxs("span", {
    class: "claim",
    children: [jsx("button", {
      type: "button",
      class: "btn btn--secondary btn--small",
      onClick: claim,
      disabled: state === "working",
      children: state === "working" ? "Registering" : "Register to my account"
    }), error && jsx("span", {
      class: "claim__error small",
      role: "alert",
      children: error
    }), jsx("style", {
      children: `
        .claim { display: inline-flex; align-items: center; gap: calc(var(--unit) * 2); flex-wrap: wrap; }
        .claim__error { color: var(--error); }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const { customer, redirect } = await requirePageCustomer(Astro2);
  if (redirect) return redirect;
  const cart = await pageCart(Astro2);
  const res = await apiGet(`/api/account/orders/${encodeURIComponent(number)}`, Astro2);
  if (!res.ok) return new Response(null, { status: 404 });
  const order = res.body.order;
  const chip = orderChip(order);
  const goods = order.lines.filter((l) => l.kind !== "protection");
  const protection = order.lines.find((l) => l.kind === "protection");
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} \u2014 Vela`, "current": "orders", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs small" aria-label="Breadcrumb" data-astro-cid-th46ys4i> <a href="/account/orders" data-astro-cid-th46ys4i>Orders</a> <span aria-hidden="true" data-astro-cid-th46ys4i>/</span> <span aria-current="page" class="order-number" data-astro-cid-th46ys4i>${order.number}</span> </nav> <div class="page-head" data-astro-cid-th46ys4i> <div class="row row--between" data-astro-cid-th46ys4i> <h1 class="page-title order-number" data-astro-cid-th46ys4i>${order.number}</h1> <span${addAttribute(`chip chip--${chip.tone}`, "class")} data-astro-cid-th46ys4i>${chip.text}</span> </div> <p class="page-sub" data-astro-cid-th46ys4i>
Placed <time${addAttribute(order.placed_at, "datetime")} data-astro-cid-th46ys4i>${formatDateShort(order.placed_at)}</time> </p> </div> <div class="order-grid" data-astro-cid-th46ys4i> <div class="stack" data-astro-cid-th46ys4i> <section class="panel" data-astro-cid-th46ys4i> <h2 class="section-title" data-astro-cid-th46ys4i>The lines as they were bought</h2> <table class="table" data-astro-cid-th46ys4i> <thead data-astro-cid-th46ys4i> <tr data-astro-cid-th46ys4i> <th scope="col" data-astro-cid-th46ys4i>Item</th> <th scope="col" class="right" data-astro-cid-th46ys4i>Quantity</th> <th scope="col" class="right" data-astro-cid-th46ys4i>Unit</th> <th scope="col" class="right" data-astro-cid-th46ys4i>Total</th> </tr> </thead> <tbody data-astro-cid-th46ys4i> ${goods.map((line) => renderTemplate`<tr data-astro-cid-th46ys4i> <td data-astro-cid-th46ys4i> ${line.title} <br data-astro-cid-th46ys4i> <span class="mono small faint" data-astro-cid-th46ys4i>${line.sku}</span> </td> <td class="right num" data-astro-cid-th46ys4i>${line.quantity}</td> <td class="right money" data-astro-cid-th46ys4i>${formatMoney(line.unit_price_minor)}</td> <td class="right money" data-astro-cid-th46ys4i>${formatMoney(line.total_minor)}</td> </tr>`)} ${protection && renderTemplate`<tr data-astro-cid-th46ys4i> <td data-astro-cid-th46ys4i>Shipment protection</td> <td class="right num" data-astro-cid-th46ys4i>1</td> <td class="right money" data-astro-cid-th46ys4i>${formatMoney(protection.unit_price_minor)}</td> <td class="right money" data-astro-cid-th46ys4i>${formatMoney(protection.total_minor)}</td> </tr>`} </tbody> </table> </section> <!-- The only place a person finds their serial numbers without the camera
           in hand. --> <section class="panel" data-astro-cid-th46ys4i> <h2 class="section-title" data-astro-cid-th46ys4i>Serial numbers</h2> ${order.serials.length === 0 ? renderTemplate`<p class="muted small" data-astro-cid-th46ys4i>
We allocate serial numbers when the order ships. They will appear here.
</p>` : renderTemplate`<ul class="serial-list" role="list" data-astro-cid-th46ys4i> ${order.serials.map((s) => renderTemplate`<li class="serial-row" data-astro-cid-th46ys4i> <span data-astro-cid-th46ys4i> <span class="serial" data-astro-cid-th46ys4i>${s.serial}</span> <span class="muted small" data-astro-cid-th46ys4i> ${s.model}</span> </span> ${s.registered ? renderTemplate`<span class="chip chip--done" data-astro-cid-th46ys4i>Registered</span>` : renderTemplate`${renderComponent($$result2, "ClaimSerial", ClaimSerial, { "client:visible": true, "serial": s.serial, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/ClaimSerial.jsx", "client:component-export": "default", "data-astro-cid-th46ys4i": true })}`} </li>`)} </ul>`} </section> </div> <aside class="panel" data-astro-cid-th46ys4i> <h2 class="section-title" data-astro-cid-th46ys4i>Totals</h2> <dl class="totals" data-astro-cid-th46ys4i> <div class="totals__row" data-astro-cid-th46ys4i> <dt data-astro-cid-th46ys4i>Subtotal</dt> <dd class="money" data-astro-cid-th46ys4i>${formatMoney(order.subtotal_minor)}</dd> </div> <div class="totals__row" data-astro-cid-th46ys4i> <dt data-astro-cid-th46ys4i>Delivery (${order.shipping_method})</dt> <dd class="money" data-astro-cid-th46ys4i>${formatMoney(order.shipping_minor)}</dd> </div> <div class="totals__row" data-astro-cid-th46ys4i> <dt data-astro-cid-th46ys4i>Tax</dt> <dd class="money" data-astro-cid-th46ys4i>${formatMoney(order.tax_minor)}</dd> </div> <div class="totals__row totals__row--total" data-astro-cid-th46ys4i> <dt data-astro-cid-th46ys4i>Total</dt> <dd class="money strong" data-astro-cid-th46ys4i>${formatMoney(order.total_minor)}</dd> </div> </dl> <h3 class="addr-head" data-astro-cid-th46ys4i>Where it went</h3> <p class="small muted addr" data-astro-cid-th46ys4i> ${order.shipping_address.name}<br data-astro-cid-th46ys4i> ${order.shipping_address.line1}<br data-astro-cid-th46ys4i> ${order.shipping_address.city}, ${order.shipping_address.region}${" "} <span class="num" data-astro-cid-th46ys4i>${order.shipping_address.postal_code}</span><br data-astro-cid-th46ys4i> ${order.shipping_address.country} </p> </aside> </div> ` })} `;
}, "/app/src/pages/account/orders/[number].astro", void 0);

const $$file = "/app/src/pages/account/orders/[number].astro";
const $$url = "/account/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

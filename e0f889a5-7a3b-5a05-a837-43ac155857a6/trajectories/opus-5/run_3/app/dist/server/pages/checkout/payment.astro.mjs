import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_D1__LMg2.mjs';
import { useState, useRef } from 'preact/hooks';
import { b as formatMoney } from '../../chunks/app_BbZzWQ31.mjs';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { p as pageCustomer, a as pageCart } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { a as redirectKeeping } from '../../chunks/guard_CgiEvtXQ.mjs';
/* empty css                                      */
export { renderers } from '../../renderers.mjs';

function PlaceOrder({
  totalMinor
}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const keyRef = useRef(null);
  function idempotencyKey() {
    if (keyRef.current) return keyRef.current;
    let key = null;
    try {
      key = sessionStorage.getItem("vela:idempotency");
    } catch {
      key = null;
    }
    if (!key) {
      key = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID() || `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        sessionStorage.setItem("vela:idempotency", key);
      } catch {
      }
    }
    keyRef.current = key;
    return key;
  }
  async function place() {
    if (state === "working") return;
    const key = idempotencyKey();
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify({
          expected_total_minor: totalMinor
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("idle");
        if (body?.code === "price_changed" || body?.code === "total_changed") {
          window.location.assign("/cart");
          return;
        }
        setError(body?.message || "That did not work.");
        return;
      }
      try {
        sessionStorage.removeItem("vela:idempotency");
      } catch {
      }
      const order = body.order;
      const token = order.access_token ? `?access_token=${encodeURIComponent(order.access_token)}` : "";
      window.location.assign(`/orders/${order.number}${token}`);
    } catch {
      setState("idle");
      setError("That did not work.");
    }
  }
  return jsxs("div", {
    class: "place",
    children: [error && jsx("div", {
      class: "notice notice--error",
      role: "alert",
      children: jsx("span", {
        class: "notice__body",
        children: error
      })
    }), jsx("button", {
      class: "btn place__btn",
      type: "button",
      onClick: place,
      disabled: state === "working",
      children: state === "working" ? "Placing your order" : `Place order — ${formatMoney(totalMinor)}`
    }), jsx("p", {
      class: "live-region small muted",
      role: "status",
      "aria-live": "polite",
      children: state === "working" ? "Placing your order" : ""
    }), jsx("style", {
      children: `
        .place__btn { width: 100%; }
        .live-region { min-height: 21px; margin: calc(var(--unit) * 2) 0 0; }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const empty = !cart || cart.lines.length === 0;
  if (!empty && !cart.shipping_address) return redirectKeeping(Astro2, "/checkout/where-it-goes");
  if (!empty && !cart.shipping_method) return redirectKeeping(Astro2, "/checkout/how-it-gets-there");
  const address = cart?.shipping_address ?? {};
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment \u2014 Vela", "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-j4t6opjn": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-j4t6opjn> <h1 class="page-title" data-astro-cid-j4t6opjn>Payment</h1> </div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 3, "data-astro-cid-j4t6opjn": true })} ${empty ? renderTemplate`<div class="empty" data-astro-cid-j4t6opjn> <p data-astro-cid-j4t6opjn>Your cart is empty.</p> <p data-astro-cid-j4t6opjn> <a href="/shop" data-astro-cid-j4t6opjn>Shop</a> </p> </div>` : renderTemplate`<div class="checkout" data-astro-cid-j4t6opjn> <div class="stack" data-astro-cid-j4t6opjn> <section class="panel" data-astro-cid-j4t6opjn> <h2 class="section-title" data-astro-cid-j4t6opjn>Where it goes</h2> <p class="review" data-astro-cid-j4t6opjn> ${cart.email} <br data-astro-cid-j4t6opjn> ${address.name} <br data-astro-cid-j4t6opjn> ${address.line1} ${address.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-j4t6opjn": true }, { "default": async ($$result3) => renderTemplate` <br data-astro-cid-j4t6opjn> ${address.line2}` })}` : null} <br data-astro-cid-j4t6opjn> ${address.city}, ${address.region} <span class="num" data-astro-cid-j4t6opjn>${address.postal_code}</span> <br data-astro-cid-j4t6opjn> ${address.country} </p> <a class="btn btn--quiet btn--small" href="/checkout/where-it-goes" data-astro-cid-j4t6opjn>
Change
</a> </section> <section class="panel" data-astro-cid-j4t6opjn> <h2 class="section-title" data-astro-cid-j4t6opjn>How it gets there</h2> <p class="review" data-astro-cid-j4t6opjn> <span class="strong" data-astro-cid-j4t6opjn>${cart.shipping_method}</span> <span class="money" data-astro-cid-j4t6opjn> ${formatMoney(cart.shipping_minor)}</span> </p> <a class="btn btn--quiet btn--small" href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>
Change
</a> </section> <section class="panel" data-astro-cid-j4t6opjn> <h2 class="section-title" data-astro-cid-j4t6opjn>Place the order</h2> <p class="muted small" data-astro-cid-j4t6opjn>
We raise an invoice for this order and email the confirmation to ${cart.email}.
</p> ${renderComponent($$result2, "PlaceOrder", PlaceOrder, { "client:load": true, "totalMinor": cart.total_minor, "client:component-hydration": "load", "client:component-path": "/app/src/islands/PlaceOrder.jsx", "client:component-export": "default", "data-astro-cid-j4t6opjn": true })} </section> </div>  ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": true, "data-astro-cid-j4t6opjn": true })} </div>`}` })} `;
}, "/app/src/pages/checkout/payment.astro", void 0);

const $$file = "/app/src/pages/checkout/payment.astro";
const $$url = "/checkout/payment";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Payment,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

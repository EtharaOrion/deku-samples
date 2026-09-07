import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { f as formatMinor, a as api, p as publishCartCount, v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSteps_BceEfKe0.mjs';
import { useState, useRef } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { a as apiGet, b as formatMinor$1 } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

function PlaceOrder({
  totalMinor
}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const keyRef = useRef(null);
  if (!keyRef.current) {
    keyRef.current = crypto.randomUUID && crypto.randomUUID() || `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const place = async () => {
    if (state === "placing") return;
    setState("placing");
    setError(null);
    try {
      const d = await api("/orders", {
        method: "POST",
        headers: {
          "idempotency-key": keyRef.current
        },
        body: {
          expected_total_minor: totalMinor
        }
      });
      try {
        const held = JSON.parse(decodeURIComponent((document.cookie.match(/(?:^|; )vela_order_tokens=([^;]*)/) || [])[1] || "{}"));
        held[d.order.number] = d.access_token;
        document.cookie = `vela_order_tokens=${encodeURIComponent(JSON.stringify(held))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
      } catch {
      }
      publishCartCount(0);
      window.location.assign(`/orders/${d.order.number}?placed=1`);
    } catch (err) {
      setState("idle");
      if (err.code === "price_changed" || err.code === "total_changed") {
        window.location.assign("/cart?repriced=1");
        return;
      }
      setError(err.code === "out_of_stock" ? `${err.data?.title || "An item"} sold out while you were checking out. Your cart has been left as it is.` : err.message);
    }
  };
  return jsxs("div", {
    children: [jsx("button", {
      type: "button",
      class: "btn",
      onClick: place,
      disabled: state === "placing",
      style: "width:100%",
      children: state === "placing" ? "Placing your order" : `Place the order — ${formatMinor(totalMinor)}`
    }), jsx("p", {
      class: "small muted",
      "aria-live": "polite",
      style: "margin-top:calc(var(--unit)*3)",
      children: state === "placing" ? "Placing your order" : "We will email a confirmation once the order is placed."
    }), error && jsxs("div", {
      class: "notice notice-danger",
      role: "alert",
      style: "margin-top:calc(var(--unit)*4)",
      children: [jsx("p", {
        children: error
      }), jsxs("p", {
        class: "small",
        style: "margin-top:var(--unit)",
        children: [jsx("a", {
          href: "/cart",
          children: "Go back to the cart"
        }), "."]
      })]
    })]
  });
}

const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  const v = await viewer(Astro2);
  const res = v.cartToken ? await apiGet(Astro2.request, "/cart", { cartToken: v.cartToken }) : null;
  const cart = res && res.ok ? res.data.cart : null;
  if (!cart || cart.lines.length === 0) {
    return new Response(null, { status: 302, headers: { location: "/cart" } });
  }
  if (!cart.email || !cart.shipping_address) {
    return new Response(null, { status: 302, headers: { location: "/checkout/where-it-goes" } });
  }
  if (!cart.shipping_method) {
    return new Response(null, { status: 302, headers: { location: "/checkout/how-it-gets-there" } });
  }
  const a = cart.shipping_address;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Payment</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": 3 })} <div class="checkout-layout"> <div>  ${cart.notices.length > 0 && renderTemplate`<div class="notice notice-danger" role="alert"> ${cart.notices.map((n) => renderTemplate`<p>${n.message}</p>`)} <p class="small" style="margin-top:var(--unit)"><a href="/cart">Review your cart</a>.</p> </div>`} <section class="section"> <h2 class="section-title">Review</h2> <div class="grid-2" style="margin-bottom:calc(var(--unit)*6)"> <div> <h3 style="font-size:14px;line-height:21px;margin-bottom:calc(var(--unit)*2)">Where it goes</h3> <p class="small">${a.name}</p> <p class="small muted">${a.line1}</p> ${a.line2 && renderTemplate`<p class="small muted">${a.line2}</p>`} <p class="small muted">${a.city}, ${a.region} <span class="tnum">${a.postal_code}</span></p> <p class="small muted">${a.country}</p> <p class="small muted" style="margin-top:calc(var(--unit)*2)">${cart.email}</p> <p class="small" style="margin-top:calc(var(--unit)*2)"><a href="/checkout/where-it-goes">Change</a></p> </div> <div> <h3 style="font-size:14px;line-height:21px;margin-bottom:calc(var(--unit)*2)">How it gets there</h3> <p class="small">${cart.shipping_method}</p> <p class="small muted money">${formatMinor$1(cart.shipping_minor)}</p> <p class="small" style="margin-top:calc(var(--unit)*2)"><a href="/checkout/how-it-gets-there">Change</a></p> </div> </div> <h3 style="font-size:14px;line-height:21px;margin-bottom:calc(var(--unit)*2)">What you are buying</h3> <table class="data" style="margin-bottom:calc(var(--unit)*6)"> <thead> <tr> <th scope="col">Item</th> <th scope="col" class="num">Quantity</th> <th scope="col" class="num">Total</th> </tr> </thead> <tbody> ${cart.lines.map((l) => renderTemplate`<tr> <td>${l.title} <span class="muted">— ${l.option_value}</span></td> <td class="num tnum">${l.quantity}</td> <td class="num money">${formatMinor$1(l.total_minor)}</td> </tr>`)} ${cart.protection_line && renderTemplate`<tr> <td>Shipment protection</td> <td class="num tnum">1</td> <td class="num money">${formatMinor$1(cart.protection_minor)}</td> </tr>`} </tbody> </table> <p style="font-size:20px;font-weight:700;margin-bottom:calc(var(--unit)*5)" class="money">
Total ${formatMinor$1(cart.total_minor)} </p> ${renderComponent($$result2, "PlaceOrder", PlaceOrder, { "client:load": true, "totalMinor": cart.total_minor, "client:component-hydration": "load", "client:component-path": "/app/src/islands/PlaceOrder.jsx", "client:component-export": "default" })} <noscript> <p class="small muted" style="margin-top:calc(var(--unit)*3)">
Placing the order needs scripting. Everything above is the exact amount you will be invoiced.
</p> </noscript> </section> </div> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": true })} </div> ` })}`;
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

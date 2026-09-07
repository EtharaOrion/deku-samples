import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_CvfgCW3U.mjs';
import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { C as CART_COOKIE, c as currentCustomer, d as currentCart } from '../../chunks/server_SMyiD-DF.mjs';
import { a as placeOrder } from '../../chunks/orders_D-zVuqOa.mjs';
import { a as formatMinor } from '../../chunks/format_y0Y9nLbA.mjs';
import { randomUUID } from 'node:crypto';
/* empty css                                      */
export { renderers } from '../../renderers.mjs';

function PlaceOrder({
  idempotencyKey
}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  async function place() {
    if (state === "working") return;
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey
        }
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.code === "price_changed" || body.code === "line_unavailable") {
          window.location.assign("/cart");
          return;
        }
        setState("error");
        setError(body.message || "That did not work.");
        return;
      }
      const token = body.access_token ? `?access_token=${encodeURIComponent(body.access_token)}` : "";
      window.location.assign(`/orders/${body.number}${token}`);
    } catch {
      setState("error");
      setError("That did not work. Check your connection and try again.");
    }
  }
  return jsxs("div", {
    class: "place",
    children: [jsx("button", {
      type: "button",
      class: "btn btn-primary",
      onClick: place,
      disabled: state === "working",
      children: state === "working" ? "Placing your order" : "Place order"
    }), jsxs("p", {
      class: "live",
      role: "status",
      "aria-live": "polite",
      children: [state === "working" && jsx("span", {
        children: "Placing your order"
      }), error && jsx("span", {
        class: "error-text",
        children: error
      })]
    }), jsx("style", {
      children: `
        .place { display: flex; flex-direction: column; gap: calc(var(--space) * 2); align-items: flex-start; }
        .place .btn { min-width: 200px; }
        .live { min-height: 21px; font-size: 14px; }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  let errorMessage = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const token = Astro2.cookies.get(CART_COOKIE)?.value;
    const customer = await currentCustomer(Astro2);
    try {
      const { order, access_token } = await placeOrder({
        cartToken: token,
        customerId: customer ? customer.id : null,
        idempotencyKey: String(form.get("idempotency_key") || randomUUID()),
        requestId: Astro2.locals?.requestId || "ssr"
      });
      Astro2.cookies.delete(CART_COOKIE, { path: "/" });
      const query = access_token ? `?access_token=${encodeURIComponent(access_token)}` : "";
      return Astro2.redirect(`/orders/${order.number}${query}`);
    } catch (err) {
      if (err.code === "price_changed" || err.code === "line_unavailable") {
        return Astro2.redirect("/cart");
      }
      errorMessage = err.message || "That did not work.";
    }
  }
  const cart = await currentCart(Astro2);
  if (!cart || !cart.lines.length) return Astro2.redirect("/cart");
  if (!cart.email || !cart.shipping_address) return Astro2.redirect("/checkout/where-it-goes");
  if (!cart.shipping_method) return Astro2.redirect("/checkout/how-it-gets-there");
  const idempotencyKey = randomUUID();
  const address = cart.shipping_address;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment \u2014 Vela", "description": "Review and place your order.", "data-astro-cid-j4t6opjn": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-j4t6opjn> <h1 data-astro-cid-j4t6opjn>Check out</h1> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "current": "payment", "data-astro-cid-j4t6opjn": true })} <div class="checkout-grid" data-astro-cid-j4t6opjn> <section class="form" data-astro-cid-j4t6opjn> <h2 data-astro-cid-j4t6opjn>Payment</h2> ${errorMessage && renderTemplate`<p class="notice notice-danger" role="alert" data-astro-cid-j4t6opjn>${errorMessage}</p>`} <div class="review card" data-astro-cid-j4t6opjn> <div class="review-row" data-astro-cid-j4t6opjn> <h3 data-astro-cid-j4t6opjn>Going to</h3> <p data-astro-cid-j4t6opjn>${address.name}</p> <p data-astro-cid-j4t6opjn>${address.line1}${address.line2 ? `, ${address.line2}` : ""}</p> <p data-astro-cid-j4t6opjn>${address.city}, ${address.region} <span class="tnum" data-astro-cid-j4t6opjn>${address.postal_code}</span></p> <p class="hint" data-astro-cid-j4t6opjn>${cart.email}</p> <a class="edit" href="/checkout/where-it-goes" data-astro-cid-j4t6opjn>Change</a> </div> <div class="review-row" data-astro-cid-j4t6opjn> <h3 data-astro-cid-j4t6opjn>Delivery</h3> <p data-astro-cid-j4t6opjn>${cart.shipping_method_title}</p> <a class="edit" href="/checkout/how-it-gets-there" data-astro-cid-j4t6opjn>Change</a> </div> </div> <p class="final" data-astro-cid-j4t6opjn> <span data-astro-cid-j4t6opjn>Total to authorize</span> <strong class="money tnum" data-astro-cid-j4t6opjn>${formatMinor(cart.total_minor)}</strong> </p> ${renderComponent($$result2, "PlaceOrder", PlaceOrder, { "client:load": true, "idempotencyKey": idempotencyKey, "total": cart.total_minor, "client:component-hydration": "load", "client:component-path": "/app/src/islands/PlaceOrder.jsx", "client:component-export": "default", "data-astro-cid-j4t6opjn": true })} <noscript> <form method="post" data-astro-cid-j4t6opjn> <input type="hidden" name="idempotency_key"${addAttribute(idempotencyKey, "value")} data-astro-cid-j4t6opjn> <button class="btn btn-primary" type="submit" data-astro-cid-j4t6opjn>Place order</button> </form> </noscript> </section> <!-- The figure the final step shows is the figure authorized. --> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": true, "data-astro-cid-j4t6opjn": true })} </div> </div> ` })} `;
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

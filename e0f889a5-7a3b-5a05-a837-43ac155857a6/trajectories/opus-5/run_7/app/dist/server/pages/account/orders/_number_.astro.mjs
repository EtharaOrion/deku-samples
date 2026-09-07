import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { a as api, b as announce, v as viewer, s as signInRedirect, $ as $$Shell } from '../../../chunks/page_CERy5BG_.mjs';
import { useState } from 'preact/hooks';
import { jsx, jsxs } from 'preact/jsx-runtime';
import { a as apiGet, f as formatDate, b as formatMinor } from '../../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../../renderers.mjs';

function RegisterSerialButton({
  serial
}) {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const register = async () => {
    setState("working");
    setError(null);
    try {
      await api("/account/devices", {
        method: "POST",
        body: {
          serial
        },
        auth: true
      });
      setState("done");
      announce(`${serial} is on your account.`);
    } catch (err) {
      setState("idle");
      setError(err.message);
      announce(err.message);
    }
  };
  if (state === "done") return jsx("span", {
    class: "chip chip-done",
    children: "Registered"
  });
  return jsxs("span", {
    children: [jsx("button", {
      type: "button",
      class: "btn btn-secondary btn-sm",
      onClick: register,
      disabled: state === "working",
      children: state === "working" ? "Registering" : "Register to my account"
    }), error && jsx("span", {
      class: "field-error",
      role: "alert",
      style: "display:block",
      children: error
    })]
  });
}

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const v = await viewer(Astro2);
  if (!v.signedIn) return signInRedirect(Astro2);
  const { number } = Astro2.params;
  const res = await apiGet(Astro2.request, `/account/orders/${encodeURIComponent(number)}`, { token: v.token });
  const order = res.ok ? res.data.order : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number} \u2014 Vela` : "Order \u2014 Vela", "signedIn": true, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate`${!order ? renderTemplate`${maybeRenderHead()}<div> <h1 class="page-title">That order does not exist.</h1> <p class="page-lede">It may belong to another account.</p> <p><a class="btn btn-secondary" href="/account/orders">Your orders</a></p> </div>` : renderTemplate`<div> <nav aria-label="Breadcrumb" class="small muted" style="margin-bottom:calc(var(--unit)*4)"> <a href="/account/orders">Orders</a> <span aria-hidden="true">/</span> <span>${order.number}</span> </nav> <h1 class="page-title">Order <span class="order-number">${order.number}</span></h1> <p class="page-lede">
Placed ${formatDate(order.placed_at)}. <span class="chip">${order.state_phrase}</span> </p> <section class="section" aria-labelledby="lines-h"> <h2 class="section-title" id="lines-h">The lines as they were bought</h2> <table class="data" style="max-width:60rem"> <thead> <tr> <th scope="col">Item</th> <th scope="col">SKU</th> <th scope="col" class="num">Quantity</th> <th scope="col" class="num">Unit</th> <th scope="col" class="num">Total</th> </tr> </thead> <tbody> ${order.lines.map((l) => renderTemplate`<tr> <td>${l.title}</td> <td class="mono small">${l.sku}</td> <td class="num tnum">${l.quantity}</td> <td class="num money">${formatMinor(l.unit_price_minor)}</td> <td class="num money">${formatMinor(l.total_minor)}</td> </tr>`)} </tbody> <tfoot> <tr><th scope="row" colspan="4" style="font-weight:400">Subtotal</th><td class="num money">${formatMinor(order.subtotal_minor)}</td></tr> <tr><th scope="row" colspan="4" style="font-weight:400">Delivery (${order.shipping_method})</th><td class="num money">${formatMinor(order.shipping_minor)}</td></tr> <tr><th scope="row" colspan="4" style="font-weight:400">Tax</th><td class="num money">${formatMinor(order.tax_minor)}</td></tr> <tr><th scope="row" colspan="4">Total</th><td class="num money" style="font-weight:700">${formatMinor(order.total_minor)}</td></tr> </tfoot> </table> </section> ${order.serials.length > 0 && renderTemplate`<section class="section" aria-labelledby="serials-h"> <h2 class="section-title" id="serials-h">Serial numbers</h2> <table class="data" style="max-width:52rem"> <thead> <tr><th scope="col">Serial</th><th scope="col">Model</th><th scope="col">On your account</th></tr> </thead> <tbody> ${order.serials.map((s) => renderTemplate`<tr> <td class="serial">${s.serial}</td> <td>${s.model}</td> <td> ${s.registered ? renderTemplate`<span class="chip chip-done">Registered</span>` : (
    /* One click registers it to this account. */
    renderTemplate`${renderComponent($$result2, "RegisterSerialButton", RegisterSerialButton, { "client:visible": true, "serial": s.serial, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/RegisterSerialButton.jsx", "client:component-export": "default" })}`
  )} </td> </tr>`)} </tbody> </table> </section>`} <section class="section" aria-labelledby="addr-h"> <h2 class="section-title" id="addr-h">Where it went</h2> <p class="small">${order.shipping_address.name}</p> <p class="small muted">${order.shipping_address.line1}</p> ${order.shipping_address.line2 && renderTemplate`<p class="small muted">${order.shipping_address.line2}</p>`} <p class="small muted"> ${order.shipping_address.city}, ${order.shipping_address.region}${" "} <span class="tnum">${order.shipping_address.postal_code}</span> </p> <p class="small muted">${order.shipping_address.country}</p> <p class="small muted" style="margin-top:calc(var(--unit)*2)">${order.email}</p> </section> </div>`}` })}`;
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

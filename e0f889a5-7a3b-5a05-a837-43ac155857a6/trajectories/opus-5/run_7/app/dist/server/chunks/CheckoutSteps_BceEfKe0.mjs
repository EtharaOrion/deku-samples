import { e as createComponent, m as maybeRenderHead, r as renderTemplate, h as createAstro, g as addAttribute } from './astro/server_rOUT-VGP.mjs';
import 'piccolore';
import 'clsx';
import { b as formatMinor } from './api_D4zreuKm.mjs';

const $$Astro$1 = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { cart, exact = false } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<aside class="card checkout-summary" aria-label="Order summary"> <h2 style="font-size:16px;line-height:24px;margin-bottom:calc(var(--unit)*4)">Your order</h2> <ul style="list-style:none;padding:0;margin:0 0 calc(var(--unit)*4)" class="stack"> ${cart.lines.map((l) => renderTemplate`<li class="row-between" style="gap:calc(var(--unit)*3);align-items:flex-start"> <span class="small"> ${l.title} <span class="muted"> — ${l.option_value}</span> <span class="muted tnum"> × ${l.quantity}</span> </span> <span class="small money">${formatMinor(l.total_minor)}</span> </li>`)} ${cart.protection_line && renderTemplate`<li class="row-between" style="gap:calc(var(--unit)*3)"> <span class="small">Shipment protection</span> <span class="small money">${formatMinor(cart.protection_minor)}</span> </li>`} </ul> <table class="data"> <tbody> <tr> <th scope="row" style="font-weight:400">${exact ? "Subtotal" : "Estimated subtotal"}</th> <td class="num money">${formatMinor(cart.subtotal_minor)}</td> </tr> <tr> <th scope="row" style="font-weight:400"> ${exact ? "Delivery" : "Estimated delivery"} ${cart.shipping_method && renderTemplate`<span class="muted small"> (${cart.shipping_method})</span>`} </th> <td class="num money">${cart.shipping_method ? formatMinor(cart.shipping_minor) : "\u2014"}</td> </tr> <tr> <th scope="row" style="font-weight:400">${exact ? "Tax" : "Estimated tax"}</th> <td class="num money">${formatMinor(cart.tax_minor)}</td> </tr> <tr> <th scope="row" style="font-weight:700">${exact ? "Total" : "Estimated total"}</th> <td class="num money" style="font-weight:700">${formatMinor(cart.total_minor)}</td> </tr> </tbody> </table> ${!exact && renderTemplate`<p class="small muted" style="margin-top:calc(var(--unit)*3)">
Estimated. We will show the exact amount once we know where it is going.
</p>`} </aside>`;
}, "/app/src/components/CheckoutSummary.astro", void 0);

const $$Astro = createAstro();
const $$CheckoutSteps = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSteps;
  const { current = 1 } = Astro2.props;
  const steps = [
    { n: 1, label: "Where it goes", href: "/checkout/where-it-goes" },
    { n: 2, label: "How it gets there", href: "/checkout/how-it-gets-there" },
    { n: 3, label: "Payment", href: "/checkout/payment" }
  ];
  return renderTemplate`${maybeRenderHead()}<nav aria-label="Checkout steps" style="margin-bottom:calc(var(--unit)*8)"> <ol style="list-style:none;padding:0;margin:0;display:flex;gap:calc(var(--unit)*5);flex-wrap:wrap"> ${steps.map((s) => renderTemplate`<li class="row" style="gap:calc(var(--unit)*2)"> <span class="chip tnum" aria-hidden="true">${s.n}</span> ${s.n < current ? renderTemplate`<a${addAttribute(s.href, "href")} class="small">${s.label}</a>` : renderTemplate`<span class="small"${addAttribute(s.n === current ? "font-weight:700" : "color:var(--fg-muted)", "style")}${addAttribute(s.n === current ? "step" : void 0, "aria-current")}> ${s.label} </span>`} </li>`)} </ol> </nav>`;
}, "/app/src/components/CheckoutSteps.astro", void 0);

export { $$CheckoutSteps as $, $$CheckoutSummary as a };

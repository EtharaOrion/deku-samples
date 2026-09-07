import { c as createComponent, m as maybeRenderHead, r as renderTemplate, b as createAstro, a as addAttribute } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import 'clsx';
import { c as formatMoney } from './api_eUbQd3xF.mjs';
/* empty css                                     */

const $$Astro$1 = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { cart, exact = false } = Astro2.props;
  const goods = (cart.lines || []).filter((l) => l.kind !== "protection");
  const label = (base) => exact ? base : `Estimated ${base.toLowerCase()}`;
  return renderTemplate`<!-- A persistent summary sits beside all three steps. -->${maybeRenderHead()}<aside class="summary" aria-labelledby="checkout-summary-heading" data-astro-cid-r7eb5hxj> <h2 id="checkout-summary-heading" data-astro-cid-r7eb5hxj>Your order</h2> <ul class="lines" data-astro-cid-r7eb5hxj> ${goods.map((line) => renderTemplate`<li data-astro-cid-r7eb5hxj> <span class="qty tnum" data-astro-cid-r7eb5hxj>${line.quantity}</span> <span class="title" data-astro-cid-r7eb5hxj>${line.title}<span class="opt" data-astro-cid-r7eb5hxj> · ${line.option_value}</span></span> <span class="amount tnum" data-astro-cid-r7eb5hxj>${formatMoney(line.total_minor)}</span> </li>`)} ${cart.protection_enabled && cart.protection_rung && renderTemplate`<li data-astro-cid-r7eb5hxj> <span class="qty tnum" data-astro-cid-r7eb5hxj>1</span> <span class="title" data-astro-cid-r7eb5hxj>Shipment protection</span> <span class="amount tnum" data-astro-cid-r7eb5hxj>${formatMoney(cart.protection_rung.price_minor)}</span> </li>`} </ul> <dl class="totals" data-astro-cid-r7eb5hxj> <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>${label("Subtotal")}</dt><dd class="tnum" data-astro-cid-r7eb5hxj>${formatMoney(cart.subtotal_minor)}</dd></div> <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>${label("Delivery")}</dt><dd class="tnum" data-astro-cid-r7eb5hxj>${formatMoney(cart.shipping_minor)}</dd></div> <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>${label("Tax")}</dt><dd class="tnum" data-astro-cid-r7eb5hxj>${formatMoney(cart.tax_minor)}</dd></div> <div class="grand" data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>${exact ? "Total" : "Estimated total"}</dt><dd class="tnum" data-astro-cid-r7eb5hxj>${formatMoney(cart.total_minor)}</dd></div> </dl> ${!exact && renderTemplate`<p class="note" data-astro-cid-r7eb5hxj>Estimated. We will show the exact amount once we know where it is going.</p>`} </aside> `;
}, "/app/src/components/CheckoutSummary.astro", void 0);

const $$Astro = createAstro();
const $$CheckoutSteps = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSteps;
  const { step } = Astro2.props;
  const steps = [
    { n: 1, label: "Where it goes", href: "/checkout/where-it-goes" },
    { n: 2, label: "How it gets there", href: "/checkout/how-it-gets-there" },
    { n: 3, label: "Payment", href: "/checkout/payment" }
  ];
  return renderTemplate`${maybeRenderHead()}<nav class="steps" aria-label="Checkout steps" data-astro-cid-tuvqhivp> <ol data-astro-cid-tuvqhivp> ${steps.map((s) => renderTemplate`<li data-astro-cid-tuvqhivp> ${s.n < step ? renderTemplate`<a${addAttribute(s.href, "href")} data-astro-cid-tuvqhivp><span class="n tnum" data-astro-cid-tuvqhivp>${s.n}</span>${s.label}</a>` : renderTemplate`<span${addAttribute(s.n === step ? "step" : void 0, "aria-current")}${addAttribute(s.n === step ? "current" : "ahead", "class")} data-astro-cid-tuvqhivp> <span class="n tnum" data-astro-cid-tuvqhivp>${s.n}</span>${s.label} </span>`} </li>`)} </ol> </nav> `;
}, "/app/src/components/CheckoutSteps.astro", void 0);

export { $$CheckoutSteps as $, $$CheckoutSummary as a };

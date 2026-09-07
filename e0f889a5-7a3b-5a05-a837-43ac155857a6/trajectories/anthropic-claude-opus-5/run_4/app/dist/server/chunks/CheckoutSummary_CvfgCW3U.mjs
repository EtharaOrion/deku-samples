import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_Dku1auYb.mjs';
import 'piccolore';
import 'clsx';
/* empty css                                     */
import { a as formatMinor } from './format_y0Y9nLbA.mjs';

const $$Astro$1 = createAstro();
const $$CheckoutSteps = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CheckoutSteps;
  const { current } = Astro2.props;
  const steps = [
    { key: "where", href: "/checkout/where-it-goes", label: "Where it goes" },
    { key: "how", href: "/checkout/how-it-gets-there", label: "How it gets there" },
    { key: "payment", href: "/checkout/payment", label: "Payment" }
  ];
  const index = steps.findIndex((s) => s.key === current);
  return renderTemplate`${maybeRenderHead()}<nav aria-label="Checkout steps" data-astro-cid-tuvqhivp> <ol class="steps" data-astro-cid-tuvqhivp> ${steps.map((step, i) => renderTemplate`<li${addAttribute(["step", { current: step.key === current, done: i < index }], "class:list")} data-astro-cid-tuvqhivp> ${i < index ? renderTemplate`<a${addAttribute(step.href, "href")}${addAttribute(void 0, "aria-current")} data-astro-cid-tuvqhivp> <span class="n tnum" data-astro-cid-tuvqhivp>${i + 1}</span> <span data-astro-cid-tuvqhivp>${step.label}</span> </a>` : renderTemplate`<span${addAttribute(step.key === current ? "step" : void 0, "aria-current")} data-astro-cid-tuvqhivp> <span class="n tnum" data-astro-cid-tuvqhivp>${i + 1}</span> <span data-astro-cid-tuvqhivp>${step.label}</span> </span>`} </li>`)} </ol> </nav> `;
}, "/app/src/components/CheckoutSteps.astro", void 0);

const $$Astro = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { cart, exact = false } = Astro2.props;
  const label = exact ? "" : "Estimated ";
  return renderTemplate`${maybeRenderHead()}<aside class="summary card" aria-label="Order summary" data-astro-cid-r7eb5hxj> <h2 data-astro-cid-r7eb5hxj>Summary</h2> <ul class="lines" data-astro-cid-r7eb5hxj> ${cart.lines.map((line) => renderTemplate`<li data-astro-cid-r7eb5hxj> <span class="l-title" data-astro-cid-r7eb5hxj>${line.title} <span class="hint" data-astro-cid-r7eb5hxj>× ${line.quantity}</span></span> <span class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(line.line_total_minor)}</span> </li>`)} </ul> <dl class="totals" data-astro-cid-r7eb5hxj> <div data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Subtotal</dt> <dd class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(cart.subtotal_minor)}</dd> </div> <div data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>${label}delivery</dt> <dd class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(cart.shipping_minor)}</dd> </div> ${cart.protection_minor > 0 && renderTemplate`<div data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Shipment protection</dt> <dd class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(cart.protection_minor)}</dd> </div>`} <div data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>${label}tax</dt> <dd class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(cart.tax_minor)}</dd> </div> <div class="grand" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Total</dt> <dd class="money tnum" data-astro-cid-r7eb5hxj>${formatMinor(cart.total_minor)}</dd> </div> </dl> ${!exact && renderTemplate`<p class="hint" data-astro-cid-r7eb5hxj>Estimated. We will show the exact amount once we know where it is going.</p>`} </aside> `;
}, "/app/src/components/CheckoutSummary.astro", void 0);

export { $$CheckoutSteps as $, $$CheckoutSummary as a };

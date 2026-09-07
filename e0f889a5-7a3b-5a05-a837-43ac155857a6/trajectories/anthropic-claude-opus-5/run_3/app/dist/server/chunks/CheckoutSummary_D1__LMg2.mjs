import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_BMi1VkyI.mjs';
import 'piccolore';
import 'clsx';
/* empty css                                     */
import { b as formatMoney } from './app_BbZzWQ31.mjs';

const $$Astro$1 = createAstro();
const $$CheckoutSteps = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$CheckoutSteps;
  const { step } = Astro2.props;
  const steps = [
    { n: 1, label: "Where it goes", href: "/checkout/where-it-goes" },
    { n: 2, label: "How it gets there", href: "/checkout/how-it-gets-there" },
    { n: 3, label: "Payment", href: "/checkout/payment" }
  ];
  return renderTemplate`${maybeRenderHead()}<nav class="steps" aria-label="Checkout steps" data-astro-cid-tuvqhivp> <ol class="steps__list" data-astro-cid-tuvqhivp> ${steps.map((s) => renderTemplate`<li${addAttribute(`steps__item ${s.n === step ? "is-current" : ""}`, "class")} data-astro-cid-tuvqhivp> ${s.n < step ? renderTemplate`<a${addAttribute(s.href, "href")}${addAttribute(void 0, "aria-current")} data-astro-cid-tuvqhivp> <span class="steps__n num" data-astro-cid-tuvqhivp>${s.n}</span> <span data-astro-cid-tuvqhivp>${s.label}</span> </a>` : renderTemplate`<span${addAttribute(s.n === step ? "step" : void 0, "aria-current")} data-astro-cid-tuvqhivp> <span class="steps__n num" data-astro-cid-tuvqhivp>${s.n}</span> <span data-astro-cid-tuvqhivp>${s.label}</span> </span>`} </li>`)} </ol> </nav> `;
}, "/app/src/components/CheckoutSteps.astro", void 0);

const $$Astro = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { cart, exact = false } = Astro2.props;
  const label = exact ? "" : "Estimated ";
  return renderTemplate`${maybeRenderHead()}<aside class="panel checkout-summary" aria-label="Order summary" data-astro-cid-r7eb5hxj> <h2 class="section-title" data-astro-cid-r7eb5hxj>Summary</h2> <ul class="summary-lines" role="list" data-astro-cid-r7eb5hxj> ${cart.lines.map((line) => renderTemplate`<li class="summary-line" data-astro-cid-r7eb5hxj> <span data-astro-cid-r7eb5hxj> ${line.title} <span class="muted" data-astro-cid-r7eb5hxj> ×${line.quantity}</span> </span> <span class="money" data-astro-cid-r7eb5hxj>${formatMoney(line.total_minor)}</span> </li>`)} </ul> <dl class="totals" data-astro-cid-r7eb5hxj> <div class="totals__row" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Subtotal</dt> <dd class="money" data-astro-cid-r7eb5hxj>${formatMoney(cart.subtotal_minor)}</dd> </div> ${cart.protection_minor > 0 && renderTemplate`<div class="totals__row" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Shipment protection</dt> <dd class="money" data-astro-cid-r7eb5hxj>${formatMoney(cart.protection_minor)}</dd> </div>`} <div class="totals__row" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>${label}Delivery</dt> <dd class="money" data-astro-cid-r7eb5hxj>${formatMoney(cart.shipping_minor)}</dd> </div> <div class="totals__row" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>${label}Tax</dt> <dd class="money" data-astro-cid-r7eb5hxj>${formatMoney(cart.tax_minor)}</dd> </div> <div class="totals__row totals__row--total" data-astro-cid-r7eb5hxj> <dt data-astro-cid-r7eb5hxj>Total</dt> <dd class="money strong" data-astro-cid-r7eb5hxj>${formatMoney(cart.total_minor)}</dd> </div> </dl> ${!exact && renderTemplate`<p class="small muted" data-astro-cid-r7eb5hxj>
Estimated. We will show the exact amount once we know where it is going.
</p>`} </aside> `;
}, "/app/src/components/CheckoutSummary.astro", void 0);

export { $$CheckoutSteps as $, $$CheckoutSummary as a };

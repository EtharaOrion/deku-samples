import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import 'clsx';
import { f as formatMinor } from './api_-Wd5sQnB.mjs';

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
  return renderTemplate`${maybeRenderHead()}<nav aria-label="Checkout steps"> <ol class="steps"> ${steps.map((s) => renderTemplate`<li${addAttribute(s.n === step ? "step" : void 0, "aria-current")}> ${s.n < step ? renderTemplate`<a${addAttribute(s.href, "href")}>${s.n}. ${s.label}</a>` : renderTemplate`<span>${s.n}. ${s.label}</span>`} </li>`)} </ol> </nav>`;
}, "/app/src/components/CheckoutSteps.astro", void 0);

const $$Astro = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { cart, exact = false } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<aside class="summary" aria-labelledby="co-summary"> <h2 id="co-summary">Your order</h2> <table class="table" style="margin-bottom: 1rem"> <tbody> ${cart.lines.map((l) => renderTemplate`<tr> <td>${l.title}<br><span class="muted small">${l.option_value} · ${l.quantity} × ${formatMinor(l.unit_price_minor)}</span></td> <td class="num money">${formatMinor(l.total_minor)}</td> </tr>`)} ${cart.protection_enabled && renderTemplate`<tr> <td>Shipment protection</td> <td class="num money">${formatMinor(cart.protection_minor)}</td> </tr>`} </tbody> </table> <table class="totals"> <tbody> <tr><td>Subtotal</td><td class="money">${formatMinor(cart.subtotal_minor)}</td></tr> <tr><td>${exact ? "Delivery" : "Estimated delivery"}</td><td class="money">${formatMinor(cart.shipping_minor)}</td></tr> <tr><td>${exact ? "Tax" : "Estimated tax"}</td><td class="money">${formatMinor(cart.tax_minor)}</td></tr> <tr class="total-row"><td>Total</td><td class="money">${formatMinor(cart.total_minor)}</td></tr> </tbody> </table> ${!exact && renderTemplate`<p class="muted small" style="margin-top: 1rem">
Estimated. We will show the exact amount once we know where it is going.
</p>`} </aside>`;
}, "/app/src/components/CheckoutSummary.astro", void 0);

export { $$CheckoutSteps as $, $$CheckoutSummary as a };

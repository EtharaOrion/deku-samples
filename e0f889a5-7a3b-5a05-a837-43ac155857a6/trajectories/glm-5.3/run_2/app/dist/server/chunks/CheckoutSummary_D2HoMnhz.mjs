import { c as createComponent, m as maybeRenderHead, r as renderTemplate, a as addAttribute, b as createAstro } from "./astro/server_BSRltX1G.mjs";
import "kleur/colors";
import "clsx";
import { m as money } from "./format_F6jgEW4F.mjs";
/* empty css                                     */
const $$Astro = createAstro();
const $$CheckoutSummary = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CheckoutSummary;
  const { view, step } = Astro2.props;
  const steps = [
    { href: "/checkout/where-it-goes", label: "Where it goes" },
    { href: "/checkout/how-it-gets-there", label: "How it gets there" },
    { href: "/checkout/payment", label: "Payment" }
  ];
  const protectionPrice = view.protection_rung ? { "VELA-PROTECT-1": 98, "VELA-PROTECT-2": 298, "VELA-PROTECT-3": 598, "VELA-PROTECT-4": 1198 }[view.protection_rung] ?? 0 : 0;
  return renderTemplate`${maybeRenderHead()}<aside class="summary card" aria-label="Order summary" data-astro-cid-r7eb5hxj> <h2 data-astro-cid-r7eb5hxj>Summary</h2> <ul class="sum-lines" data-astro-cid-r7eb5hxj> ${view.lines.map((l) => renderTemplate`<li data-astro-cid-r7eb5hxj> <span class="sum-title" data-astro-cid-r7eb5hxj>${l.title} <span class="sum-qty" data-astro-cid-r7eb5hxj>× ${l.quantity}</span></span> <span class="num" data-astro-cid-r7eb5hxj>${money(l.current_price_minor * l.quantity)}</span> </li>`)} </ul> <dl class="totals" data-astro-cid-r7eb5hxj> <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>Subtotal</dt><dd class="num" data-astro-cid-r7eb5hxj>${money(view.subtotal_minor)}</dd></div> ${view.protection_enabled ? renderTemplate`<div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>Shipment protection</dt><dd class="num" data-astro-cid-r7eb5hxj>${money(protectionPrice)}</dd></div>` : null} <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>Delivery</dt><dd class="num" data-astro-cid-r7eb5hxj>${view.shipping_minor !== null ? money(view.shipping_minor) : "To be chosen"}</dd></div> <div data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>Tax</dt><dd class="num" data-astro-cid-r7eb5hxj>${money(view.tax_minor)}</dd></div> <div class="total-row" data-astro-cid-r7eb5hxj><dt data-astro-cid-r7eb5hxj>Total</dt><dd class="num" data-summary-total data-astro-cid-r7eb5hxj>${money(view.total_minor)}</dd></div> </dl> <ol class="steps" data-astro-cid-r7eb5hxj> ${steps.map((s, i) => renderTemplate`<li${addAttribute({ "is-current": i + 1 === step, "is-done": i + 1 < step }, "class:list")} data-astro-cid-r7eb5hxj> ${i + 1 < step ? renderTemplate`<a${addAttribute(s.href, "href")} data-astro-cid-r7eb5hxj>${s.label}</a>` : renderTemplate`<span data-astro-cid-r7eb5hxj>${s.label}</span>`} </li>`)} </ol> </aside> `;
}, "/app/src/components/CheckoutSummary.astro", void 0);
export {
  $$CheckoutSummary as $
};

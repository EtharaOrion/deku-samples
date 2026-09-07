import { e as createComponent, m as maybeRenderHead, r as renderTemplate, k as renderComponent, l as Fragment, h as createAstro, g as addAttribute } from './astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { f as formatDate } from './format_Dm8rsWwp.mjs';
import { f as formatMinor } from './api_-Wd5sQnB.mjs';

const $$Astro = createAstro();
const $$OrderDetail = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$OrderDetail;
  const { order, canRegister = false } = Astro2.props;
  const a = order.shipping_address || {};
  return renderTemplate`${maybeRenderHead()}<div class="checkout-layout"> <div> <h2 class="section-head">What you bought</h2> <table class="table"> <thead> <tr><th scope="col">Item</th><th scope="col" class="num">Quantity</th><th scope="col" class="num">Total</th></tr> </thead> <tbody> ${order.lines.map((l) => renderTemplate`<tr> <td>${l.title_snapshot}<br><span class="muted small mono">${l.sku_snapshot}</span></td> <td class="num tnum">${l.quantity}</td> <td class="num money">${formatMinor(l.total_minor)}</td> </tr>`)} </tbody> </table> ${order.serials.length > 0 && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <h2 class="section-head" style="margin-top: 2rem">Serial numbers</h2> <p class="muted small" style="margin-top: -0.5rem">
This is the only place you will find these without the camera in hand.
</p> <table class="table"> <tbody> ${order.serials.map((s) => renderTemplate`<tr> <td>${s.model}</td> <td class="serial">${s.serial}</td> <td class="num"> ${s.registered ? renderTemplate`<span class="chip chip-finished">Registered</span>` : canRegister ? renderTemplate`<form method="POST" action="/account/cameras" style="display:inline"> <input type="hidden" name="serial"${addAttribute(s.serial, "value")}> <button type="submit" class="btn btn-quiet btn-small">Register to this account</button> </form>` : renderTemplate`<span class="chip chip-neutral">Not registered</span>`} </td> </tr>`)} </tbody> </table> ` })}`} <h2 class="section-head" style="margin-top: 2rem">Where it went</h2> <p class="small" style="margin: 0"> ${a.name}<br> ${a.line1}${a.line2 ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate`, ${a.line2}` })}` : null}<br> ${a.city}, ${a.region} ${a.postal_code}<br> ${a.country}<br> <span class="muted">${order.email}</span> </p> </div> <aside class="summary" aria-labelledby="order-totals"> <h2 id="order-totals">Totals</h2> <table class="totals"> <tbody> <tr><td>Subtotal</td><td class="money">${formatMinor(order.subtotal_minor)}</td></tr> <tr><td>Delivery</td><td class="money">${formatMinor(order.shipping_minor)}</td></tr> <tr><td>Tax</td><td class="money">${formatMinor(order.tax_minor)}</td></tr> ${order.discount_minor > 0 && renderTemplate`<tr><td>Discount</td><td class="money">−${formatMinor(order.discount_minor)}</td></tr>`} <tr class="total-row"><td>Total</td><td class="money">${formatMinor(order.total_minor)}</td></tr> </tbody> </table> <p class="muted small" style="margin-top: 1.5rem">
Placed ${formatDate(order.placed_at)}.<br>
Delivery: ${order.shipping_method === "express" ? "Express" : "Standard"}.
</p> </aside> </div>`;
}, "/app/src/components/OrderDetail.astro", void 0);

export { $$OrderDetail as $ };

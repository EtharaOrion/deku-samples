import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute, n as renderScript } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$CheckoutSteps, a as $$CheckoutSummary } from '../../chunks/CheckoutSummary_DlpHX4x4.mjs';
import { a as apiFetch, f as formatMinor } from '../../chunks/api_-Wd5sQnB.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Payment = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Payment;
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const key = String(form.get("idempotency_key") || "");
    const res = await apiFetch(Astro2, "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...key ? { "Idempotency-Key": key } : {} },
      body: "{}"
    });
    if (res.status === 201 && res.data?.number) {
      return Astro2.redirect(`/orders/${res.data.number}?access_token=${encodeURIComponent(res.data.access_token)}`, 303);
    }
    if (res.data?.return_to === "/cart") return Astro2.redirect("/cart", 303);
    error = res.data?.message || "That did not work.";
  }
  const cartRes = await apiFetch(Astro2, "/api/cart");
  const cart = cartRes.status === 200 ? cartRes.data : null;
  if (!cart || cart.lines.length === 0) return Astro2.redirect("/cart", 303);
  if (!cart.shipping_address) return Astro2.redirect("/checkout/where-it-goes", 303);
  if (!cart.shipping_method) return Astro2.redirect("/checkout/how-it-gets-there", 303);
  const methodsRes = await apiFetch(Astro2, "/api/shipping-methods");
  const method = (methodsRes.status === 200 ? methodsRes.data.data : []).find((m) => m.code === cart.shipping_method);
  const idempotencyKey = `co_${cart.id}_${cart.total_minor}_${cart.lines.map((l) => `${l.sku}x${l.quantity}`).join("_")}`;
  const a = cart.shipping_address;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Payment", "current": "shop" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"><h1>Payment</h1></div> ${renderComponent($$result2, "CheckoutSteps", $$CheckoutSteps, { "step": 3 })} <div class="checkout-layout"> <div> ${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`} <h2 class="section-head">Where it goes</h2> <p class="small" style="margin: 0 0 1.5rem"> ${a.name}<br> ${a.line1}${a.line2 ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate`, ${a.line2}` })}` : null}<br> ${a.city}, ${a.region} ${a.postal_code}<br> ${a.country}<br> <span class="muted">${cart.email}</span> </p> <p class="small"><a href="/checkout/where-it-goes">Change the address</a></p> <h2 class="section-head" style="margin-top: 2rem">How it gets there</h2> <p class="small" style="margin: 0 0 0.5rem"> ${method ? method.label : cart.shipping_method} — ${method ? method.window_text : ""} — <span class="money">${formatMinor(cart.shipping_minor)}</span> </p> <p class="small"><a href="/checkout/how-it-gets-there">Change the delivery method</a></p> <h2 class="section-head" style="margin-top: 2rem">Payment</h2> <p class="small muted" style="max-width: 62ch">
We invoice this order for <span class="money">${formatMinor(cart.total_minor)}</span> and send the invoice to ${cart.email}. There is no card to enter.
</p> <form method="POST" data-place style="margin-top: 1.5rem"> <input type="hidden" name="idempotency_key"${addAttribute(idempotencyKey, "value")}> <button type="submit" class="btn" data-place-button>Place the order — ${formatMinor(cart.total_minor)}</button> </form> <p class="vh" role="status" aria-live="polite" data-place-live></p> </div> ${renderComponent($$result2, "CheckoutSummary", $$CheckoutSummary, { "cart": cart, "exact": true })} </div> ${renderScript($$result2, "/app/src/pages/checkout/payment.astro?astro&type=script&index=0&lang.ts")} ` })}`;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute } from '../../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$OrderDetail } from '../../../chunks/OrderDetail_hIKlomt2.mjs';
import { a as apiFetch } from '../../../chunks/api_-Wd5sQnB.mjs';
import { r as requireCustomer } from '../../../chunks/guard_CmdfjCBR.mjs';
/* empty css                                          */
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const guard = await requireCustomer(Astro2);
  if (guard.redirect) return guard.redirect;
  const { number } = Astro2.params;
  const res = await apiFetch(Astro2, `/api/orders/${encodeURIComponent(number)}`);
  const order = res.status === 200 ? res.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number}` : "Order", "current": "orders" }, { "default": async ($$result2) => renderTemplate`${!order && renderTemplate`${maybeRenderHead()}<div class="page-head"> <h1>That order does not exist.</h1> <p><a href="/account/orders">Back to your orders.</a></p> </div>`}${order && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div class="page-head"> <h1>Order <span class="order-number">${order.number}</span></h1> <p> <span${addAttribute(`chip ${order.status === "cancelled" ? "chip-wrong" : order.fulfilment_status === "fulfilled" ? "chip-finished" : "chip-progress"}`, "class")}> ${order.state_phrase} </span> </p> </div> ${renderComponent($$result3, "OrderDetail", $$OrderDetail, { "order": order, "canRegister": true })} ` })}`}` })}`;
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

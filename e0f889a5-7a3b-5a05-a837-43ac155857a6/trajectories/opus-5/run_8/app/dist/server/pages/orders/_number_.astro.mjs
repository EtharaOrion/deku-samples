import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$OrderDetail } from '../../chunks/OrderDetail_hIKlomt2.mjs';
import { a as apiFetch } from '../../chunks/api_-Wd5sQnB.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const accessToken = Astro2.url.searchParams.get("access_token") || "";
  const q = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
  const res = await apiFetch(Astro2, `/api/orders/${encodeURIComponent(number)}${q}`);
  const order = res.status === 200 ? res.data : null;
  const meRes = await apiFetch(Astro2, "/api/auth/me");
  const signedIn = meRes.status === 200;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": order ? `Order ${order.number}` : "Order", "current": "" }, { "default": async ($$result2) => renderTemplate`${!order && renderTemplate`${maybeRenderHead()}<div class="page-head"> <h1>That order does not exist.</h1> <p>Check the address, or the link in your confirmation mail. <a href="/shop">Back to the shop.</a></p> </div>`}${order && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div class="page-head"> <h1>
Order <span class="order-number">${order.number}</span> is confirmed. We have emailed ${order.email}.
</h1> <p> <span${addAttribute(`chip ${order.status === "confirmed" ? "chip-finished" : "chip-progress"}`, "class")}>${order.state_phrase}</span> </p> </div> <p style="margin-bottom: 2rem"> <a class="btn"${addAttribute(signedIn ? `/account/orders/${order.number}` : `/orders/${order.number}${q}`, "href")}>Keep track of this order</a> </p> ${renderComponent($$result3, "OrderDetail", $$OrderDetail, { "order": order, "canRegister": signedIn })} ` })}`}` })}`;
}, "/app/src/pages/orders/[number].astro", void 0);

const $$file = "/app/src/pages/orders/[number].astro";
const $$url = "/orders/[number]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$number,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

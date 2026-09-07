import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$OrderDetail } from '../../chunks/OrderDetail_BzDJcg1t.mjs';
import { c as currentCustomer } from '../../chunks/server_SMyiD-DF.mjs';
/* empty css                                       */
import { r as readOrderFor, p as publicOrder } from '../../chunks/orders_D-zVuqOa.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const { number } = Astro2.params;
  const accessToken = Astro2.url.searchParams.get("access_token");
  const customer = await currentCustomer(Astro2);
  const found = await readOrderFor(number, {
    accessToken,
    customerId: customer ? customer.id : null,
    customerEmail: customer ? customer.email : null
  });
  if (!found) {
    return new Response(null, { status: 404 });
  }
  const order = publicOrder(found);
  const justPlaced = Boolean(accessToken);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} \u2014 Vela`, "description": `Order ${order.number}.`, "data-astro-cid-cxx6wafo": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-cxx6wafo> <header class="stack stack-4" data-astro-cid-cxx6wafo> ${justPlaced ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate`<h1 data-astro-cid-cxx6wafo>Order ${order.number} is confirmed. We have emailed ${order.email}.</h1> <p class="row" data-astro-cid-cxx6wafo> <a class="btn btn-primary"${addAttribute(customer ? `/account/orders/${order.number}` : "/account", "href")} data-astro-cid-cxx6wafo>
Keep track of this order
</a> </p> ` })}` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-cxx6wafo": true }, { "default": async ($$result3) => renderTemplate` <h1 data-astro-cid-cxx6wafo>Order <span class="ident" data-astro-cid-cxx6wafo>${order.number}</span></h1> <p data-astro-cid-cxx6wafo><span class="chip chip-done" data-astro-cid-cxx6wafo>${order.state_phrase}</span></p> ` })}`} </header> ${renderComponent($$result2, "OrderDetail", $$OrderDetail, { "order": order, "showRegister": Boolean(customer), "data-astro-cid-cxx6wafo": true })} </div> ` })} `;
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

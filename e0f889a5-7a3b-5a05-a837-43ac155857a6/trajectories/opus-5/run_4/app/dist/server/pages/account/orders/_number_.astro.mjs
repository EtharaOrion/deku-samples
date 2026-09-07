import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_xAScgdos.mjs';
import { $ as $$OrderDetail } from '../../../chunks/OrderDetail_BzDJcg1t.mjs';
import { c as currentCustomer, s as signInRedirect } from '../../../chunks/server_SMyiD-DF.mjs';
/* empty css                                          */
import { r as readOrderFor, p as publicOrder } from '../../../chunks/orders_D-zVuqOa.mjs';
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$number = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$number;
  const customer = await currentCustomer(Astro2);
  if (!customer) return signInRedirect(Astro2);
  const { number } = Astro2.params;
  const found = await readOrderFor(number, { customerId: customer.id, customerEmail: customer.email });
  if (!found) {
    return new Response(null, { status: 404 });
  }
  const order = publicOrder(found);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `Order ${order.number} \u2014 Vela`, "description": `Order ${order.number}.`, "data-astro-cid-th46ys4i": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-th46ys4i> <header class="stack stack-3" data-astro-cid-th46ys4i> <p data-astro-cid-th46ys4i><a href="/account/orders" data-astro-cid-th46ys4i>Your orders</a></p> <div class="row-between" data-astro-cid-th46ys4i> <h1 data-astro-cid-th46ys4i>Order <span class="ident" data-astro-cid-th46ys4i>${order.number}</span></h1> <span class="chip" data-astro-cid-th46ys4i>${order.state_phrase}</span> </div> </header> <!-- Each unregistered serial carries a one-click control to register it to
         this account. --> ${renderComponent($$result2, "OrderDetail", $$OrderDetail, { "order": order, "showRegister": true, "data-astro-cid-th46ys4i": true })} </div> ` })} `;
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

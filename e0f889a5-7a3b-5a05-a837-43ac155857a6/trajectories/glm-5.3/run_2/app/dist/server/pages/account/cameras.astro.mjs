import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { r as requirePageCustomer, s as signInRedirect } from "../../chunks/pageguard_DqzDYTwd.mjs";
import { b as devicesForCustomer, a as deviceView } from "../../chunks/devices_BeE0c41C.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                      */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Cameras = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cameras;
  const customer = await requirePageCustomer(Astro2);
  if (!customer) return Astro2.redirect(signInRedirect("/account/cameras"));
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const { rows } = await devicesForCustomer(customer.id, 100, null);
  const cameras = await Promise.all(rows.map((d) => deviceView(d)));
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cameras — Vela", "active": "cameras", "customer": { email: customer.email, name: customer.name }, "cartCount": cartCount, "data-astro-cid-rrl7y6m7": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-rrl7y6m7> <h1 data-astro-cid-rrl7y6m7>Cameras</h1> <p class="lede" data-astro-cid-rrl7y6m7>A camera is registered to one account at a time.</p> </div> <form class="card register" data-register-row data-astro-cid-rrl7y6m7> <div class="field grow" data-astro-cid-rrl7y6m7> <label for="serial" data-astro-cid-rrl7y6m7>Register a camera</label> <input id="serial" class="mono" data-serial placeholder="VA2609KTMHX4" autocomplete="off" spellcheck="false" data-astro-cid-rrl7y6m7> <p class="hint" data-astro-cid-rrl7y6m7>Twelve characters, on the underside of the camera.</p> </div> <button class="btn btn-primary" type="submit" data-register data-astro-cid-rrl7y6m7>Register</button> <p class="inline-error" data-register-error hidden data-astro-cid-rrl7y6m7></p> <p class="flash-ok" data-register-ok hidden role="status" data-astro-cid-rrl7y6m7>Registered. The camera is on your account now.</p> </form> ${cameras.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-rrl7y6m7> <p data-astro-cid-rrl7y6m7>No cameras registered yet.</p> </div>` : renderTemplate`<ul class="grid" data-astro-cid-rrl7y6m7> ${cameras.map((c) => renderTemplate`<li class="card camera" data-astro-cid-rrl7y6m7> <a class="camera-link"${addAttribute(`/account/cameras/${c.serial}`, "href")} data-astro-cid-rrl7y6m7> <span class="camera-title" data-astro-cid-rrl7y6m7>${c.nickname || c.model}</span> <span class="camera-model" data-astro-cid-rrl7y6m7>${c.model} · ${c.option_value}</span> <span class="mono camera-serial" data-astro-cid-rrl7y6m7>${c.serial}</span> <span class="camera-chips" data-astro-cid-rrl7y6m7> <span${addAttribute(c.never_connected ? "chip" : c.update_available ? "chip chip-low" : "chip chip-ok", "class")} data-astro-cid-rrl7y6m7> ${c.never_connected ? "Not yet connected" : c.update_available ? `Update available (${c.latest_firmware_version})` : `Firmware ${c.firmware_version}`} </span> ${c.warranty_until ? renderTemplate`<span class="chip" data-astro-cid-rrl7y6m7>Warranty to ${c.warranty_until}</span>` : renderTemplate`<span class="chip" data-astro-cid-rrl7y6m7>Warranty expired</span>`} </span> </a> </li>`)} </ul>`}` })}  `;
}, "/app/src/pages/account/cameras.astro", void 0);
const $$file = "/app/src/pages/account/cameras.astro";
const $$url = "/account/cameras";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Cameras,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

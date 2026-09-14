import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { a as devicesForCustomer, t as toDeviceView, g as groupSerial } from "../../chunks/devices_CusoPqEi.mjs";
/* empty css                                    */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  if (!customer) return Astro2.redirect("/sign-in?redirect=/account/cameras");
  const devices = (await devicesForCustomer(customer.id)).map(toDeviceView);
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": "Your cameras — Vela", "heading": "Cameras", "active": "cameras", "customer": { name: customer.name, email: customer.email }, "data-astro-cid-xzlb2mys": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="cameras-page" data-astro-cid-xzlb2mys> <form class="register" data-register-form data-astro-cid-xzlb2mys> <div class="field" data-astro-cid-xzlb2mys> <label for="serial" data-astro-cid-xzlb2mys>Register a camera</label> <input id="serial" name="serial" type="text" inputmode="latin" autocomplete="off" spellcheck="false" placeholder="VC 2609 ABCDEF" data-serial-input maxlength="18" data-astro-cid-xzlb2mys> <p class="field-hint" data-serial-hint data-astro-cid-xzlb2mys>Twelve characters, from the underside of the camera.</p> </div> <button class="btn" type="submit" data-register-button data-astro-cid-xzlb2mys>Register</button> <p class="status" role="status" aria-live="polite" data-register-status data-astro-cid-xzlb2mys></p> </form> <div class="grid" data-camera-grid data-astro-cid-xzlb2mys> ${devices.length === 0 ? renderTemplate`<p class="empty-note" data-cameras-empty data-astro-cid-xzlb2mys>No cameras registered yet.</p>` : devices.map((d) => renderTemplate`<article class="camera card" data-camera-card${addAttribute(d.serial, "data-serial")} data-astro-cid-xzlb2mys> <h2 data-astro-cid-xzlb2mys> <a${addAttribute(`/account/cameras/${d.serial}`, "href")} data-astro-cid-xzlb2mys>${d.nickname ?? d.model}</a> </h2> <p class="model" data-astro-cid-xzlb2mys>${d.model} · ${d.variant_title}</p> <p class="serial serial-display" data-serial-display data-astro-cid-xzlb2mys>${groupSerial(d.serial)}</p> <p class="chips" data-astro-cid-xzlb2mys> ${d.update_available ? renderTemplate`<span class="chip chip--progress" data-astro-cid-xzlb2mys>Update available</span>` : d.firmware_version ? renderTemplate`<span class="chip chip--done" data-astro-cid-xzlb2mys>Up to date</span>` : renderTemplate`<span class="chip" data-astro-cid-xzlb2mys>Not yet connected</span>`} <span class="chip" data-astro-cid-xzlb2mys>${d.warranty_until ? `Warranty to ${d.warranty_until}` : "Warranty unknown"}</span> </p> </article>`)} </div> </div> ` })} ${renderScript($$result, "/app/src/pages/account/cameras/index.astro?astro&type=script&index=0&lang.ts")} `;
}, "/app/src/pages/account/cameras/index.astro", void 0);
const $$file = "/app/src/pages/account/cameras/index.astro";
const $$url = "/account/cameras";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

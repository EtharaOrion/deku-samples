import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment, g as addAttribute } from "../../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { s as sessionCustomer, $ as $$PageShell } from "../../../chunks/PageShell_DYrBPb7v.mjs";
import { d as deviceBySerial, f as fold, t as toDeviceView, g as groupSerial } from "../../../chunks/devices_CusoPqEi.mjs";
/* empty css                                          */
import { renderers } from "../../../renderers.mjs";
const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const customer = await sessionCustomer(Astro2.request, Astro2.cookies);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent(Astro2.url.pathname)}`);
  const { serial } = Astro2.params;
  const row = serial ? await deviceBySerial(fold(serial)) : null;
  if (!row || !row.owner_customer_id || Number(row.owner_customer_id) !== Number(customer.id)) {
    return Astro2.redirect("/404");
  }
  const device = toDeviceView(row);
  const escapedSerial = encodeURIComponent(device.serial);
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": `${device.model} — Vela`, "heading": device.nickname ?? device.model, "active": "cameras", "customer": { name: customer.name, email: customer.email }, "data-astro-cid-nd76frh6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="camera-page" data-astro-cid-nd76frh6> <section class="block card" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>This camera</h2> <dl data-astro-cid-nd76frh6> <dt data-astro-cid-nd76frh6>Model</dt><dd data-astro-cid-nd76frh6>${device.model}</dd> <dt data-astro-cid-nd76frh6>Variant</dt><dd data-astro-cid-nd76frh6>${device.variant_title}</dd> <dt data-astro-cid-nd76frh6>Serial</dt><dd class="serial" data-astro-cid-nd76frh6>${groupSerial(device.serial)}</dd> <dt data-astro-cid-nd76frh6>Firmware</dt><dd class="mono" data-astro-cid-nd76frh6>${device.firmware_version ?? "Not yet connected"}</dd> ${device.latest_firmware && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-nd76frh6": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-nd76frh6>Latest firmware</dt><dd class="mono" data-astro-cid-nd76frh6>${device.latest_firmware}</dd>` })}`} <dt data-astro-cid-nd76frh6>Warranty</dt><dd class="mono" data-astro-cid-nd76frh6>${device.warranty_until ?? "unknown"}</dd> </dl> ${device.update_available && renderTemplate`<p class="chip chip--progress" data-astro-cid-nd76frh6>Update available</p>`} ${!device.firmware_version && renderTemplate`<p class="chip" data-astro-cid-nd76frh6>Not yet connected</p>`} </section> <section class="block card" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Name</h2> <form class="rename" data-rename-form${addAttribute(escapedSerial, "data-serial")} data-astro-cid-nd76frh6> <label for="nickname" data-astro-cid-nd76frh6>Nickname</label> <input id="nickname" name="nickname" type="text"${addAttribute(device.nickname ?? "", "value")} maxlength="60" data-astro-cid-nd76frh6> <button class="btn" type="submit" data-astro-cid-nd76frh6>Save name</button> <p class="status" role="status" aria-live="polite" data-rename-status data-astro-cid-nd76frh6></p> </form> </section> <section class="block card" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Ownership</h2> <p data-astro-cid-nd76frh6>Removing releases the camera without giving it to anyone. It is what you do when you sell it to a stranger.</p> <form data-release-form${addAttribute(escapedSerial, "data-serial")} data-astro-cid-nd76frh6> <button class="btn" type="submit" data-release-button data-astro-cid-nd76frh6>Remove from my account</button> <p class="status" role="status" aria-live="polite" data-release-status data-astro-cid-nd76frh6></p> </form> <p class="field-hint" data-astro-cid-nd76frh6>Handing this camera to someone else is a different action: release it here and they register the serial themselves.</p> </section> </div> ` })} ${renderScript($$result, "/app/src/pages/account/cameras/[serial].astro?astro&type=script&index=0&lang.ts")} `;
}, "/app/src/pages/account/cameras/[serial].astro", void 0);
const $$file = "/app/src/pages/account/cameras/[serial].astro";
const $$url = "/account/cameras/[serial]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$serial,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

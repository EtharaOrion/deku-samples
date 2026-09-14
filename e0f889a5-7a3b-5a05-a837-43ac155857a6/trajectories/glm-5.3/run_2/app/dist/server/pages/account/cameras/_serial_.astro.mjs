import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../../chunks/Shell_COYl1VNS.mjs";
import { r as requirePageCustomer, s as signInRedirect } from "../../../chunks/pageguard_DqzDYTwd.mjs";
import { d as deviceOwnedBy, a as deviceView } from "../../../chunks/devices_BeE0c41C.mjs";
import { g as getCartForContext } from "../../../chunks/context_Bm1YOHfv.mjs";
import { f as firmwareForProduct } from "../../../chunks/flash_ChrB-_fE.mjs";
/* empty css                                          */
import { renderers } from "../../../renderers.mjs";
const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const customer = await requirePageCustomer(Astro2);
  if (!customer) return Astro2.redirect(signInRedirect(`/account/cameras/${Astro2.params.serial}`));
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const device = await deviceOwnedBy(customer.id, Astro2.params.serial || "");
  if (!device) return Astro2.redirect("/404");
  const view = await deviceView(device);
  const firmware = await firmwareForProduct(device.product_id);
  const general = firmware.filter((f) => f.channel === "general");
  const latest = general[0] ?? null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${view.model} — Vela`, "active": "cameras", "customer": { email: customer.email, name: customer.name }, "cartCount": cartCount, "data-astro-cid-nd76frh6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" data-astro-cid-nd76frh6><a href="/account/cameras" data-astro-cid-nd76frh6>Cameras</a> <span aria-hidden="true" data-astro-cid-nd76frh6>/</span> <span class="mono" data-astro-cid-nd76frh6>${view.serial}</span></nav> <div class="camera-page" data-astro-cid-nd76frh6> <section class="card main" data-astro-cid-nd76frh6> <h1 data-astro-cid-nd76frh6>${view.nickname || view.model}</h1> <p class="model" data-astro-cid-nd76frh6>${view.model} · ${view.option_value}</p> <p class="mono serial" data-astro-cid-nd76frh6>${view.serial}</p> <div class="chips" data-astro-cid-nd76frh6> <span${addAttribute(view.never_connected ? "chip" : view.update_available ? "chip chip-low" : "chip chip-ok", "class")} data-astro-cid-nd76frh6> ${view.never_connected ? "Not yet connected" : view.update_available ? `Update available (${view.latest_firmware_version})` : `Firmware ${view.firmware_version}`} </span> <span class="chip" data-astro-cid-nd76frh6>${view.warranty_until ? `Warranty to ${view.warranty_until}` : "Warranty expired"}</span> </div> <form class="rename" data-rename data-astro-cid-nd76frh6> <div class="field" data-astro-cid-nd76frh6> <label for="nickname" data-astro-cid-nd76frh6>Nickname</label> <input id="nickname" name="nickname"${addAttribute(view.nickname || "", "value")} placeholder="The little one" data-astro-cid-nd76frh6> </div> <button class="btn" type="submit" data-astro-cid-nd76frh6>Save the nickname</button> <p class="inline-error" data-rename-error hidden data-astro-cid-nd76frh6></p> </form> <div class="actions" data-astro-cid-nd76frh6> <form data-remove data-astro-cid-nd76frh6> <button class="btn" type="submit" data-remove-btn data-astro-cid-nd76frh6>Remove from my account</button> <p class="hint" data-astro-cid-nd76frh6>Releases the camera without giving it to anyone.</p> <p class="inline-error" data-remove-error hidden data-astro-cid-nd76frh6></p> </form> <form data-hand-over data-astro-cid-nd76frh6> <button class="btn" type="submit" data-handover-btn data-astro-cid-nd76frh6>Hand this camera to someone else</button> <p class="hint" data-astro-cid-nd76frh6>Releases it so the next owner can register it.</p> </form> </div> <dialog class="confirm" data-confirm data-astro-cid-nd76frh6> <p data-confirm-text data-astro-cid-nd76frh6></p> <div class="confirm-actions" data-astro-cid-nd76frh6> <button class="btn" type="button" data-confirm-cancel data-astro-cid-nd76frh6>Keep it</button> <button class="btn btn-danger" type="button" data-confirm-go data-astro-cid-nd76frh6>Yes, do it</button> </div> </dialog> </section> <aside class="card side" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Firmware</h2> ${latest ? renderTemplate`<p class="muted" data-astro-cid-nd76frh6>Latest general release is <span class="mono" data-astro-cid-nd76frh6>${latest.version}</span> (build <span class="mono" data-astro-cid-nd76frh6>${latest.build}</span>).
        This camera ${view.firmware_version ? `reports ${view.firmware_version}.` : "has never reported a version."}</p>` : renderTemplate`<p class="muted" data-astro-cid-nd76frh6>No firmware published for this model.</p>`} <h2 data-astro-cid-nd76frh6>Where it came from</h2> <p class="muted" data-astro-cid-nd76frh6>${view.registered ? "Registered to this account." : "Not registered."}</p> </aside> </div> ` })}  `;
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

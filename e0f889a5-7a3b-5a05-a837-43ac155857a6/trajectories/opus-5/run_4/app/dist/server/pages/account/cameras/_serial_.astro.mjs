import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_xAScgdos.mjs';
import { c as currentCustomer, s as signInRedirect } from '../../../chunks/server_SMyiD-DF.mjs';
import { r as renameDevice, a as releaseDevice, g as getOwnedDevice } from '../../../chunks/devices_BvEkuw7E.mjs';
import { g as groupSerial, f as formatDate } from '../../../chunks/format_y0Y9nLbA.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const customer = await currentCustomer(Astro2);
  if (!customer) return signInRedirect(Astro2);
  const { serial } = Astro2.params;
  let notice = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const action = String(form.get("action") || "");
    try {
      if (action === "rename") {
        await renameDevice(serial, customer.id, form.get("nickname"));
        notice = "Saved.";
      } else if (action === "release") {
        await releaseDevice(serial, customer.id);
        return Astro2.redirect("/account/cameras");
      }
    } catch (err) {
      notice = err.message || "That did not work.";
    }
  }
  const device = await getOwnedDevice(serial, customer.id);
  if (!device) {
    return new Response(null, { status: 404 });
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${device.model} \u2014 Vela`, "description": `Camera ${device.serial}.`, "data-astro-cid-nd76frh6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-8" data-astro-cid-nd76frh6> <header class="stack stack-3" data-astro-cid-nd76frh6> <p data-astro-cid-nd76frh6><a href="/account/cameras" data-astro-cid-nd76frh6>Your cameras</a></p> <h1 data-astro-cid-nd76frh6>${device.nickname || device.model}</h1> <p class="serial ident" data-astro-cid-nd76frh6>${groupSerial(device.serial)}</p> <div class="chips" data-astro-cid-nd76frh6> ${device.firmware_state === "unknown" ? renderTemplate`<span class="chip" data-astro-cid-nd76frh6>Not yet connected</span>` : device.update_available ? renderTemplate`<span class="chip chip-progress" data-astro-cid-nd76frh6>Update available</span>` : renderTemplate`<span class="chip" data-astro-cid-nd76frh6>Firmware <span class="ident" data-astro-cid-nd76frh6>${device.firmware_version}</span></span>`} ${device.warranty_until && renderTemplate`<span class="chip" data-astro-cid-nd76frh6> ${device.warranty_active ? `Warranty to ${formatDate(device.warranty_until)}` : `Warranty ended ${formatDate(device.warranty_until)}`} </span>`} </div> </header> ${notice && renderTemplate`<p class="notice" role="status" data-astro-cid-nd76frh6>${notice}</p>`} <section class="stack stack-3" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Details</h2> <table class="table" data-astro-cid-nd76frh6> <tbody data-astro-cid-nd76frh6> <tr data-astro-cid-nd76frh6><th scope="row" data-astro-cid-nd76frh6>Model</th><td data-astro-cid-nd76frh6>${device.model}</td></tr> <tr data-astro-cid-nd76frh6><th scope="row" data-astro-cid-nd76frh6>Finish</th><td data-astro-cid-nd76frh6>${device.option_value}</td></tr> <tr data-astro-cid-nd76frh6><th scope="row" data-astro-cid-nd76frh6>Serial</th><td class="ident" data-astro-cid-nd76frh6>${device.serial}</td></tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Firmware</th> <td class="ident" data-astro-cid-nd76frh6>${device.firmware_version || "Not yet reported"}</td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Latest firmware</th> <td class="ident" data-astro-cid-nd76frh6>${device.latest_firmware || "None published"}</td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Warranty</th> <td data-astro-cid-nd76frh6>${device.warranty_until ? formatDate(device.warranty_until) : "None on record"}</td> </tr> </tbody> </table> ${device.update_available && renderTemplate`<p class="row" data-astro-cid-nd76frh6> <a class="btn" href="/downloads" data-astro-cid-nd76frh6>Get the firmware</a> <span class="hint" data-astro-cid-nd76frh6>Arranger installs it. Use the installer only if Arranger cannot see the camera.</span> </p>`} </section> <section class="stack stack-3" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Name it</h2> <form method="post" class="rename" data-astro-cid-nd76frh6> <input type="hidden" name="action" value="rename" data-astro-cid-nd76frh6> <div class="field" data-astro-cid-nd76frh6> <label for="nickname" data-astro-cid-nd76frh6>Nickname</label> <input class="input" id="nickname" name="nickname"${addAttribute(device.nickname || "", "value")} maxlength="80" data-astro-cid-nd76frh6> </div> <button class="btn" type="submit" data-astro-cid-nd76frh6>Save</button> </form> </section> <!-- Two different actions, and the copy never blurs them. --> <section class="stack stack-3" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Remove it</h2> <p class="hint remove-copy" data-astro-cid-nd76frh6>
Removing releases the camera without giving it to anyone. It is what you do
        when you sell it to a stranger: they register it themselves afterwards.
</p> <details class="confirm" data-astro-cid-nd76frh6> <summary class="btn danger-control" data-astro-cid-nd76frh6>Remove from my account</summary> <div class="confirm-body" data-astro-cid-nd76frh6> <p data-astro-cid-nd76frh6>This releases <span class="ident" data-astro-cid-nd76frh6>${device.serial}</span> from your account. You can register it again later.</p> <form method="post" data-astro-cid-nd76frh6> <input type="hidden" name="action" value="release" data-astro-cid-nd76frh6> <button class="btn" type="submit" data-astro-cid-nd76frh6>Yes, remove it</button> </form> </div> </details> <p class="hint" data-astro-cid-nd76frh6>
Handing this camera to someone else is a different thing: release it here, then
        the new owner registers the serial on their own account.
</p> </section> </div> ` })}  ${renderScript($$result, "/app/src/pages/account/cameras/[serial].astro?astro&type=script&index=0&lang.ts")}`;
}, "/app/src/pages/account/cameras/[serial].astro", void 0);

const $$file = "/app/src/pages/account/cameras/[serial].astro";
const $$url = "/account/cameras/[serial]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$serial,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

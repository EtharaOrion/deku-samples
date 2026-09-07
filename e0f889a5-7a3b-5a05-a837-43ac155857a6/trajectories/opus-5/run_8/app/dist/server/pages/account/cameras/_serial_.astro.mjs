import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, l as Fragment, g as addAttribute, n as renderScript } from '../../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch } from '../../../chunks/api_-Wd5sQnB.mjs';
import { r as requireCustomer } from '../../../chunks/guard_CmdfjCBR.mjs';
import { f as formatDate } from '../../../chunks/format_Dm8rsWwp.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const guard = await requireCustomer(Astro2);
  if (guard.redirect) return guard.redirect;
  const { serial } = Astro2.params;
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const action = String(form.get("action") || "");
    if (action === "rename") {
      const res2 = await apiFetch(Astro2, `/api/account/devices/${encodeURIComponent(serial)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: String(form.get("nickname") || "") })
      });
      if (res2.status === 200) return Astro2.redirect(`/account/cameras/${serial}?renamed=1`, 303);
      error = res2.data?.message || "That did not work.";
    } else if (action === "release") {
      const res2 = await apiFetch(Astro2, `/api/account/devices/${encodeURIComponent(serial)}`, { method: "DELETE" });
      if (res2.status === 200) return Astro2.redirect("/account/cameras?released=1", 303);
      error = res2.data?.message || "That did not work.";
    }
  }
  const res = await apiFetch(Astro2, `/api/account/devices/${encodeURIComponent(serial)}`);
  const d = res.status === 200 ? res.data : null;
  const renamed = Astro2.url.searchParams.get("renamed") === "1";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": d ? `${d.model} ${d.serial}` : "Camera", "current": "cameras" }, { "default": async ($$result2) => renderTemplate`${!d && renderTemplate`${maybeRenderHead()}<div class="page-head"> <h1>We do not recognise that serial number.</h1> <p><a href="/account/cameras">Back to your cameras.</a></p> </div>`}${d && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <div class="page-head"> <h1>${d.nickname || d.model}</h1> <p><span class="serial">${d.serial}</span> · ${d.model}, ${d.variant}</p> </div> ${renamed && renderTemplate`<p class="flash" role="status">Renamed.</p>`}${error && renderTemplate`<p class="notice notice-wrong" role="alert">${error}</p>`}<div class="checkout-layout"> <div> <h2 class="section-head">This camera</h2> <table class="table"> <tbody> <tr><th scope="row">Serial</th><td class="serial">${d.serial}</td></tr> <tr><th scope="row">Model</th><td>${d.model}</td></tr> <tr><th scope="row">Finish</th><td>${d.variant}</td></tr> <tr> <th scope="row">Firmware</th> <td> ${d.firmware_version ? renderTemplate`<span class="version">${d.firmware_version}</span>` : "Not yet connected"} ${d.update_available && renderTemplate`${renderComponent($$result3, "Fragment", Fragment, {}, { "default": async ($$result4) => renderTemplate` — <span class="chip chip-progress">Update available</span>` })}`} </td> </tr> <tr> <th scope="row">Latest firmware</th> <td>${d.latest_firmware_version ? renderTemplate`<span class="version">${d.latest_firmware_version}</span>` : "None published"}</td> </tr> <tr> <th scope="row">Warranty</th> <td> ${d.warranty_until ? d.warranty_active ? `Runs to ${formatDate(d.warranty_until)}` : `Ended ${formatDate(d.warranty_until)}` : "None on record"} </td> </tr> </tbody> </table> ${d.update_available && renderTemplate`<p style="margin-top: 1.5rem"> <a class="btn btn-quiet" href="/doctor">Write firmware ${d.latest_firmware_version}</a> </p>`} <h2 class="section-head" style="margin-top: 2.5rem">Name it</h2> <form method="POST" style="max-width: 26rem"> <input type="hidden" name="action" value="rename"> <label class="field"> <span>A name for this camera, so you can tell two apart</span> <input type="text" name="nickname"${addAttribute(d.nickname || "", "value")} maxlength="60"> </label> <button type="submit" class="btn btn-quiet">Save the name</button> </form> </div> <aside class="summary"> <h2>Hand it on</h2> <p class="small muted">
Removing releases this camera without giving it to anyone. It is what you do when you sell it to a stranger:
            they register it themselves afterwards.
</p> <form method="POST" data-confirm-release> <input type="hidden" name="action" value="release"> <button type="submit" class="btn btn-quiet btn-small" style="width: 100%">Remove from my account</button> </form> <p class="small muted" style="margin-top: 1rem">
Handing this camera to someone else is the same act plus a conversation: remove it here, then give them the serial.
</p> </aside> </div> ` })}`}${renderScript($$result2, "/app/src/pages/account/cameras/[serial].astro?astro&type=script&index=0&lang.ts")} ` })}`;
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

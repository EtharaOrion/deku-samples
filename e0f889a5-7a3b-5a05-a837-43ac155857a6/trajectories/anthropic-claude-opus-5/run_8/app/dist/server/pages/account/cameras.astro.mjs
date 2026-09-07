import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as renderScript } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { a as apiFetch } from '../../chunks/api_-Wd5sQnB.mjs';
import { r as requireCustomer } from '../../chunks/guard_CmdfjCBR.mjs';
import { f as formatDate } from '../../chunks/format_Dm8rsWwp.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const guard = await requireCustomer(Astro2);
  if (guard.redirect) return guard.redirect;
  let error = null;
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    const action = String(form.get("action") || "register");
    const serial = String(form.get("serial") || "").replace(/[\s-]/g, "").toUpperCase();
    if (action === "release") {
      const res2 = await apiFetch(Astro2, `/api/account/devices/${encodeURIComponent(serial)}`, { method: "DELETE" });
      if (res2.status === 200) return Astro2.redirect("/account/cameras?released=1", 303);
      error = res2.data?.message || "That did not work.";
    } else {
      const res2 = await apiFetch(Astro2, "/api/account/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial })
      });
      if (res2.status === 201) return Astro2.redirect(`/account/cameras?registered=${encodeURIComponent(res2.data.serial)}`, 303);
      error = res2.data?.message || "That did not work.";
    }
  }
  const registered = Astro2.url.searchParams.get("registered") || null;
  const released = Astro2.url.searchParams.get("released") === "1";
  const res = await apiFetch(Astro2, "/api/account/devices?page_size=100");
  const devices = res.status === 200 ? res.data.data : [];
  const failed = res.status !== 200;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cameras", "current": "cameras" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Cameras</h1> <p>A camera outlives the order that bought it. Register the ones you own and they stay here.</p> </div> <p class="vh" role="status" aria-live="polite" data-register-live></p> ${registered && renderTemplate`<p class="flash" role="status">Registered. <span class="serial">${registered}</span> is on your account.</p>`}${released && renderTemplate`<p class="flash" role="status">Removed. That camera now belongs to nobody.</p>`}<div class="register-row"> <form method="POST" data-register> <input type="hidden" name="action" value="register"> <label class="field"> <span>Register a camera by its serial</span> <input type="text" name="serial" class="serial" data-serial-input maxlength="14" autocomplete="off" spellcheck="false" placeholder="VA2609KTMHX4" required> </label> <button type="submit" class="btn" data-register-button>Register</button> </form> <p class="small muted" style="margin: 0.5rem 0 0" data-shape-hint>Twelve characters, from the underside of the camera.</p> <p class="small" style="color: var(--state-wrong); margin: 0.5rem 0 0" data-register-error hidden></p> ${error && renderTemplate`<p class="small" style="color: var(--state-wrong); margin: 0.5rem 0 0" role="alert">${error}</p>`} </div> ${failed && renderTemplate`<p class="notice notice-wrong">We could not load your cameras. Reload the page and it will try again.</p>`}${!failed && devices.length === 0 && renderTemplate`<p class="empty">No cameras registered yet.</p>`}${devices.length > 0 && renderTemplate`<div class="acct-grid" data-camera-grid> ${devices.map((d) => renderTemplate`<article class="cam-card"> <h2 class="cam-model">${d.model}</h2> <p class="cam-nick">${d.nickname || "No name yet"}</p> <a class="cam-serial serial"${addAttribute(`/account/cameras/${d.serial}`, "href")}>${d.serial}</a> <div class="cam-chips"> <span${addAttribute(`chip ${d.update_available ? "chip-progress" : d.firmware_version ? "chip-finished" : "chip-neutral"}`, "class")}> ${d.update_available ? "Update available" : d.firmware_version ? `Firmware ${d.firmware_version}` : "Not yet connected"} </span> <span class="chip chip-neutral"> ${d.warranty_until ? d.warranty_active ? `Warranty to ${formatDate(d.warranty_until)}` : `Warranty ended ${formatDate(d.warranty_until)}` : "No warranty on record"} </span> </div> <div class="cam-actions"> <a class="btn btn-quiet btn-small"${addAttribute(`/account/cameras/${d.serial}`, "href")}>Open</a> </div> </article>`)} </div>`}${renderScript($$result2, "/app/src/pages/account/cameras/index.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/app/src/pages/account/cameras/index.astro", void 0);

const $$file = "/app/src/pages/account/cameras/index.astro";
const $$url = "/account/cameras";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from "../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../chunks/Shell_COYl1VNS.mjs";
import { g as getCartForContext } from "../chunks/context_Bm1YOHfv.mjs";
/* empty css                                  */
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro();
const $$Doctor = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Doctor;
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer — Vela", "active": "doctor", "cartCount": cartCount, "data-astro-cid-zyq4rxkj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-zyq4rxkj> <h1 data-astro-cid-zyq4rxkj>Firmware installer</h1> <p class="lede" data-astro-cid-zyq4rxkj>For a camera that Arranger cannot see.</p> </div> <div class="doctor" data-doctor data-live-region-root data-astro-cid-zyq4rxkj> <ol class="steps" data-astro-cid-zyq4rxkj> <li class="step card" data-step="1" data-astro-cid-zyq4rxkj> <h2 data-astro-cid-zyq4rxkj><span class="step-n num" data-astro-cid-zyq4rxkj>1</span> Can this browser talk to a device?</h2> <p data-webusb-state class="webusb-state" data-astro-cid-zyq4rxkj>Checking this browser.</p> <p data-webusb-alt class="alt-path" hidden data-astro-cid-zyq4rxkj>
Arranger can do this for you. Open Arranger and choose Firmware from the camera window.
<a href="/downloads" data-astro-cid-zyq4rxkj>Get Arranger</a> </p> </li> <li class="step card" data-step="2" data-astro-cid-zyq4rxkj> <h2 data-astro-cid-zyq4rxkj><span class="step-n num" data-astro-cid-zyq4rxkj>2</span> Read this first</h2> <div class="warning" tabindex="0" role="group" aria-label="Warning about writing firmware" data-astro-cid-zyq4rxkj> <p data-astro-cid-zyq4rxkj>
This replaces the software inside your camera. It takes about ninety seconds.
            Do not unplug the camera and do not let your computer go to sleep.
            If you are on a laptop, plug it in.
</p> </div> <button class="btn" type="button" data-accept-warning data-astro-cid-zyq4rxkj>I understand</button> <p class="muted" data-warning-state data-astro-cid-zyq4rxkj>Accept the warning to continue.</p> </li> <li class="step card" data-step="3" data-astro-cid-zyq4rxkj> <h2 data-astro-cid-zyq4rxkj><span class="step-n num" data-astro-cid-zyq4rxkj>3</span> Connect the camera</h2> <button class="btn btn-primary" type="button" data-connect disabled data-astro-cid-zyq4rxkj>Connect a camera</button> <p class="muted" data-connect-state data-astro-cid-zyq4rxkj>Unavailable until the warning is accepted.</p> <form class="manual" data-manual-form hidden data-astro-cid-zyq4rxkj> <p class="muted" data-astro-cid-zyq4rxkj>No WebUSB in this browser. Enter the details from the underside of the camera instead.</p> <div class="field" data-astro-cid-zyq4rxkj> <label for="doc-serial" data-astro-cid-zyq4rxkj>Serial number</label> <input id="doc-serial" class="mono" data-serial-input placeholder="VC2609PVDA7Q" autocomplete="off" data-astro-cid-zyq4rxkj> </div> <button class="btn" type="submit" data-astro-cid-zyq4rxkj>Identify the camera</button> </form> <p class="inline-error" data-connect-error hidden data-astro-cid-zyq4rxkj></p> <p class="identified" data-identified hidden data-astro-cid-zyq4rxkj></p> </li> <li class="step card" data-step="4" data-astro-cid-zyq4rxkj> <h2 data-astro-cid-zyq4rxkj><span class="step-n num" data-astro-cid-zyq4rxkj>4</span> Choose the firmware</h2> <div data-firmware-list class="fw-list" hidden data-astro-cid-zyq4rxkj> <p data-recommended data-astro-cid-zyq4rxkj></p> <details data-other-firmware data-astro-cid-zyq4rxkj> <summary data-astro-cid-zyq4rxkj>Other versions</summary> <ul data-other-list data-astro-cid-zyq4rxkj></ul> </details> <p class="inline-error" data-fw-error hidden data-astro-cid-zyq4rxkj></p> <button class="btn btn-primary" type="button" data-flash hidden data-astro-cid-zyq4rxkj>Write firmware</button> </div> <p class="muted" data-fw-empty data-astro-cid-zyq4rxkj>Connect a camera first.</p> </li> <li class="step card" data-step="5" data-astro-cid-zyq4rxkj> <h2 data-astro-cid-zyq4rxkj><span class="step-n num" data-astro-cid-zyq4rxkj>5</span> Writing</h2> <p class="progress" data-progress hidden data-astro-cid-zyq4rxkj><span class="num" data-progress-value data-astro-cid-zyq4rxkj>0</span>%</p> <p class="muted" data-progress-note hidden data-astro-cid-zyq4rxkj>Writing, <span data-progress-note-value data-astro-cid-zyq4rxkj>0</span>%. Do not unplug your camera.</p> <p class="done" data-done hidden data-astro-cid-zyq4rxkj></p> <p class="inline-error" data-fail-error hidden data-astro-cid-zyq4rxkj></p> </li> </ol> <p class="live-region" role="status" aria-live="polite" data-live-region data-astro-cid-zyq4rxkj></p> </div> ` })}  `;
}, "/app/src/pages/doctor.astro", void 0);
const $$file = "/app/src/pages/doctor.astro";
const $$url = "/doctor";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Doctor,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

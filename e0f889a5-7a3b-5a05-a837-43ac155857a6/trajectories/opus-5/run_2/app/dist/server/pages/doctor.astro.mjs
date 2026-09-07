import { c as createComponent, m as maybeRenderHead, r as renderTemplate, d as renderComponent, b as createAstro } from '../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../chunks/page_2k6pLPlp.mjs';
import 'clsx';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

const $$Installer = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<div class="installer" data-installer data-astro-cid-7czmf6z2> <!-- One polite live region carries the current step and status. --> <p class="live" data-live role="status" aria-live="polite" data-astro-cid-7czmf6z2></p> <ol class="steps" data-astro-cid-7czmf6z2> <li class="step" data-astro-cid-7czmf6z2> <h2 data-astro-cid-7czmf6z2><span class="n tnum" data-astro-cid-7czmf6z2>1</span> Whether this browser can talk to a camera</h2> <p data-capability data-astro-cid-7czmf6z2>Checking what this browser supports.</p> <!-- Where it cannot, it offers the in-application path and shows no
           control that cannot work. --> <p class="fallback" data-fallback hidden data-astro-cid-7czmf6z2>
This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can.
        Use Arranger instead: it does the same write from inside the application.
<a href="/downloads" data-astro-cid-7czmf6z2>Download Arranger</a>.
</p> </li> <li class="step" data-astro-cid-7czmf6z2> <h2 data-astro-cid-7czmf6z2><span class="n tnum" data-astro-cid-7czmf6z2>2</span> Before you start</h2> <!-- A warning block that is real, focusable and readable. --> <div class="warning" tabindex="0" role="group" aria-labelledby="warning-heading" data-astro-cid-7czmf6z2> <p id="warning-heading" data-astro-cid-7czmf6z2>
This replaces the software inside your camera. It takes about ninety seconds.
          Do not unplug the camera and do not let your computer go to sleep.
          If you are on a laptop, plug it in.
</p> </div> <button class="btn btn-secondary" type="button" data-understand data-astro-cid-7czmf6z2>I understand</button> </li> <li class="step" data-astro-cid-7czmf6z2> <h2 data-astro-cid-7czmf6z2><span class="n tnum" data-astro-cid-7czmf6z2>3</span> Connect the camera</h2> <!-- The connect control stays unavailable until the warning is accepted,
           and unavailability is never signalled by colour alone. --> <button class="btn" type="button" data-connect disabled aria-describedby="connect-why" data-astro-cid-7czmf6z2>Connect a camera</button> <p class="why" id="connect-why" data-connect-why data-astro-cid-7czmf6z2>Read the warning above and choose “I understand” first.</p> <div class="manual" data-astro-cid-7czmf6z2> <label for="serial-manual" data-astro-cid-7czmf6z2>Or enter the serial engraved on the underside</label> <div class="manual-row" data-astro-cid-7czmf6z2> <input id="serial-manual" class="serial mono" type="text" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="VC26 09PV DA7Q" data-serial-input disabled data-astro-cid-7czmf6z2> <button class="btn btn-secondary" type="button" data-identify disabled data-astro-cid-7czmf6z2>Identify</button> </div> <p class="field-error" data-serial-error data-astro-cid-7czmf6z2></p> </div> </li> <li class="step" data-device-step hidden data-astro-cid-7czmf6z2> <h2 data-astro-cid-7czmf6z2><span class="n tnum" data-astro-cid-7czmf6z2>4</span> The camera</h2> <p class="device-line" data-device-line data-astro-cid-7czmf6z2></p> <div class="images" data-images data-astro-cid-7czmf6z2> <p class="recommended-label" data-astro-cid-7czmf6z2>Recommended</p> <div class="recommended" data-recommended data-astro-cid-7czmf6z2></div> <details class="others" data-astro-cid-7czmf6z2> <summary data-astro-cid-7czmf6z2>Other versions</summary> <div data-other-images data-astro-cid-7czmf6z2></div> </details> </div> </li> <li class="step" data-write-step hidden data-astro-cid-7czmf6z2> <h2 data-astro-cid-7czmf6z2><span class="n tnum" data-astro-cid-7czmf6z2>5</span> The write</h2> <!-- A figure that came from the device, not a bar on a timer. There is no
           cancel, because there is no safe cancel. --> <p class="writing" data-writing data-astro-cid-7czmf6z2></p> <p class="outcome" data-outcome data-astro-cid-7czmf6z2></p> </li> </ol> </div>  `;
}, "/app/src/islands/Installer.astro", void 0);

const $$Astro = createAstro();
const $$Doctor = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Doctor;
  const viewer = await viewerFor(Astro2.request);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer \u2014 Vela", "description": "Write firmware to a camera Arranger cannot reach.", "current": "doctor", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-zyq4rxkj": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-zyq4rxkj>Firmware installer</h1> <p class="lede" data-astro-cid-zyq4rxkj>
This page writes firmware to a camera that Arranger cannot see. If Arranger can see your
    camera, use Arranger instead. You can leave this page at any point before the write and
    nothing will have changed.
</p>  <p class="repair-note" data-astro-cid-zyq4rxkj>
It does not matter whether the camera is registered to you, or whether the warranty has run out.
    We repair either way.
</p> ${renderComponent($$result2, "Installer", $$Installer, { "data-astro-cid-zyq4rxkj": true })} ` })} `;
}, "/app/src/pages/doctor.astro", void 0);

const $$file = "/app/src/pages/doctor.astro";
const $$url = "/doctor";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Doctor,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

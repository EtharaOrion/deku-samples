import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, n as renderScript } from '../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_DM7_sVDJ.mjs';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

const $$Doctor = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer", "current": "doctor", "description": "Write firmware to a camera Arranger cannot reach." }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1>Firmware installer</h1> <p>
This writes new software to a camera from inside this browser. Use it when Arranger cannot see the camera.
      You can leave at any point before the write and nothing will have changed.
</p> </div> <div class="doctor" data-doctor> <p class="vh" role="status" aria-live="polite" data-doctor-live></p> <ol> <li> <h2>What this browser can do</h2> <p class="small" data-support>Checking whether this browser can talk to a camera.</p> <p class="small" data-in-app hidden>
Use Arranger instead. <a href="/downloads">Download it here</a> and open the camera from the Cameras menu.
</p> </li> <li> <h2>Before you start</h2> <div class="warning-block" tabindex="0" role="group" aria-label="Before you start"> <p>
This replaces the software inside your camera. It takes about ninety seconds.
            Do not unplug the camera and do not let your computer go to sleep.
            If you are on a laptop, plug it in.
</p> <button type="button" class="btn" data-understand>I understand</button> </div> </li> <li> <h2>Connect the camera</h2> <p class="small">
Plug the camera in with the cable it came with, then type the serial from the underside.
          A camera registered to somebody else, and a camera out of warranty, are both repaired here.
</p> <label class="field" style="max-width: 22rem"> <span>Serial number</span> <input type="text" data-serial class="serial" maxlength="14" autocomplete="off" spellcheck="false" placeholder="VC2609PVDA7Q"> </label> <button type="button" class="btn" data-connect disabled aria-disabled="true">Connect the camera</button> <p class="small muted" data-connect-why>Read the warning above and choose <span style="font-weight:700">I understand</span> before connecting.</p> <p class="small" style="color: var(--state-wrong)" data-refusal hidden></p> </li> <li> <h2>Choose the image</h2> <div data-identified hidden> <p class="small" data-ident-line></p> <div data-images></div> </div> <p class="small muted" data-images-empty>Connect a camera first and the images it can take will be listed here.</p> </li> <li> <h2>The write</h2> <div data-write-step hidden> <p class="progress-figure" data-write-figure>0%</p> <p class="small" data-write-line>Writing. Do not unplug your camera.</p> </div> <div data-done hidden> <p class="small" data-done-line></p> <p class="small"><a href="/account/cameras">See this camera in your account</a></p> </div> <p class="small muted" data-write-idle>Nothing is being written yet.</p> </li> </ol> </div> ${renderScript($$result2, "/app/src/pages/doctor.astro?astro&type=script&index=0&lang.ts")} ` })}`;
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

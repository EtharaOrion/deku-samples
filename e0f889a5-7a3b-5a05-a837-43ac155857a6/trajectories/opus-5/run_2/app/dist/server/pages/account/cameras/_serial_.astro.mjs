import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, s as signInRedirect, $ as $$Shell } from '../../../chunks/page_2k6pLPlp.mjs';
import { a as apiGet, b as authHeaders, f as formatDate } from '../../../chunks/api_eUbQd3xF.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const { serial } = Astro2.params;
  const viewer = await viewerFor(Astro2.request);
  if (!viewer.customer) return signInRedirect(`/account/cameras/${serial}`);
  const result = await apiGet(
    Astro2.request,
    `/account/devices/${serial}`,
    { headers: authHeaders(Astro2.request) }
  );
  const device = result.ok ? result.data : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": device ? `${device.nickname || device.model} \u2014 Vela` : "Camera \u2014 Vela", "current": "cameras", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-nd76frh6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-nd76frh6> <a href="/account/cameras" data-astro-cid-nd76frh6>Cameras</a> <span aria-hidden="true" data-astro-cid-nd76frh6>/</span> <span class="mono" data-astro-cid-nd76frh6>${serial}</span> </nav> ${!device && renderTemplate`<div class="empty-state" data-astro-cid-nd76frh6> <p data-astro-cid-nd76frh6>That camera is not on your account.</p> <a class="btn btn-secondary" href="/account/cameras" data-astro-cid-nd76frh6>Back to your cameras</a> </div>`}${device && renderTemplate`<div class="camera" data-camera${addAttribute(device.serial, "data-serial")} data-astro-cid-nd76frh6> <header class="head" data-astro-cid-nd76frh6> <h1 data-title data-astro-cid-nd76frh6>${device.nickname || device.model}</h1> <p class="model" data-astro-cid-nd76frh6>${device.model} · <span class="serial mono" data-astro-cid-nd76frh6>${device.serial}</span></p> </header> <dl class="facts" data-astro-cid-nd76frh6> <div data-astro-cid-nd76frh6> <dt data-astro-cid-nd76frh6>Firmware</dt> <dd data-astro-cid-nd76frh6> ${device.firmware_version ? renderTemplate`<span class="version mono" data-astro-cid-nd76frh6>${device.firmware_version}</span>` : renderTemplate`<span class="muted" data-astro-cid-nd76frh6>Not yet connected</span>`} ${device.update_available && renderTemplate`<span class="chip chip-progress" data-astro-cid-nd76frh6>Update available</span>`} </dd> </div> <div data-astro-cid-nd76frh6> <dt data-astro-cid-nd76frh6>Latest available</dt> <dd data-astro-cid-nd76frh6><span class="version mono" data-astro-cid-nd76frh6>${device.latest_firmware || "\u2014"}</span></dd> </div> <div data-astro-cid-nd76frh6> <dt data-astro-cid-nd76frh6>Warranty</dt> <dd data-astro-cid-nd76frh6> ${device.warranty_until ? renderTemplate`<span class="chip chip-neutral" data-astro-cid-nd76frh6>${device.warranty_expired ? `Ended ${formatDate(device.warranty_until)}` : `To ${formatDate(device.warranty_until)}`}</span>` : renderTemplate`<span class="muted" data-astro-cid-nd76frh6>Not recorded</span>`} </dd> </div> </dl> <section class="block" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Name</h2> <form class="rename" data-rename novalidate data-astro-cid-nd76frh6> <label class="visually-hidden" for="nickname" data-astro-cid-nd76frh6>Nickname</label> <input id="nickname" name="nickname" type="text"${addAttribute(device.nickname || "", "value")} placeholder="The one in the bag" maxlength="60" data-astro-cid-nd76frh6> <button class="btn btn-secondary" type="submit" data-astro-cid-nd76frh6>Save the name</button> </form> <p class="status" data-rename-status role="status" aria-live="polite" data-astro-cid-nd76frh6></p> </section> <section class="block" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Firmware</h2> <p class="muted" data-astro-cid-nd76frh6>Arranger writes firmware. If it cannot see this camera, the browser installer can.</p> <a class="btn btn-secondary" href="/doctor" data-astro-cid-nd76frh6>Open the firmware installer</a> </section> <!-- Removing and handing on are different actions and the copy never
           blurs them. --> <section class="block danger" data-astro-cid-nd76frh6> <h2 data-astro-cid-nd76frh6>Remove from my account</h2> <p class="muted" data-astro-cid-nd76frh6>
This releases the camera without giving it to anyone. It is what you do when you sell it
          to a stranger: they can then register it themselves.
</p> <button class="btn btn-secondary" type="button" data-release data-astro-cid-nd76frh6>Remove from my account</button> <p class="status" data-release-status role="status" aria-live="polite" data-astro-cid-nd76frh6></p> </section> <!-- Every destructive action confirms first; Escape closes the overlay. --> <dialog class="confirm-dialog" data-confirm-dialog aria-labelledby="confirm-heading" data-astro-cid-nd76frh6> <h2 id="confirm-heading" data-astro-cid-nd76frh6>Remove this camera from your account?</h2> <p data-astro-cid-nd76frh6>
It stops being yours. Nobody else receives it, and you can register it again later if you
          still have it.
</p> <div class="dialog-actions" data-astro-cid-nd76frh6> <button class="btn btn-secondary" type="button" data-cancel data-astro-cid-nd76frh6>Keep it</button> <button class="btn" type="button" data-confirm-release data-astro-cid-nd76frh6>Remove it</button> </div> </dialog> </div>`}` })}  `;
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

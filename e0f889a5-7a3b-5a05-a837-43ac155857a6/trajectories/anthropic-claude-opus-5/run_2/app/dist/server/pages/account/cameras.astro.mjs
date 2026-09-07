import { c as createComponent, m as maybeRenderHead, r as renderTemplate, d as renderComponent, b as createAstro } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, s as signInRedirect, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$CameraCard } from '../../chunks/CameraCard_C8eUlRc3.mjs';
import 'clsx';
/* empty css                                    */
import { a as apiGet, b as authHeaders } from '../../chunks/api_eUbQd3xF.mjs';
export { renderers } from '../../renderers.mjs';

const $$RegisterRow = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<form class="register" data-register novalidate data-astro-cid-xb2ib4ia> <div class="field" data-astro-cid-xb2ib4ia> <label for="serial" data-astro-cid-xb2ib4ia>Register a camera</label> <div class="row" data-astro-cid-xb2ib4ia> <input id="serial" name="serial" class="serial mono" type="text" inputmode="text" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="VA26 09KT MHX4" aria-describedby="serial-help" data-serial data-astro-cid-xb2ib4ia> <button class="btn" type="submit" data-submit data-astro-cid-xb2ib4ia>Register</button> </div> <p class="help" id="serial-help" data-astro-cid-xb2ib4ia>Twelve characters, engraved on the underside.</p> <p class="field-error" data-error role="alert" data-astro-cid-xb2ib4ia></p> <!-- A brief confirmation that fades on its own. --> <p class="confirm" data-confirm role="status" aria-live="polite" hidden data-astro-cid-xb2ib4ia></p> </div> </form>  `;
}, "/app/src/islands/RegisterRow.astro", void 0);

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const viewer = await viewerFor(Astro2.request);
  if (!viewer.customer) return signInRedirect("/account/cameras");
  const result = await apiGet(
    Astro2.request,
    "/account/devices?page_size=100",
    { headers: authHeaders(Astro2.request) }
  );
  const devices = result.ok ? result.data.data : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cameras \u2014 Vela", "current": "cameras", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-xzlb2mys": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 data-astro-cid-xzlb2mys>Cameras</h1> ${renderComponent($$result2, "RegisterRow", $$RegisterRow, { "data-astro-cid-xzlb2mys": true })} ${!result.ok && renderTemplate`<p class="notice notice-error" role="alert" data-astro-cid-xzlb2mys> ${result.error.message} ${result.error.request_id && renderTemplate`<span class="mono" data-astro-cid-xzlb2mys> Reference ${result.error.request_id}.</span>`} </p>`}${result.ok && devices.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-xzlb2mys> <p data-astro-cid-xzlb2mys>No cameras registered yet.</p> <p class="muted" data-astro-cid-xzlb2mys>Register one with the serial engraved on its underside.</p> </div>`}${devices.length > 0 && renderTemplate`<ul class="grid" data-astro-cid-xzlb2mys> ${devices.map((device) => renderTemplate`<li data-astro-cid-xzlb2mys>${renderComponent($$result2, "CameraCard", $$CameraCard, { "device": device, "data-astro-cid-xzlb2mys": true })}</li>`)} </ul>`}` })} `;
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

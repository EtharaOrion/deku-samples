import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, l as Fragment, n as renderScript } from '../../chunks/astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_DM7_sVDJ.mjs';
import { $ as $$ProductMedia } from '../../chunks/ProductMedia_CT5FDNyL.mjs';
import { a as apiFetch, f as formatMinor } from '../../chunks/api_-Wd5sQnB.mjs';
import { f as formatDate } from '../../chunks/format_Dm8rsWwp.mjs';
/* empty css                                   */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const wanted = Astro2.url.searchParams.get("variant");
  const res = await apiFetch(Astro2, `/api/products/${encodeURIComponent(handle)}${wanted ? `?variant=${encodeURIComponent(wanted)}` : ""}`);
  if (res.status === 404) {
    return new Response(null, { status: 404, headers: { Location: "/404" } });
  }
  const p = res.data;
  const selected = p.variants.find((v) => v.sku === p.selected_sku) ?? p.variants[0];
  const lede = p.blocks.find((b) => b.kind === "lede");
  const specs = p.blocks.filter((b) => b.kind === "spec_group");
  const box = p.blocks.find((b) => b.kind === "in_the_box");
  const compat = p.blocks.find((b) => b.kind === "compatibility");
  const supportNote = p.blocks.find((b) => b.kind === "support_note");
  const discontinued = p.status === "discontinued";
  selected.availability;
  const buyDisabled = discontinued || selected.available <= 0;
  const buyLabel = discontinued ? "Discontinued" : selected.available <= 0 ? "Sold out" : "Add to cart";
  const availLine = discontinued ? "Discontinued" : selected.available <= 0 ? "Sold out" : selected.available <= 10 ? `Only ${selected.available} left` : "";
  const views = [0, 1, 2];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": p.title, "current": "shop", "description": p.subtitle }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="product" data-product${addAttribute(p.status, "data-status")}${addAttribute(JSON.stringify(p.variants.map((v) => ({ sku: v.sku, price_minor: v.price_minor, available: v.available, option_value: v.option_value }))), "data-variants")}> <div> <div class="gallery-main"> ${views.map((v, i) => renderTemplate`<div data-gallery-view${addAttribute(i !== 0, "hidden")}> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": p.handle, "view": v, "label": `${p.title}, view ${i + 1}` })} </div>`)} </div> <ul class="gallery-thumbs"${addAttribute(`${p.title}, other views`, "aria-label")}> ${views.map((v, i) => renderTemplate`<li> <button type="button" data-gallery-thumb${addAttribute(i === 0 ? "true" : "false", "aria-current")}${addAttribute(`Show view ${i + 1} of ${p.title}`, "aria-label")}> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": p.handle, "view": v, "label": "" })} </button> </li>`)} </ul> </div> <div> <h1 class="product-title">${p.title}</h1> <p class="product-sub">${p.subtitle}</p> <p class="product-price money" data-price>${formatMinor(selected.price_minor)}</p> <p class="muted small" data-availability${addAttribute(!availLine, "hidden")}>${availLine}</p> ${p.variants.length > 1 && renderTemplate`<fieldset class="optgroup"> <legend>Finish</legend> <div class="optlist"> ${p.variants.map((v) => renderTemplate`<label> <input type="radio" name="variant"${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected.sku, "checked")}${addAttribute(discontinued, "disabled")}> <span>${v.option_value}</span> ${v.available <= 0 && !discontinued && renderTemplate`<span class="muted small">Sold out</span>`} </label>`)} </div> </fieldset>`} <div class="buy-row"> <div class="stepper" role="group" aria-label="Quantity"> <button type="button" data-dec aria-label="One fewer">−</button> <input type="number" data-qty value="1" min="1"${addAttribute(Math.max(1, Math.min(10, selected.available)), "max")} aria-label="Quantity"> <button type="button" data-inc aria-label="One more">+</button> </div> <button type="button" class="btn" data-buy${addAttribute(buyDisabled, "disabled")}${addAttribute(String(buyDisabled), "aria-disabled")}> ${buyLabel} </button> </div> <p class="vh" role="status" aria-live="polite" data-live></p> ${discontinued && supportNote && renderTemplate`<p class="notice notice-progress" style="margin-top: 1.5rem">${supportNote.payload.text}</p>`} ${discontinued && !supportNote && p.support_until && renderTemplate`<p class="notice notice-progress" style="margin-top: 1.5rem">
We no longer sell this. We will support it until ${formatDate(p.support_until)}.
</p>`} ${!discontinued && p.support_until && renderTemplate`<p class="muted small" style="margin-top: 1.5rem">We will support this camera until ${formatDate(p.support_until)}.</p>`} </div> </div> <div class="blocks"> ${lede && renderTemplate`<p class="block-lede">${lede.payload.text}</p>`} ${specs.map((s) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <h2>${s.payload.title}</h2> <table class="table"> <tbody> ${s.payload.rows.map(([k, v]) => renderTemplate`<tr><th scope="row">${k}</th><td class="num tnum">${v}</td></tr>`)} </tbody> </table> ` })}`)} ${box && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <h2>In the box</h2> <ul>${box.payload.items.map((i) => renderTemplate`<li>${i}</li>`)}</ul> ` })}`} ${compat && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, {}, { "default": async ($$result3) => renderTemplate` <h2>Compatibility</h2> <table class="table"> <tbody> <tr><th scope="row">Minimum operating system</th><td>${compat.payload.min_os}</td></tr> <tr><th scope="row">Minimum application version</th><td class="version">${compat.payload.min_app}</td></tr> </tbody> </table> <p class="muted small" style="margin-top: 0.75rem">${compat.payload.text}</p> ` })}`} </div> ${renderScript($$result2, "/app/src/pages/shop/[handle].astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/app/src/pages/shop/[handle].astro", void 0);

const $$file = "/app/src/pages/shop/[handle].astro";
const $$url = "/shop/[handle]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$handle,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

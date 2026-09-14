import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from '../../chunks/astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
import { $ as $$App } from '../../chunks/App_CbKyOZgE.mjs';
import { p as productByHandle, m as money } from '../../chunks/queries_DE4s-KG7.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const product = await productByHandle(handle);
  if (!product) {
    Astro2.response.status = 404;
    return Astro2.rewrite("/404");
  }
  const url = new URL(Astro2.request.url);
  const asked = url.searchParams.get("variant");
  const known = product.variants.find((v) => v.sku === asked);
  const selected = known || product.variants[0];
  const droppedParam = asked && !known;
  const isDiscontinued = product.status === "discontinued";
  const soldOut = !isDiscontinued && (selected.available || 0) <= 0;
  const onlyLeft = !isDiscontinued && !soldOut && (selected.available || 0) <= 10 ? selected.available : null;
  const support = product.blocks.find((b) => b.kind === "support_note");
  const groups = product.blocks.filter((b) => b.kind === "spec_group");
  const boxes = product.blocks.filter((b) => b.kind === "in_the_box");
  const compats = product.blocks.filter((b) => b.kind === "compatibility");
  const ledes = product.blocks.filter((b) => b.kind === "lede");
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": product.title, "active": "shop", "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="product" data-astro-cid-aqxoqqhg> <div class="gallery" aria-label="{product.title} views" data-astro-cid-aqxoqqhg> <div class="frame frame-main"${addAttribute(product.handle, "data-tone")} data-astro-cid-aqxoqqhg></div> <div class="thumbs" role="tablist" aria-label="Views" data-astro-cid-aqxoqqhg> <button class="thumb is-active" role="tab" aria-selected="true" data-view="0" aria-label="Front view" data-astro-cid-aqxoqqhg></button> <button class="thumb" role="tab" aria-selected="false" data-view="1" aria-label="Top view" data-astro-cid-aqxoqqhg></button> <button class="thumb" role="tab" aria-selected="false" data-view="2" aria-label="Back view" data-astro-cid-aqxoqqhg></button> </div> </div> <div class="detail" data-astro-cid-aqxoqqhg> <h1 class="title" data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="subtitle" data-astro-cid-aqxoqqhg>${product.subtitle}</p> <p class="price tnum" data-astro-cid-aqxoqqhg>${money(selected.price_minor)} <span class="vat" data-astro-cid-aqxoqqhg>USD</span></p> <p class="availability" data-astro-cid-aqxoqqhg> ${isDiscontinued ? renderTemplate`<span class="chip" data-tone="" data-astro-cid-aqxoqqhg>Discontinued</span>` : soldOut ? renderTemplate`<span class="chip" data-tone="wrong" data-astro-cid-aqxoqqhg>Sold out</span>` : onlyLeft !== null ? renderTemplate`<span class="chip" data-astro-cid-aqxoqqhg>Only ${onlyLeft} left</span>` : renderTemplate`<span class="chip" data-tone="finished" data-astro-cid-aqxoqqhg>Available</span>`} </p> ${isDiscontinued && support && renderTemplate`<div class="notice" role="note" data-astro-cid-aqxoqqhg> ${support.payload.note} </div>`} ${product.variants.length > 1 && renderTemplate`<fieldset class="options" data-astro-cid-aqxoqqhg> <legend class="option-label" data-astro-cid-aqxoqqhg>${product.kind === "camera" ? "Colour" : "Option"}</legend> <div class="radios" role="radiogroup" aria-label="Option" data-astro-cid-aqxoqqhg> ${product.variants.map((v) => renderTemplate`<label${addAttribute(`radio ${v.sku === selected.sku ? "is-selected" : ""}`, "class")} data-astro-cid-aqxoqqhg> <input type="radio" name="variant"${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected.sku, "checked")}${addAttribute(v.price_minor, "data-price")}${addAttribute(v.available, "data-available")} data-astro-cid-aqxoqqhg> <span data-astro-cid-aqxoqqhg>${v.option_value}</span> <span class="radio-note tnum" data-astro-cid-aqxoqqhg>${money(v.price_minor)}</span> ${(v.available || 0) <= 0 && !isDiscontinued && renderTemplate`<span class="radio-sold" data-astro-cid-aqxoqqhg>Sold out</span>`} </label>`)} </div> </fieldset>`} ${droppedParam && renderTemplate`<p class="dropped-note" data-astro-cid-aqxoqqhg>That option does not exist, so we are showing ${selected.option_value}.</p>`} ${renderComponent($$result2, "buy-control", "buy-control", { "sku": selected.sku, "price-minor": selected.price_minor, "available": selected.available ?? 0, "max-qty": Math.min(10, Math.max(1, selected.available || 1)), "disabled": isDiscontinued || soldOut ? "" : void 0, "label": isDiscontinued ? "Discontinued" : soldOut ? "Sold out" : `Add ${product.title} to cart`, "data-astro-cid-aqxoqqhg": true })} ${ledes.map((b) => renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${b.payload.text}</p>`)} ${groups.map((g) => renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>${g.payload.title}</h2> <table class="spec" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${g.payload.rows.map(([k, v]) => renderTemplate`<tr data-astro-cid-aqxoqqhg><th scope="row" data-astro-cid-aqxoqqhg>${k}</th><td data-astro-cid-aqxoqqhg>${v}</td></tr>`)} </tbody> </table> </section>`)} ${boxes.map((b) => renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>In the box</h2> <ul data-astro-cid-aqxoqqhg>${b.payload.items.map((i) => renderTemplate`<li data-astro-cid-aqxoqqhg>${i}</li>`)}</ul> </section>`)} ${compats.map((b) => renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Compatibility</h2> <p data-astro-cid-aqxoqqhg>Minimum operating system: ${b.payload.os}. Application: ${b.payload.app}.</p> </section>`)} ${product.firmware.length > 0 && renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Firmware</h2> <table class="spec" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${product.firmware.map((f) => renderTemplate`<tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg><span class="mono" data-astro-cid-aqxoqqhg>${f.version}</span></th> <td data-astro-cid-aqxoqqhg>build <span class="mono tnum" data-astro-cid-aqxoqqhg>${f.build}</span>, minimum firmware ${f.min_firmware ? renderTemplate`<span class="mono" data-astro-cid-aqxoqqhg>${f.min_firmware}</span>` : "none"}, minimum app <span class="mono" data-astro-cid-aqxoqqhg>${f.min_app_version}</span></td> </tr>`)} </tbody> </table> </section>`} </div> </div> ` })}  `;
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

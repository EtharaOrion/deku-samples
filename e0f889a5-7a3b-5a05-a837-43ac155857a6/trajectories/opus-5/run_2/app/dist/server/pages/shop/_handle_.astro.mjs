import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, b as createAstro, d as renderComponent, F as Fragment } from '../../chunks/astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import { v as viewerFor, $ as $$Shell } from '../../chunks/page_2k6pLPlp.mjs';
import { $ as $$ProductMedia } from '../../chunks/ProductMedia_Ctf_7hXL.mjs';
import 'clsx';
import { c as formatMoney, a as apiGet, f as formatDate } from '../../chunks/api_eUbQd3xF.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

const $$Astro$1 = createAstro();
const $$BuyPanel = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$BuyPanel;
  const { product, selectedSku } = Astro2.props;
  const variants = product.variants || [];
  const selected = variants.find((v) => v.sku === selectedSku) || variants[0];
  const single = variants.length === 1;
  const useRadios = variants.length <= 5;
  return renderTemplate`${maybeRenderHead()}<section class="buy" data-buy${addAttribute(product.handle, "data-handle")}${addAttribute(selected?.sku, "data-sku")} aria-labelledby="buy-heading" data-astro-cid-7o3pgkbs> <h2 class="visually-hidden" id="buy-heading" data-astro-cid-7o3pgkbs>Buy</h2> <p class="price tnum" data-price data-astro-cid-7o3pgkbs>${formatMoney(selected?.price_minor ?? 0)}</p> <p class="availability" data-availability${addAttribute(selected?.availability?.state, "data-state")} data-astro-cid-7o3pgkbs> ${selected?.availability?.state === "available" ? "" : selected?.availability?.label} </p>  ${single && selected && renderTemplate`<input type="hidden" data-variant-input${addAttribute(selected.sku, "value")}${addAttribute(selected.price_minor, "data-price-minor")}${addAttribute(selected.available, "data-available")}${addAttribute(selected.availability.state, "data-state")}${addAttribute(selected.availability.label, "data-label")} data-astro-cid-7o3pgkbs>`} ${!single && useRadios && renderTemplate`<fieldset class="options" data-astro-cid-7o3pgkbs> <legend data-astro-cid-7o3pgkbs>Colour</legend> <div class="radios" data-astro-cid-7o3pgkbs> ${variants.map((v) => renderTemplate`<label class="radio"${addAttribute(v.sku, "data-option-label")} data-astro-cid-7o3pgkbs> <input type="radio" name="variant"${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected?.sku, "checked")} data-variant-input${addAttribute(v.price_minor, "data-price-minor")}${addAttribute(v.available, "data-available")}${addAttribute(v.availability.state, "data-state")}${addAttribute(v.availability.label, "data-label")} data-astro-cid-7o3pgkbs> <span data-astro-cid-7o3pgkbs>${v.option_value}</span> </label>`)} </div> </fieldset>`} ${!single && !useRadios && renderTemplate`<div class="field" data-astro-cid-7o3pgkbs> <label for="variant-select" data-astro-cid-7o3pgkbs>Colour</label> <select id="variant-select" data-variant-select data-astro-cid-7o3pgkbs> ${variants.map((v) => renderTemplate`<option${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected?.sku, "selected")} data-astro-cid-7o3pgkbs>${v.option_value}</option>`)} </select> </div>`} <div class="qty" data-astro-cid-7o3pgkbs> <label for="qty-input" data-astro-cid-7o3pgkbs>Quantity</label> <div class="stepper" data-astro-cid-7o3pgkbs> <button type="button" class="btn btn-secondary btn-small" data-qty-down aria-label="One fewer" data-astro-cid-7o3pgkbs>&minus;</button> <input id="qty-input" type="number" class="tnum" value="1" min="1" max="10" step="1" data-qty inputmode="numeric" data-astro-cid-7o3pgkbs> <button type="button" class="btn btn-secondary btn-small" data-qty-up aria-label="One more" data-astro-cid-7o3pgkbs>+</button> </div> </div> <button class="btn buy-control" type="button" data-add data-astro-cid-7o3pgkbs>Add to cart</button> <p class="buy-status" data-status role="status" aria-live="polite" data-astro-cid-7o3pgkbs></p> </section>  `;
}, "/app/src/islands/BuyPanel.astro", void 0);

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const variantParam = Astro2.url.searchParams.get("variant");
  const viewer = await viewerFor(Astro2.request);
  const result = await apiGet(
    Astro2.request,
    `/products/${handle}${variantParam ? `?variant=${encodeURIComponent(variantParam)}` : ""}`
  );
  if (!result.ok && result.status === 404) {
    return new Response(null, { status: 302, headers: { location: "/shop" } });
  }
  const product = result.ok ? result.data : null;
  const blocks = product?.blocks ?? [];
  const lede = blocks.find((b) => b.kind === "lede");
  const specs = blocks.filter((b) => b.kind === "spec_group");
  const inTheBox = blocks.find((b) => b.kind === "in_the_box");
  const compatibility = blocks.find((b) => b.kind === "compatibility");
  const supportNote = blocks.find((b) => b.kind === "support_note");
  const selected = product?.variants?.find((v) => v.sku === product.selected_sku) || product?.variants?.[0];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": product ? `${product.title} \u2014 Vela` : "Vela", "description": product?.subtitle, "current": "shop", "customer": viewer.customer, "cartCount": viewer.cartCount, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate`${!product && renderTemplate`${maybeRenderHead()}<p class="notice notice-error" role="alert" data-astro-cid-aqxoqqhg> ${result.ok ? "That product does not exist." : result.error.message} </p>`}${product && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result3) => renderTemplate` <nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-aqxoqqhg> <a href="/shop" data-astro-cid-aqxoqqhg>Shop</a> <span aria-hidden="true" data-astro-cid-aqxoqqhg>/</span> <span data-astro-cid-aqxoqqhg>${product.title}</span> </nav> <div class="product" data-astro-cid-aqxoqqhg> <!-- A keyboard navigable gallery on one side. --> <section class="gallery"${addAttribute(`${product.title} images`, "aria-label")} data-astro-cid-aqxoqqhg> <ul class="frames" data-astro-cid-aqxoqqhg> ${product.variants.map((v, i) => renderTemplate`<li data-astro-cid-aqxoqqhg> <button class="frame" type="button"${addAttribute(`${product.title}, ${v.option_value}`, "aria-label")}${addAttribute(v.sku === selected?.sku ? "true" : "false", "aria-pressed")} data-astro-cid-aqxoqqhg> ${renderComponent($$result3, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": v.option_value, "title": product.title, "ratio": "4 / 3", "data-astro-cid-aqxoqqhg": true })} </button> </li>`)} </ul> </section> <div class="detail" data-astro-cid-aqxoqqhg> <h1 data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="subtitle" data-astro-cid-aqxoqqhg>${product.subtitle}</p> ${product.status === "discontinued" && supportNote && renderTemplate`<p class="notice" data-support-note data-astro-cid-aqxoqqhg>${supportNote.payload.text}</p>`} ${renderComponent($$result3, "BuyPanel", $$BuyPanel, { "product": product, "selectedSku": product.selected_sku, "data-astro-cid-aqxoqqhg": true })} </div> </div>  <div class="blocks" data-astro-cid-aqxoqqhg> ${lede && renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${lede.payload.text}</p>`} ${specs.length > 0 && renderTemplate`<section class="block" aria-labelledby="specs-heading" data-astro-cid-aqxoqqhg> <h2 id="specs-heading" data-astro-cid-aqxoqqhg>Specifications</h2> ${specs.map((group) => renderTemplate`<table class="table" data-astro-cid-aqxoqqhg> <caption class="visually-hidden" data-astro-cid-aqxoqqhg>${group.payload.title}</caption> <thead data-astro-cid-aqxoqqhg> <tr data-astro-cid-aqxoqqhg><th scope="col" colspan="2" data-astro-cid-aqxoqqhg>${group.payload.title}</th></tr> </thead> <tbody data-astro-cid-aqxoqqhg> ${group.payload.rows.map((row) => renderTemplate`<tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>${row.label}</th> <td class="num tnum" data-astro-cid-aqxoqqhg>${row.value}</td> </tr>`)} </tbody> </table>`)} </section>`} ${inTheBox && renderTemplate`<section class="block" aria-labelledby="box-heading" data-astro-cid-aqxoqqhg> <h2 id="box-heading" data-astro-cid-aqxoqqhg>In the box</h2> <ul class="box-list" data-astro-cid-aqxoqqhg> ${inTheBox.payload.items.map((item) => renderTemplate`<li data-astro-cid-aqxoqqhg>${item}</li>`)} </ul> </section>`} ${compatibility && renderTemplate`<section class="block" aria-labelledby="compat-heading" data-astro-cid-aqxoqqhg> <h2 id="compat-heading" data-astro-cid-aqxoqqhg>Compatibility</h2> <p data-astro-cid-aqxoqqhg>${compatibility.payload.text}</p> <dl class="compat" data-astro-cid-aqxoqqhg> <div data-astro-cid-aqxoqqhg><dt data-astro-cid-aqxoqqhg>Minimum operating system</dt><dd class="mono" data-astro-cid-aqxoqqhg>${compatibility.payload.minimum_os}</dd></div> <div data-astro-cid-aqxoqqhg><dt data-astro-cid-aqxoqqhg>Minimum application version</dt><dd class="mono" data-astro-cid-aqxoqqhg>${compatibility.payload.minimum_app}</dd></div> </dl> </section>`} ${product.support_until && renderTemplate`<p class="support-until" data-astro-cid-aqxoqqhg>
Supported until <time${addAttribute(product.support_until, "datetime")} data-astro-cid-aqxoqqhg>${formatDate(product.support_until)}</time>.
</p>`} </div> ` })}`}` })} `;
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

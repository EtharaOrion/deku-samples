import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, d as renderComponent, F as Fragment, b as createAstro } from "../../chunks/astro/server_BSRltX1G.mjs";
import "kleur/colors";
import { $ as $$Shell } from "../../chunks/Shell_COYl1VNS.mjs";
import { p as productByHandle, a as productView } from "../../chunks/catalog_BnA2aLlY.mjs";
import { m as money } from "../../chunks/format_F6jgEW4F.mjs";
import { g as getCartForContext } from "../../chunks/context_Bm1YOHfv.mjs";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
const $$Astro$1 = createAstro();
const $$BuyControl = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$BuyControl;
  const { product, selectedSku, discontinued, supportNote } = Astro2.props;
  const selected = product.variants.find((v) => v.sku === selectedSku) ?? product.variants[0];
  const supportText = supportNote?.text ? supportNote.text : product.support_until ? `We no longer sell this. We will support it until ${new Date(product.support_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.` : "";
  const payload = product.variants.map((v) => ({
    sku: v.sku,
    option_value: v.option_value,
    price_minor: v.price_minor,
    available: v.available,
    state: v.availability.state,
    label: v.availability.label,
    buyable: v.availability.buyable
  }));
  return renderTemplate`${maybeRenderHead()}<div class="buy" data-buy-surface${addAttribute(JSON.stringify(payload), "data-variants")}${addAttribute(selected.sku, "data-initial-sku")} data-astro-cid-ba65wpip> <form class="buy-form" data-buy-form data-astro-cid-ba65wpip> ${product.variants.length > 1 ? renderTemplate`<fieldset class="options" data-astro-cid-ba65wpip> <legend data-astro-cid-ba65wpip>${product.kind === "camera" ? "Finish" : "Option"}</legend> <div class="option-radios" role="radiogroup" aria-label="Option" data-astro-cid-ba65wpip> ${product.variants.map((v) => renderTemplate`<label${addAttribute(["option", { "is-checked": v.sku === selected.sku }], "class:list")}${addAttribute(v.sku, "data-option")} data-astro-cid-ba65wpip> <input type="radio" name="variant"${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected.sku, "checked")} data-variant-radio data-astro-cid-ba65wpip> <span class="option-label" data-astro-cid-ba65wpip> <span data-astro-cid-ba65wpip>${v.option_value}</span> <span class="num option-price"${addAttribute(v.sku, "data-option-price")} data-astro-cid-ba65wpip>${money(v.price_minor)}</span> </span> ${v.availability.state === "sold_out" ? renderTemplate`<span class="option-state" data-astro-cid-ba65wpip>Sold out</span>` : null} ${v.availability.state === "low" ? renderTemplate`<span class="option-state"${addAttribute(v.sku, "data-option-note")} data-astro-cid-ba65wpip>${v.availability.label}</span>` : null} </label>`)} </div> </fieldset>` : renderTemplate`<p class="single-option" data-single-option data-astro-cid-ba65wpip> ${selected.option_value} · <span class="num" data-astro-cid-ba65wpip>${money(selected.price_minor)}</span> ${selected.availability.state === "low" ? renderTemplate`<span class="option-state" data-astro-cid-ba65wpip>${selected.availability.label}</span>` : null} </p>`} <div class="qty" data-qty data-astro-cid-ba65wpip> <span class="qty-label" id="qty-label" data-astro-cid-ba65wpip>Quantity</span> <div class="stepper" role="group" aria-labelledby="qty-label" data-astro-cid-ba65wpip> <button type="button" class="btn stepper-btn" data-qty-dec aria-label="Decrease quantity" data-astro-cid-ba65wpip>−</button> <output class="qty-value num" data-qty-value aria-live="polite" data-astro-cid-ba65wpip>1</output> <button type="button" class="btn stepper-btn" data-qty-inc aria-label="Increase quantity" data-astro-cid-ba65wpip>+</button> </div> <span class="qty-max" data-qty-max data-astro-cid-ba65wpip>Up to ${Math.min(10, Math.max(1, selected.available))}</span> </div> <div class="buy-actions" data-astro-cid-ba65wpip> ${discontinued ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, { "data-astro-cid-ba65wpip": true }, { "default": async ($$result2) => renderTemplate` <button type="button" class="btn btn-primary" disabled aria-disabled="true" data-astro-cid-ba65wpip>Sold out</button> ${supportText ? renderTemplate`<p class="support-copy" data-astro-cid-ba65wpip>${supportText}</p>` : null}` })}` : selected.availability.state === "sold_out" ? renderTemplate`<button type="button" class="btn btn-primary" disabled aria-disabled="true" data-astro-cid-ba65wpip>Sold out</button>` : renderTemplate`<button type="submit" class="btn btn-primary" data-add-to-cart data-astro-cid-ba65wpip>Add to cart</button>`} <p class="buy-state" role="status" data-buy-state data-astro-cid-ba65wpip></p> <p class="buy-error inline-error" data-buy-error hidden data-astro-cid-ba65wpip></p> <a class="cart-link" href="/cart" data-cart-link hidden data-astro-cid-ba65wpip>Go to the cart</a> </div> </form> </div>  `;
}, "/app/src/components/BuyControl.astro", void 0);
const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const requestedVariant = Astro2.url.searchParams.get("variant");
  const row = await productByHandle(handle || "");
  if (!row) return Astro2.redirect("/404");
  const product = await productView(row, true);
  const cart = await getCartForContext(Astro2);
  const cartCount = cart ? cart.view.lines.reduce((s, l) => s + l.quantity, 0) : 0;
  const requested = product.variants.find((v) => v.sku === requestedVariant) ?? null;
  if (requestedVariant && !requested) {
    const clean = new URL(Astro2.url);
    clean.searchParams.delete("variant");
    return Astro2.redirect(clean.pathname + (clean.searchParams.toString() ? `?${clean.searchParams}` : ""), 302);
  }
  const selected = requested ?? product.variants.find((v) => v.availability.buyable) ?? product.variants[0];
  const mediaMap = { flagship: "/img/a1.svg", compact: "/img/cricket.svg", mount: "/img/mount.svg", case: "/img/case.svg", cable: "/img/cable.svg" };
  const media = mediaMap[product.handle] || "/img/cricket.svg";
  const variantPriceLabels = product.variants.map((v) => v.price_minor);
  const fromPrice = variantPriceLabels.length > 1 ? Math.min(...variantPriceLabels) : null;
  const blocks = product.blocks || [];
  const lede = blocks.find((b) => b.kind === "lede");
  const specGroups = blocks.filter((b) => b.kind === "spec_group");
  const inTheBox = blocks.find((b) => b.kind === "in_the_box");
  const compatibility = blocks.find((b) => b.kind === "compatibility");
  const supportNote = blocks.find((b) => b.kind === "support_note");
  const discontinued = product.status === "discontinued";
  const gallery = [media, ...product.variants.slice(0, 3).map(() => media)];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${product.title} — Vela`, "active": "shop", "cartCount": cartCount, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-aqxoqqhg> <a href="/shop" data-astro-cid-aqxoqqhg>Shop</a> <span aria-hidden="true" data-astro-cid-aqxoqqhg>/</span> <span data-astro-cid-aqxoqqhg>${product.title}</span> </nav> <div class="product" data-astro-cid-aqxoqqhg> <section class="gallery"${addAttribute(`${product.title} images`, "aria-label")} data-astro-cid-aqxoqqhg> <div class="gallery-stage" data-gallery-stage data-astro-cid-aqxoqqhg> ${gallery.map((src, i) => renderTemplate`<img${addAttribute(src, "src")}${addAttribute(i === 0 ? `${product.title}` : `${product.title}, view ${i + 1}`, "alt")}${addAttribute(i === 0 ? "eager" : "lazy", "loading")}${addAttribute(["gallery-frame", { "is-current": i === 0 }], "class:list")}${addAttribute(i, "data-frame")} data-astro-cid-aqxoqqhg>`)} </div> <div class="gallery-thumbs" role="tablist" aria-label="Views" data-astro-cid-aqxoqqhg> ${gallery.map((src, i) => renderTemplate`<button class="gallery-thumb" type="button" role="tab"${addAttribute(i === 0 ? "true" : "false", "aria-selected")}${addAttribute(i, "data-thumb")}${addAttribute(`View ${i + 1}`, "aria-label")} data-astro-cid-aqxoqqhg> <img${addAttribute(src, "src")} alt="" data-astro-cid-aqxoqqhg> </button>`)} </div> </section> <section class="detail" aria-labelledby="product-title" data-astro-cid-aqxoqqhg> <h1 id="product-title" data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="subtitle" data-astro-cid-aqxoqqhg>${product.subtitle}</p> <p class="price num" data-astro-cid-aqxoqqhg> ${fromPrice !== null ? renderTemplate`<span data-astro-cid-aqxoqqhg>From </span>` : null}${money(fromPrice ?? selected.price_minor)} </p> <p class="availability" data-astro-cid-aqxoqqhg> ${discontinued ? renderTemplate`<span class="chip" data-astro-cid-aqxoqqhg>Discontinued</span>` : selected.availability.state === "sold_out" ? renderTemplate`<span class="chip chip-sold" data-astro-cid-aqxoqqhg>Sold out</span>` : selected.availability.state === "low" ? renderTemplate`<span class="chip chip-low" data-astro-cid-aqxoqqhg>${selected.availability.label}</span>` : renderTemplate`<span class="chip chip-ok" data-astro-cid-aqxoqqhg>Available</span>`} </p> ${renderComponent($$result2, "BuyControl", $$BuyControl, { "product": product, "selectedSku": selected.sku, "discontinued": discontinued, "supportUntil": product.support_until, "supportNote": supportNote, "data-astro-cid-aqxoqqhg": true })} ${discontinued && supportNote ? renderTemplate`<p class="support-note" data-astro-cid-aqxoqqhg>${supportNote.text}</p>` : null} </section> </div> <div class="blocks" data-astro-cid-aqxoqqhg> ${lede ? renderTemplate`<p class="lede-block" data-astro-cid-aqxoqqhg>${lede.text}</p>` : null} ${specGroups.map((g) => renderTemplate`<section class="spec-group" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>${g.title}</h2> <table class="spec-table" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${g.rows.map(([k, v]) => renderTemplate`<tr data-astro-cid-aqxoqqhg><th scope="row" data-astro-cid-aqxoqqhg>${k}</th><td data-astro-cid-aqxoqqhg>${v}</td></tr>`)} </tbody> </table> </section>`)} ${inTheBox ? renderTemplate`<section class="box-block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>In the box</h2> <ul data-astro-cid-aqxoqqhg>${inTheBox.items.map((i) => renderTemplate`<li data-astro-cid-aqxoqqhg>${i}</li>`)}</ul> </section>` : null} ${compatibility ? renderTemplate`<section class="compat-block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Compatibility</h2> <p data-astro-cid-aqxoqqhg>Requires ${compatibility.os}. Works with Arranger ${compatibility.app} or later.</p> </section>` : null} ${supportNote && !discontinued ? renderTemplate`<section class="compat-block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Support</h2> <p data-astro-cid-aqxoqqhg>${supportNote.text}</p> </section>` : null} </div> ` })}  `;
}, "/app/src/pages/shop/[handle].astro", void 0);
const $$file = "/app/src/pages/shop/[handle].astro";
const $$url = "/shop/[handle]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$handle,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

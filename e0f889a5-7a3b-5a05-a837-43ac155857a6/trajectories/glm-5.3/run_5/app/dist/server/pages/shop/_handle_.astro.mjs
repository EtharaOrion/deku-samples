import { e as createComponent, k as renderComponent, l as renderScript, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as Fragment } from "../../chunks/astro/server_-SqM4FRO.mjs";
import "piccolore";
import { $ as $$PageShell } from "../../chunks/PageShell_DYrBPb7v.mjs";
import { g as getProduct, P as PROTECTION_PRODUCT_HANDLE, d as dollars } from "../../chunks/cart_BmbV16eC.mjs";
import { latestFirmware } from "../../chunks/releases_B2Vn5YuN.mjs";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const product = handle ? await getProduct(handle) : null;
  if (!product || product.handle === PROTECTION_PRODUCT_HANDLE) {
    return Astro2.redirect("/404");
  }
  const url = Astro2.url;
  const asked = url.searchParams.get("variant");
  const valid = asked ? product.variants.find((v) => v.sku === asked || v.option_value.toLowerCase() === asked.toLowerCase()) : null;
  const selected = valid ?? product.variants[0];
  const prices = product.variants.map((v) => v.price_minor);
  const priceLabel = new Set(prices).size > 1 ? `From ${dollars(Math.min(...prices))}` : dollars(prices[0] ?? 0);
  const availability = (() => {
    if (product.status === "discontinued") return { state: "discontinued", note: `We no longer sell this. We will support it until ${new Date(product.support_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` };
    const available = selected?.available ?? 0;
    if (available <= 0) return { state: "sold_out", note: null };
    if (available <= 10) return { state: "low", count: available, note: `Only ${available} left` };
    return { state: "available", note: null };
  })();
  const firmware = await latestFirmware(product.handle);
  const maxQty = Math.min(10, Math.max(1, selected?.available ?? 1));
  return renderTemplate`${renderComponent($$result, "PageShell", $$PageShell, { "title": `${product.title} — Vela`, "heading": product.title, "active": "shop", "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="product" data-astro-cid-aqxoqqhg> <div class="gallery" data-gallery data-astro-cid-aqxoqqhg> <img class="media"${addAttribute(`/assets/${product.handle}.png`, "src")}${addAttribute(`${product.title}`, "alt")} width="640" height="420" data-gallery-main data-astro-cid-aqxoqqhg> <div class="thumbs" role="group" aria-label="Product views" data-gallery-thumbs data-astro-cid-aqxoqqhg> ${["Front", "Top", "Back"].map((label, i) => renderTemplate`<button type="button" class="thumb"${addAttribute(i === 0 ? "true" : "false", "aria-pressed")}${addAttribute(i, "data-thumb")} data-astro-cid-aqxoqqhg>${label}</button>`)} </div> </div> <form class="buy" method="post" action="/api/cart/lines" data-buy-form data-astro-cid-aqxoqqhg> <p class="subtitle" data-astro-cid-aqxoqqhg>${product.subtitle}</p> <p class="price tnum" data-astro-cid-aqxoqqhg>${priceLabel}</p> <p class="availability" data-availability data-astro-cid-aqxoqqhg> ${availability.state === "discontinued" && renderTemplate`<span class="chip chip--warn" data-astro-cid-aqxoqqhg>Discontinued</span>`} ${availability.state === "sold_out" && renderTemplate`<span class="chip chip--warn" data-astro-cid-aqxoqqhg>Sold out</span>`} ${availability.state === "low" && renderTemplate`<span class="chip chip--progress" data-astro-cid-aqxoqqhg>Only ${availability.count} left</span>`} ${availability.state === "available" && renderTemplate`<span class="chip chip--done" data-astro-cid-aqxoqqhg>Available</span>`} </p> ${product.variants.length > 1 && renderTemplate`<fieldset class="options" data-astro-cid-aqxoqqhg> <legend data-astro-cid-aqxoqqhg>${product.kind === "camera" ? "Colour" : "Option"}</legend> <div class="radios" role="radiogroup" aria-label="Option" data-astro-cid-aqxoqqhg> ${product.variants.map((v, i) => renderTemplate`<label${addAttribute(["radio", { "is-selected": v.sku === selected?.sku }], "class:list")} data-astro-cid-aqxoqqhg> <input type="radio" name="variant"${addAttribute(v.sku, "value")}${addAttribute(v.sku === selected?.sku, "checked")} data-variant-radio${addAttribute(v.available <= 0 ? "true" : "false", "data-out-of-stock")} data-astro-cid-aqxoqqhg> <span data-astro-cid-aqxoqqhg>${v.option_value}</span> ${v.available <= 0 && renderTemplate`<span class="radio__note" data-astro-cid-aqxoqqhg>Sold out</span>`} </label>`)} </div> </fieldset>`} <input type="hidden" name="sku"${addAttribute(selected?.sku, "value")} data-sku data-astro-cid-aqxoqqhg> <div class="qty" data-astro-cid-aqxoqqhg> <label for="quantity" data-astro-cid-aqxoqqhg>Quantity</label> <div class="stepper" data-qty-stepper data-astro-cid-aqxoqqhg> <button type="button" class="btn" aria-label="Decrease quantity" data-qty-decrease data-astro-cid-aqxoqqhg>−</button> <input id="quantity" name="quantity" type="number" min="1"${addAttribute(maxQty, "max")} value="1" data-qty-input data-astro-cid-aqxoqqhg> <button type="button" class="btn" aria-label="Increase quantity" data-qty-increase data-astro-cid-aqxoqqhg>+</button> </div> <p class="field-hint" data-astro-cid-aqxoqqhg>Up to ${maxQty}.</p> </div> ${availability.state === "discontinued" ? renderTemplate`<div class="notice notice--error" data-astro-cid-aqxoqqhg> <p data-astro-cid-aqxoqqhg>${availability.note}</p> <button class="btn" type="button" disabled aria-describedby="why-disabled" data-astro-cid-aqxoqqhg>Sold out</button> <p id="why-disabled" class="field-hint" data-astro-cid-aqxoqqhg>We no longer sell this product.</p> </div>` : availability.state === "sold_out" ? renderTemplate`<div class="notice notice--error" data-astro-cid-aqxoqqhg> <p data-astro-cid-aqxoqqhg>This option is sold out.</p> <button class="btn" type="button" disabled aria-describedby="why-empty" data-astro-cid-aqxoqqhg>Sold out</button> <p id="why-empty" class="field-hint" data-astro-cid-aqxoqqhg>Every one we made has gone. Try the other colours.</p> </div>` : renderTemplate`<button class="btn btn--primary" type="submit" data-add-to-cart data-astro-cid-aqxoqqhg>Add to cart</button>`} <p class="status" role="status" data-buy-status aria-live="polite" data-astro-cid-aqxoqqhg></p> </form> <div class="blocks" data-astro-cid-aqxoqqhg> ${product.blocks.map((b) => {
    const payload = b.payload;
    if (b.kind === "lede") return renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${payload.text}</p>`;
    if (b.kind === "spec_group") return renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>${payload.title}</h2> <table class="spec-table" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg>${payload.rows.map(([k, v]) => renderTemplate`<tr data-astro-cid-aqxoqqhg><th scope="row" data-astro-cid-aqxoqqhg>${k}</th><td class="tnum" data-astro-cid-aqxoqqhg>${v}</td></tr>`)}</tbody> </table> </section>`;
    if (b.kind === "in_the_box") return renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>In the box</h2> <ul data-astro-cid-aqxoqqhg>${payload.items.map((i) => renderTemplate`<li data-astro-cid-aqxoqqhg>${i}</li>`)}</ul> </section>`;
    if (b.kind === "compatibility") return renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Compatibility</h2> <dl data-astro-cid-aqxoqqhg> <dt data-astro-cid-aqxoqqhg>Minimum operating system</dt><dd class="mono" data-astro-cid-aqxoqqhg>${payload.min_os}</dd> <dt data-astro-cid-aqxoqqhg>Application</dt><dd class="mono" data-astro-cid-aqxoqqhg>${payload.min_app} or later</dd> ${firmware && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result3) => renderTemplate`<dt data-astro-cid-aqxoqqhg>Latest firmware</dt><dd class="mono" data-astro-cid-aqxoqqhg>${firmware.version}</dd>` })}`} </dl> </section>`;
    if (b.kind === "support_note") return renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Support</h2> <p data-astro-cid-aqxoqqhg>${payload.text}</p> </section>`;
    return null;
  })} </div> </div> ` })} ${renderScript($$result, "/app/src/pages/shop/[handle].astro?astro&type=script&index=0&lang.ts")} `;
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

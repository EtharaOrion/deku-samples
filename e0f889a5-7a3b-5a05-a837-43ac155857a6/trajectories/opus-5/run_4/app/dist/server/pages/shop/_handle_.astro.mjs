import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$ProductMedia } from '../../chunks/ProductMedia_D-pdKNOp.mjs';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { a as formatMinor, f as formatDate } from '../../chunks/format_y0Y9nLbA.mjs';
import { jsxs, jsx, Fragment } from 'preact/jsx-runtime';
import { h as getProductByHandle } from '../../chunks/server_SMyiD-DF.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

function BuyControls({
  product,
  initialSku
}) {
  const variants = product.variants;
  const [sku, setSku] = useState(() => {
    const found = variants.find((v) => v.sku === initialSku);
    return found ? found.sku : variants[0]?.sku;
  });
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState(null);
  const variant = useMemo(() => variants.find((v) => v.sku === sku) || variants[0], [sku, variants]);
  const discontinued = product.status === "discontinued";
  const available = Number(variant?.available || 0);
  const soldOut = available <= 0;
  const purchasable = !discontinued && !soldOut;
  const maxQty = Math.max(1, Math.min(10, available));
  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    if (variants.length > 1) {
      url.searchParams.set("variant", variant.sku);
    } else {
      url.searchParams.delete("variant");
    }
    window.history.replaceState({}, "", url);
  }, [variant?.sku]);
  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty]);
  async function addToCart() {
    if (!purchasable || state === "working") return;
    setState("working");
    setMessage(null);
    try {
      const res = await fetch("/api/cart/lines", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          sku: variant.sku,
          quantity
        })
      });
      const body = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(body.message || "That did not work.");
        return;
      }
      setState("done");
      setMessage("Added to your cart.");
      window.dispatchEvent(new CustomEvent("vela:cart-changed", {
        detail: body
      }));
    } catch {
      setState("error");
      setMessage("That did not work. Check your connection and try again.");
    }
  }
  if (!variant) return null;
  let availabilityLine = null;
  if (discontinued) availabilityLine = "Discontinued";
  else if (soldOut) availabilityLine = "Sold out";
  else if (available <= 10) availabilityLine = `Only ${available} left`;
  return jsxs("div", {
    class: "buy",
    children: [jsx("p", {
      class: "price money tnum",
      children: formatMinor(variant.price_minor, variant.currency)
    }), availabilityLine && jsx("p", {
      class: `availability${soldOut || discontinued ? " danger" : ""}`,
      children: availabilityLine
    }), variants.length > 1 && jsxs("fieldset", {
      class: "options",
      children: [jsx("legend", {
        children: "Colour"
      }), jsx("div", {
        class: "option-row",
        children: variants.map((v) => {
          const out = Number(v.available) <= 0;
          return jsxs("label", {
            class: `option${v.sku === variant.sku ? " selected" : ""}`,
            children: [jsx("input", {
              type: "radio",
              name: "variant",
              value: v.sku,
              checked: v.sku === variant.sku,
              onChange: () => setSku(v.sku)
            }), jsx("span", {
              children: v.option_value
            }), out && jsx("span", {
              class: "option-note",
              children: "Sold out"
            })]
          }, v.sku);
        })
      })]
    }), jsxs("div", {
      class: "qty",
      children: [jsx("span", {
        id: "qty-label",
        children: "Quantity"
      }), jsxs("div", {
        class: "stepper",
        role: "group",
        "aria-labelledby": "qty-label",
        children: [jsxs("button", {
          type: "button",
          class: "step",
          onClick: () => setQuantity((q) => Math.max(1, q - 1)),
          disabled: quantity <= 1 || !purchasable,
          children: [jsx("span", {
            "aria-hidden": "true",
            children: "−"
          }), jsx("span", {
            class: "visually-hidden",
            children: "One fewer"
          })]
        }), jsx("output", {
          class: "qty-value tnum",
          "aria-live": "polite",
          children: quantity
        }), jsxs("button", {
          type: "button",
          class: "step",
          onClick: () => setQuantity((q) => Math.min(maxQty, q + 1)),
          disabled: quantity >= maxQty || !purchasable,
          children: [jsx("span", {
            "aria-hidden": "true",
            children: "+"
          }), jsx("span", {
            class: "visually-hidden",
            children: "One more"
          })]
        })]
      })]
    }), jsx("button", {
      type: "button",
      class: "btn btn-primary buy-control",
      onClick: addToCart,
      disabled: !purchasable || state === "working",
      children: discontinued ? "Discontinued" : soldOut ? "Sold out" : state === "working" ? "Adding" : "Add to cart"
    }), !purchasable && jsx("p", {
      class: "hint",
      children: discontinued ? "We no longer sell this." : "We have none of this one left."
    }), jsx("p", {
      class: "live",
      role: "status",
      "aria-live": "polite",
      children: message && jsxs("span", {
        class: state === "error" ? "error-text" : void 0,
        children: [message, state === "done" && jsxs(Fragment, {
          children: [" ", jsx("a", {
            href: "/cart",
            children: "Go to your cart"
          })]
        })]
      })
    }), jsx("style", {
      children: `
        .buy { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .price { font-size: 24px; line-height: 30px; font-weight: 700; }
        .availability { font-size: 14px; color: var(--fg-muted); }
        .availability.danger { color: var(--danger); }

        .options { border: 0; padding: 0; margin: 0; }
        .options legend { font-weight: 700; font-size: 14px; padding: 0 0 calc(var(--space) * 2); }
        .option-row { display: flex; flex-wrap: wrap; gap: calc(var(--space) * 2); }
        .option {
          display: inline-flex; align-items: center; gap: calc(var(--space) * 2);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 2) calc(var(--space) * 3);
          cursor: pointer;
        }
        .option.selected { border-color: var(--fg); font-weight: 700; }
        .option-note { font-size: 12px; color: var(--fg-muted); }

        .qty { display: flex; align-items: center; gap: calc(var(--space) * 3); font-size: 14px; }
        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step {
          width: 36px; height: 36px; border: 0; background: transparent; cursor: pointer;
          transition: background-color var(--speed) var(--ease);
        }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 36px; text-align: center; font-variant-numeric: tabular-nums; }

        .buy-control { align-self: flex-start; min-width: 200px; }
        .live { min-height: 21px; font-size: 14px; }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const product = await getProductByHandle(handle);
  if (!product || product.kind === "protection") {
    return new Response(null, { status: 404 });
  }
  const requested = Astro2.url.searchParams.get("variant");
  const selected = product.variants.find((v) => v.sku === requested) || product.variants[0];
  const lede = product.blocks.find((b) => b.kind === "lede");
  const specs = product.blocks.filter((b) => b.kind === "spec_group");
  const box = product.blocks.find((b) => b.kind === "in_the_box");
  const compat = product.blocks.find((b) => b.kind === "compatibility");
  const supportNote = product.blocks.find((b) => b.kind === "support_note");
  const clientProduct = {
    handle: product.handle,
    title: product.title,
    status: product.status,
    variants: product.variants.map((v) => ({
      sku: v.sku,
      option_value: v.option_value,
      price_minor: Number(v.price_minor),
      currency: v.currency,
      available: Number(v.available)
    }))
  };
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${product.title} \u2014 Vela`, "description": product.subtitle, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<article class="product" data-astro-cid-aqxoqqhg> <div class="lead" data-astro-cid-aqxoqqhg> <!-- A keyboard navigable gallery on one side. --> <section class="gallery"${addAttribute(`${product.title} images`, "aria-label")} data-astro-cid-aqxoqqhg> <div class="gallery-main" data-astro-cid-aqxoqqhg> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": selected?.option_value, "ratio": "4 / 3", "data-astro-cid-aqxoqqhg": true })} </div> <ul class="thumbs" data-astro-cid-aqxoqqhg> ${product.variants.map((v, i) => renderTemplate`<li data-astro-cid-aqxoqqhg> <a${addAttribute(["thumb", { current: v.sku === selected?.sku }], "class:list")}${addAttribute(`/shop/${product.handle}?variant=${v.sku}`, "href")}${addAttribute(`${product.title} in ${v.option_value}`, "aria-label")}${addAttribute(v.sku === selected?.sku ? "true" : void 0, "aria-current")} data-astro-cid-aqxoqqhg> ${renderComponent($$result2, "ProductMedia", $$ProductMedia, { "handle": product.handle, "option": v.option_value, "ratio": "1 / 1", "data-astro-cid-aqxoqqhg": true })} </a> </li>`)} </ul> </section> <section class="buy-side" data-astro-cid-aqxoqqhg> <header class="stack stack-2" data-astro-cid-aqxoqqhg> <h1 data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="hint" data-astro-cid-aqxoqqhg>${product.subtitle}</p> </header> <!-- The island: options, quantity and the buy control. The price and
             the availability state are in the server-rendered markup above it
             too, so first paint is complete without scripting. --> <noscript> <p class="price money tnum" data-astro-cid-aqxoqqhg>${formatMinor(selected.price_minor)}</p>  <p class="hint" data-astro-cid-aqxoqqhg>${selected.availability.label}</p> </noscript> ${renderComponent($$result2, "BuyControls", BuyControls, { "client:load": true, "product": clientProduct, "initialSku": selected?.sku, "client:component-hydration": "load", "client:component-path": "/app/src/islands/BuyControls.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })}  ${supportNote && renderTemplate`<p class="notice support-note" data-astro-cid-aqxoqqhg>${supportNote.payload.text}</p>`} ${product.status === "discontinued" && !supportNote && product.support_until && renderTemplate`<p class="notice support-note" data-astro-cid-aqxoqqhg>
We no longer sell this. We will support it until ${formatDate(product.support_until)}.
</p>`} </section> </div> <!-- The typed blocks render as themselves. --> <div class="blocks" data-astro-cid-aqxoqqhg> ${lede && renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${lede.payload.text}</p>`} ${specs.length > 0 && renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Specifications</h2> ${specs.map((group) => renderTemplate`<table class="table spec" data-astro-cid-aqxoqqhg> <caption data-astro-cid-aqxoqqhg>${group.payload.title}</caption> <tbody data-astro-cid-aqxoqqhg> ${group.payload.rows.map(([label, value]) => renderTemplate`<tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>${label}</th> <td class="num" data-astro-cid-aqxoqqhg>${value}</td> </tr>`)} </tbody> </table>`)} </section>`} ${box && renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>In the box</h2> <ul class="plain-list" data-astro-cid-aqxoqqhg> ${box.payload.items.map((item) => renderTemplate`<li data-astro-cid-aqxoqqhg>${item}</li>`)} </ul> </section>`} ${compat && renderTemplate`<section class="block" data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Compatibility</h2> <table class="table" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> <tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>Minimum operating system</th> <td data-astro-cid-aqxoqqhg>${compat.payload.min_os}</td> </tr> <tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>Minimum application version</th> <td class="ident" data-astro-cid-aqxoqqhg>${compat.payload.min_app}</td> </tr> </tbody> </table> </section>`} </div> </article> ` })} `;
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

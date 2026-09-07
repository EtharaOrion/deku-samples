import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { b as formatMoney } from '../../chunks/app_BbZzWQ31.mjs';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { p as pageCustomer, a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

function BuyBox({
  product,
  initialSku
}) {
  const variants = product.variants || [];
  const [sku, setSku] = useState(() => {
    const found = variants.find((v) => v.sku === initialSku);
    return (found ?? variants[0])?.sku ?? "";
  });
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState(null);
  const variant = useMemo(() => variants.find((v) => v.sku === sku) ?? variants[0], [sku, variants]);
  const discontinued = product.status === "discontinued";
  const available = variant?.available ?? 0;
  const soldOut = available <= 0;
  const buyable = !discontinued && !soldOut;
  const maxQty = Math.max(1, Math.min(10, available));
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty]);
  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant.sku);
    window.history.replaceState({}, "", url);
  }, [variant?.sku]);
  async function addToCart() {
    if (!buyable || state === "working") return;
    setState("working");
    setMessage(null);
    try {
      const res = await fetch("/api/cart/lines", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sku: variant.sku,
          quantity
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("idle");
        setMessage({
          tone: "error",
          text: body?.message || "That did not work."
        });
        return;
      }
      setState("done");
      setMessage({
        tone: "done",
        text: "Added to your cart."
      });
      window.dispatchEvent(new CustomEvent("vela:cart", {
        detail: body.cart
      }));
      setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("idle");
      setMessage({
        tone: "error",
        text: "That did not work."
      });
    }
  }
  let availabilityLine = null;
  if (discontinued) availabilityLine = null;
  else if (soldOut) availabilityLine = null;
  else if (available <= 10) availabilityLine = `Only ${available} left`;
  return jsxs("div", {
    class: "buybox",
    children: [jsx("p", {
      class: "buybox__price money strong",
      children: formatMoney(variant?.price_minor ?? 0)
    }), variants.length > 1 && // One radio group per option rather than a select when there are five
    // or fewer choices.
    jsxs("fieldset", {
      class: "buybox__options",
      children: [jsx("legend", {
        class: "field__label",
        children: "Colour"
      }), variants.map((v) => jsxs("label", {
        class: "option",
        children: [jsx("input", {
          type: "radio",
          name: "variant",
          value: v.sku,
          checked: v.sku === sku,
          onChange: () => setSku(v.sku)
        }), jsx("span", {
          children: v.option_value
        }), v.available <= 0 && jsx("span", {
          class: "chip chip--neutral",
          children: "Sold out"
        })]
      }, v.sku))]
    }), jsxs("div", {
      class: "buybox__qty",
      children: [jsx("label", {
        class: "field__label",
        for: "qty",
        children: "Quantity"
      }), jsxs("div", {
        class: "stepper",
        children: [jsx("button", {
          type: "button",
          class: "btn btn--secondary btn--small",
          onClick: () => setQuantity((q) => Math.max(1, q - 1)),
          disabled: quantity <= 1 || !buyable,
          "aria-label": "One fewer",
          children: jsx("span", {
            "aria-hidden": "true",
            children: "−"
          })
        }), jsx("input", {
          id: "qty",
          class: "input stepper__input num",
          type: "number",
          min: "1",
          max: maxQty,
          value: quantity,
          disabled: !buyable,
          onInput: (e) => {
            const n = parseInt(e.currentTarget.value, 10);
            setQuantity(Number.isNaN(n) ? 1 : Math.min(Math.max(1, n), maxQty));
          }
        }), jsx("button", {
          type: "button",
          class: "btn btn--secondary btn--small",
          onClick: () => setQuantity((q) => Math.min(maxQty, q + 1)),
          disabled: quantity >= maxQty || !buyable,
          "aria-label": "One more",
          children: jsx("span", {
            "aria-hidden": "true",
            children: "+"
          })
        })]
      })]
    }), availabilityLine && jsx("p", {
      class: "buybox__avail small",
      children: availabilityLine
    }), jsx("button", {
      type: "button",
      class: "btn buybox__buy",
      onClick: addToCart,
      disabled: !buyable,
      "aria-describedby": !buyable ? "buy-reason" : void 0,
      children: discontinued ? "We no longer sell this" : soldOut ? "Sold out" : state === "working" ? "Adding" : "Add to cart"
    }), !buyable && jsx("p", {
      id: "buy-reason",
      class: "small muted buybox__reason",
      children: discontinued ? "This product is discontinued." : "This option is sold out. Choose another colour if one is available."
    }), jsx("p", {
      class: "live-region small",
      role: "status",
      "aria-live": "polite",
      children: message ? message.text : ""
    }), jsx("style", {
      children: `
        .buybox__price { font-size: 24px; line-height: 30px; margin: 0 0 calc(var(--unit) * 4); }
        .buybox__options { border: 0; padding: 0; margin: 0 0 calc(var(--unit) * 4); }
        .option {
          display: flex; align-items: center; gap: calc(var(--unit) * 2);
          padding: calc(var(--unit) * 2) calc(var(--unit) * 3);
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          margin-bottom: calc(var(--unit) * 2);
          cursor: pointer;
          transition: border-color var(--speed) var(--ease);
        }
        .option:has(input:checked) { border-color: var(--fg); border-width: 2px; }
        .buybox__qty { margin-bottom: calc(var(--unit) * 4); }
        .stepper { display: flex; align-items: center; gap: calc(var(--unit) * 2); }
        .stepper__input { width: 5rem; text-align: center; }
        .buybox__avail { margin: 0 0 calc(var(--unit) * 3); color: var(--progress); }
        .buybox__buy { width: 100%; }
        .buybox__reason { margin-top: calc(var(--unit) * 2); }
        .live-region { min-height: 21px; margin: calc(var(--unit) * 2) 0 0; }
      `
    })]
  });
}

function Gallery({
  handle,
  title
}) {
  const views = [{
    key: "front",
    label: "Front"
  }, {
    key: "top",
    label: "Top"
  }, {
    key: "back",
    label: "Back"
  }];
  const [index, setIndex] = useState(0);
  function onKeyDown(ev) {
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      setIndex((i) => (i + 1) % views.length);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      setIndex((i) => (i - 1 + views.length) % views.length);
    }
  }
  return jsxs("div", {
    class: "gallery",
    children: [jsx("div", {
      class: "gallery__frame",
      role: "group",
      "aria-label": `${title}, view ${views[index].label}`,
      tabIndex: 0,
      onKeyDown,
      children: jsx("img", {
        src: `/media/products/${handle}.svg`,
        alt: `${title}, ${views[index].label.toLowerCase()} view`,
        width: "480",
        height: "400",
        style: {
          transform: `rotate(${index * 0}deg)`
        }
      })
    }), jsx("div", {
      class: "gallery__thumbs",
      role: "tablist",
      "aria-label": "Views",
      children: views.map((view, i) => jsx("button", {
        type: "button",
        role: "tab",
        "aria-selected": i === index ? "true" : "false",
        class: `gallery__thumb ${i === index ? "is-current" : ""}`,
        onClick: () => setIndex(i),
        children: view.label
      }, view.key))
    }), jsx("style", {
      children: `
        .gallery__frame {
          border: var(--border-w) solid var(--line);
          background: var(--surface-sunken);
          border-radius: 0;
          overflow: hidden;
        }
        .gallery__frame img { width: 100%; height: auto; display: block; }
        .gallery__thumbs { display: flex; gap: calc(var(--unit) * 2); margin-top: calc(var(--unit) * 3); }
        .gallery__thumb {
          padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          background: var(--surface);
          cursor: pointer;
          font-size: 14px;
          transition: background var(--speed) var(--ease);
        }
        .gallery__thumb.is-current { font-weight: 700; border-color: var(--fg); }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const wanted = Astro2.url.searchParams.get("variant");
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  const { ok, status, body } = await apiGet(
    `/api/products/${encodeURIComponent(handle)}`,
    Astro2
  );
  if (!ok) {
    return new Response(null, { status: 404 });
  }
  const product = body.product;
  const selected = product.variants.find((v) => v.sku === wanted) ?? product.variants[0];
  const blocks = product.blocks || [];
  const lede = blocks.find((b) => b.kind === "lede");
  const specGroups = blocks.filter((b) => b.kind === "spec_group");
  const inTheBox = blocks.find((b) => b.kind === "in_the_box");
  const compatibility = blocks.find((b) => b.kind === "compatibility");
  const supportNote = blocks.find((b) => b.kind === "support_note");
  product.variants.reduce((n, v) => n + v.available, 0);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${product.title} \u2014 Vela`, "description": product.subtitle, "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs small" aria-label="Breadcrumb" data-astro-cid-aqxoqqhg> <a href="/shop" data-astro-cid-aqxoqqhg>Shop</a> <span aria-hidden="true" data-astro-cid-aqxoqqhg>/</span> <span aria-current="page" data-astro-cid-aqxoqqhg>${product.title}</span> </nav> <div class="product" data-astro-cid-aqxoqqhg> <div class="product__media" data-astro-cid-aqxoqqhg> ${renderComponent($$result2, "Gallery", Gallery, { "client:visible": true, "handle": product.handle, "title": product.title, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/Gallery.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })} </div> <div class="product__buy" data-astro-cid-aqxoqqhg> <h1 class="page-title" data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="page-sub" data-astro-cid-aqxoqqhg>${product.subtitle}</p> ${product.status === "discontinued" && renderTemplate`<p class="chip chip--neutral product__state" data-astro-cid-aqxoqqhg>Discontinued</p>`} ${renderComponent($$result2, "BuyBox", BuyBox, { "client:load": true, "product": product, "initialSku": selected?.sku, "client:component-hydration": "load", "client:component-path": "/app/src/islands/BuyBox.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })} ${/* The discontinued state is a first class state rather than an
  afterthought. */
  supportNote && renderTemplate`<p class="notice notice--warn product__support" data-astro-cid-aqxoqqhg> <span class="notice__body" data-astro-cid-aqxoqqhg>${supportNote.payload.text}</span> </p>`} </div> </div> <div class="product__detail stack" data-astro-cid-aqxoqqhg> ${lede && renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${lede.payload.text}</p>`} ${specGroups.map((group) => renderTemplate`<section data-astro-cid-aqxoqqhg> <h2 class="section-title" data-astro-cid-aqxoqqhg>${group.payload.title}</h2> <table class="table" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${group.payload.rows.map(([label, value]) => renderTemplate`<tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>${label}</th> <td class="num right" data-astro-cid-aqxoqqhg>${value}</td> </tr>`)} </tbody> </table> </section>`)} ${inTheBox && renderTemplate`<section data-astro-cid-aqxoqqhg> <h2 class="section-title" data-astro-cid-aqxoqqhg>In the box</h2> <ul class="box-list" data-astro-cid-aqxoqqhg> ${inTheBox.payload.items.map((item) => renderTemplate`<li data-astro-cid-aqxoqqhg>${item}</li>`)} </ul> </section>`} ${compatibility && renderTemplate`<section data-astro-cid-aqxoqqhg> <h2 class="section-title" data-astro-cid-aqxoqqhg>Compatibility</h2> <p class="muted" data-astro-cid-aqxoqqhg>${compatibility.payload.text}</p> <table class="table" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> <tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>Minimum operating system</th> <td class="right" data-astro-cid-aqxoqqhg>${compatibility.payload.min_os}</td> </tr> <tr data-astro-cid-aqxoqqhg> <th scope="row" data-astro-cid-aqxoqqhg>Minimum application</th> <td class="right" data-astro-cid-aqxoqqhg>${compatibility.payload.min_app}</td> </tr> </tbody> </table> </section>`} </div> ` })} `;
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

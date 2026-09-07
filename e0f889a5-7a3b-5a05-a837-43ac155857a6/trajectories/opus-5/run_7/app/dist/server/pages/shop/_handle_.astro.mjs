import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { f as formatMinor, a as api, p as publishCartCount, b as announce, v as viewer, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { a as apiGet, m as mediaFor, f as formatDate } from '../../chunks/api_D4zreuKm.mjs';
/* empty css                                       */
export { renderers } from '../../renderers.mjs';

function BuyBox({
  product,
  initialSku
}) {
  const variants = product.variants || [];
  const [sku, setSku] = useState(initialSku || variants[0]?.sku);
  const [qty, setQty] = useState(1);
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const variant = variants.find((v) => v.sku === sku) || variants[0];
  const discontinued = product.status === "discontinued";
  const available = variant?.available ?? 0;
  const soldOut = !discontinued && available <= 0;
  const maxQty = Math.max(1, Math.min(10, available));
  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant.sku);
    window.history.replaceState({}, "", url);
  }, [sku]);
  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [maxQty]);
  const add = async () => {
    if (discontinued || soldOut) return;
    setState("adding");
    setError(null);
    try {
      const d = await api("/cart/lines", {
        method: "POST",
        body: {
          sku: variant.sku,
          quantity: qty
        }
      });
      publishCartCount(d.cart.item_count);
      setState("added");
      announce(`${product.title} added to your cart.`);
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setState("idle");
      setError(err.message);
      announce(err.message);
    }
  };
  let availability;
  if (discontinued) availability = {
    text: "Discontinued",
    tone: "chip"
  };
  else if (soldOut) availability = {
    text: "Sold out",
    tone: "chip chip-danger"
  };
  else if (available <= 10) availability = {
    text: `Only ${available} left`,
    tone: "chip"
  };
  else availability = {
    text: "Available",
    tone: "chip"
  };
  let buyLabel = "Add to cart";
  let reason = null;
  if (discontinued) {
    buyLabel = "No longer sold";
    reason = "We no longer sell this.";
  } else if (soldOut) {
    buyLabel = "Sold out";
    reason = "This option is sold out.";
  } else if (state === "adding") buyLabel = "Adding";
  else if (state === "added") buyLabel = "Added to cart";
  return jsxs("div", {
    children: [jsx("p", {
      class: "money",
      style: "font-size:24px;font-weight:700;margin-bottom:calc(var(--unit) * 2)",
      children: formatMinor(variant?.price_minor ?? product.price_minor)
    }), jsx("p", {
      style: "margin-bottom:calc(var(--unit) * 4)",
      children: jsx("span", {
        class: availability.tone,
        children: availability.text
      })
    }), variants.length > 1 && variants.length <= 5 && jsxs("fieldset", {
      style: "border:0;padding:0;margin:0 0 calc(var(--unit) * 5)",
      children: [jsx("legend", {
        class: "label",
        style: "font-weight:700;font-size:14px;padding:0;margin-bottom:calc(var(--unit)*2)",
        children: "Finish"
      }), jsx("div", {
        class: "row",
        style: "gap:calc(var(--unit) * 2)",
        children: variants.map((v) => {
          const out = product.status !== "discontinued" && v.available <= 0;
          return jsxs("label", {
            class: "card",
            style: `padding:calc(var(--unit)*2) calc(var(--unit)*3);cursor:pointer;box-shadow:none;${v.sku === sku ? "border-color:var(--fg);border-width:2px" : ""}`,
            children: [jsx("input", {
              type: "radio",
              name: "variant",
              value: v.sku,
              checked: v.sku === sku,
              onChange: () => setSku(v.sku),
              style: "margin-inline-end:calc(var(--unit)*2)"
            }), jsx("span", {
              style: v.sku === sku ? "font-weight:700" : "",
              children: v.option_value
            }), out && jsx("span", {
              class: "small muted",
              children: " — sold out"
            })]
          }, v.sku);
        })
      })]
    }), variants.length > 5 && jsxs("label", {
      class: "field",
      children: [jsx("span", {
        class: "label",
        children: "Finish"
      }), jsx("select", {
        class: "input",
        value: sku,
        onChange: (e) => setSku(e.currentTarget.value),
        children: variants.map((v) => jsx("option", {
          value: v.sku,
          children: v.option_value
        }, v.sku))
      })]
    }), !discontinued && !soldOut && jsxs("div", {
      class: "field",
      children: [jsx("span", {
        class: "label",
        id: "qty-label",
        children: "Quantity"
      }), jsxs("div", {
        class: "row",
        style: "gap:calc(var(--unit) * 2)",
        children: [jsx("button", {
          type: "button",
          class: "btn btn-secondary btn-sm",
          onClick: () => setQty((q) => Math.max(1, q - 1)),
          disabled: qty <= 1,
          "aria-label": "One fewer",
          children: "−"
        }), jsx("output", {
          class: "tnum",
          "aria-live": "polite",
          style: "min-width:3ch;text-align:center;font-weight:700",
          children: qty
        }), jsx("button", {
          type: "button",
          class: "btn btn-secondary btn-sm",
          onClick: () => setQty((q) => Math.min(maxQty, q + 1)),
          disabled: qty >= maxQty,
          "aria-label": "One more",
          children: "+"
        }), jsx("span", {
          class: "small muted",
          children: maxQty === 10 ? "Up to 10 per order" : `Up to ${maxQty} available`
        })]
      })]
    }), jsx("button", {
      type: "button",
      class: "btn",
      onClick: add,
      disabled: discontinued || soldOut || state === "adding",
      "aria-describedby": reason ? "buy-reason" : void 0,
      style: "width:100%",
      children: buyLabel
    }), reason && jsx("p", {
      class: "small muted",
      id: "buy-reason",
      style: "margin-top:calc(var(--unit)*2)",
      children: reason
    }), state === "added" && jsxs("p", {
      class: "small",
      style: "margin-top:calc(var(--unit)*2);color:var(--done)",
      children: ["Added to your cart. ", jsx("a", {
        href: "/cart",
        children: "Go to the cart"
      }), "."]
    }), error && jsx("p", {
      class: "field-error",
      role: "alert",
      style: "margin-top:calc(var(--unit)*2)",
      children: error
    })]
  });
}

function Gallery({
  images = [],
  title = ""
}) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const current = images[Math.min(index, images.length - 1)];
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setIndex((i) => (i + 1) % images.length);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setIndex((i) => (i - 1 + images.length) % images.length);
    }
  };
  return jsxs("div", {
    children: [jsx("div", {
      role: "group",
      "aria-label": `${title} images`,
      tabIndex: 0,
      onKeyDown,
      style: "border-radius:0",
      children: jsx("img", {
        class: "media",
        src: current.src,
        alt: current.alt,
        width: "800",
        height: "600"
      })
    }), images.length > 1 && jsx("div", {
      class: "row",
      role: "tablist",
      "aria-label": "Choose an image",
      style: "margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*2)",
      children: images.map((img, i) => jsx("button", {
        type: "button",
        role: "tab",
        "aria-selected": i === index,
        "aria-label": img.alt,
        onClick: () => setIndex(i),
        style: `padding:0;border:${i === index ? "2px" : "1px"} solid ${i === index ? "var(--fg)" : "var(--line-strong)"};background:none;cursor:pointer;border-radius:var(--radius);overflow:hidden;line-height:0`,
        children: jsx("img", {
          src: img.src,
          alt: "",
          width: "72",
          height: "54",
          style: "display:block;width:72px;height:54px;object-fit:cover"
        })
      }, img.src))
    }), jsxs("p", {
      class: "small muted",
      style: "margin-top:calc(var(--unit)*2)",
      children: ["Image ", Math.min(index, images.length - 1) + 1, " of ", images.length, ". Use the left and right arrow keys."]
    })]
  });
}

const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const v = await viewer(Astro2);
  const res = await apiGet(Astro2.request, `/products/${encodeURIComponent(handle)}`);
  if (res.status === 404) {
    return new Response(null, { status: 302, headers: { location: "/shop" } });
  }
  const product = res.data;
  const asked = Astro2.url.searchParams.get("variant");
  const selected = product.variants.find((x) => x.sku === asked) || product.variants[0];
  const blocks = product.blocks || [];
  const lede = blocks.find((b) => b.kind === "lede");
  const specGroups = blocks.filter((b) => b.kind === "spec_group");
  const inTheBox = blocks.find((b) => b.kind === "in_the_box");
  const compatibility = blocks.find((b) => b.kind === "compatibility");
  const supportNote = blocks.find((b) => b.kind === "support_note");
  const images = product.variants.map((x) => ({
    src: mediaFor(product.handle, x.sku),
    alt: `${product.title}, ${x.option_value}`
  }));
  const uniqueImages = images.filter((img, i) => images.findIndex((o) => o.src === img.src) === i);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${product.title} \u2014 Vela`, "description": product.subtitle, "signedIn": v.signedIn, "cartCount": v.cartCount, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav aria-label="Breadcrumb" class="small muted" style="margin-bottom:calc(var(--unit)*4)" data-astro-cid-aqxoqqhg> <a href="/shop" data-astro-cid-aqxoqqhg>Shop</a> <span aria-hidden="true" data-astro-cid-aqxoqqhg>/</span> <span data-astro-cid-aqxoqqhg>${product.title}</span> </nav> <div class="product-layout" data-astro-cid-aqxoqqhg> <!-- A keyboard navigable gallery on one side. --> <div data-astro-cid-aqxoqqhg> ${renderComponent($$result2, "Gallery", Gallery, { "client:visible": true, "images": uniqueImages, "title": product.title, "client:component-hydration": "visible", "client:component-path": "/app/src/islands/Gallery.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })} <noscript> <img class="media"${addAttribute(uniqueImages[0]?.src, "src")}${addAttribute(uniqueImages[0]?.alt, "alt")} width="800" height="600" data-astro-cid-aqxoqqhg> </noscript> </div> <!-- The title, the subtitle, the price, the availability, the options and one buy control. --> <div data-astro-cid-aqxoqqhg> <h1 class="page-title" style="margin-bottom:var(--unit)" data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="muted" style="margin-bottom:calc(var(--unit)*5)" data-astro-cid-aqxoqqhg>${product.subtitle}</p> ${supportNote && renderTemplate`<div class="notice" style="margin-bottom:calc(var(--unit)*5)" data-astro-cid-aqxoqqhg> <p data-astro-cid-aqxoqqhg>${supportNote.payload.text}</p> </div>`} ${renderComponent($$result2, "BuyBox", BuyBox, { "client:load": true, "product": product, "initialSku": selected?.sku, "client:component-hydration": "load", "client:component-path": "/app/src/islands/BuyBox.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })} <noscript> <p class="small muted" style="margin-top:calc(var(--unit)*3)" data-astro-cid-aqxoqqhg>
The buy control needs scripting. The price is shown above and the catalogue is readable without it.
</p> </noscript> </div> </div>  ${lede && renderTemplate`<section class="section" style="margin-top:calc(var(--unit)*12)" data-astro-cid-aqxoqqhg> <p style="max-width:70ch;font-size:18px;line-height:28px" data-astro-cid-aqxoqqhg>${lede.payload.text}</p> </section>`}${specGroups.length > 0 && renderTemplate`<section class="section" aria-labelledby="specs-h" data-astro-cid-aqxoqqhg> <h2 class="section-title" id="specs-h" data-astro-cid-aqxoqqhg>Specifications</h2> <div class="grid-2" data-astro-cid-aqxoqqhg> ${specGroups.map((g) => renderTemplate`<div data-astro-cid-aqxoqqhg> <h3 style="font-size:14px;line-height:21px;margin-bottom:calc(var(--unit)*2)" data-astro-cid-aqxoqqhg>${g.payload.title}</h3> <table class="data" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${g.payload.rows.map((row) => renderTemplate`<tr data-astro-cid-aqxoqqhg> <th scope="row" style="font-weight:400;color:var(--fg-muted)" data-astro-cid-aqxoqqhg>${row[0]}</th> <td class="num tnum" data-astro-cid-aqxoqqhg>${row[1]}</td> </tr>`)} </tbody> </table> </div>`)} </div> </section>`}${inTheBox && renderTemplate`<section class="section" aria-labelledby="box-h" data-astro-cid-aqxoqqhg> <h2 class="section-title" id="box-h" data-astro-cid-aqxoqqhg>In the box</h2> <ul style="padding-inline-start:calc(var(--unit)*5);max-width:60ch" data-astro-cid-aqxoqqhg> ${inTheBox.payload.items.map((i) => renderTemplate`<li style="margin-bottom:var(--unit)" data-astro-cid-aqxoqqhg>${i}</li>`)} </ul> </section>`}${compatibility && renderTemplate`<section class="section" aria-labelledby="compat-h" data-astro-cid-aqxoqqhg> <h2 class="section-title" id="compat-h" data-astro-cid-aqxoqqhg>Compatibility</h2> <table class="data" style="max-width:52rem" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> <tr data-astro-cid-aqxoqqhg> <th scope="row" style="font-weight:400;color:var(--fg-muted)" data-astro-cid-aqxoqqhg>Minimum operating system</th> <td data-astro-cid-aqxoqqhg>${compatibility.payload.min_os}</td> </tr> <tr data-astro-cid-aqxoqqhg> <th scope="row" style="font-weight:400;color:var(--fg-muted)" data-astro-cid-aqxoqqhg>Minimum application version</th> <td class="version" data-astro-cid-aqxoqqhg>${compatibility.payload.min_app}</td> </tr> </tbody> </table> <p class="small muted" style="margin-top:calc(var(--unit)*3);max-width:66ch" data-astro-cid-aqxoqqhg>${compatibility.payload.text}</p> </section>`}${product.support_until && renderTemplate`<section class="section" data-astro-cid-aqxoqqhg> <p class="small muted" data-astro-cid-aqxoqqhg>
We will support this product until ${formatDate(product.support_until)}.
</p> </section>`}` })} `;
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

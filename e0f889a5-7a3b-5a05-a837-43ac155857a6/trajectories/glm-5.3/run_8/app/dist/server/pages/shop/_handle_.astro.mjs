import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead, a as addAttribute } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { one, q } from "../../chunks/index_CC0DBeZe.mjs";
import { useState, useEffect } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
/* empty css                                       */
import { renderers } from "../../renderers.mjs";
function BuyBox({
  handle,
  title,
  variants = [],
  selectedSku = "",
  state = "available",
  badVariant = false
}) {
  const [sku, setSku] = useState(selectedSku || (variants[0] ? variants[0].sku : ""));
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const variant = variants.find((v) => v.sku === sku) || variants[0] || null;
  const maxQty = variant ? Math.min(10, variant.inventory_policy === "deny" ? variant.available : 10) : 1;
  const soldOut = !variant || variant.inventory_policy === "deny" && variant.available <= 0;
  const disabled = state === "discontinued" || soldOut || busy;
  const why = state === "discontinued" ? "We no longer sell this." : soldOut ? "Sold out." : busy ? "Adding" : "";
  useEffect(() => {
    if (badVariant) {
      const url = new URL(window.location.href);
      url.searchParams.delete("variant");
      window.history.replaceState({}, "", url);
    }
  }, [badVariant]);
  const choose = (v) => {
    setSku(v.sku);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", v.sku);
    window.history.replaceState({}, "", url);
  };
  const add = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/cart/lines", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sku,
          quantity: qty
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      setMsg(`${title} is in your cart.`);
      window.dispatchEvent(new CustomEvent("vela-cart"));
      window.dispatchEvent(new MessageEvent("message", {
        data: "vela:cart"
      }));
    } catch {
      setErr("That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return jsxs("div", {
    class: "buybox",
    children: [jsxs("fieldset", {
      children: [jsx("legend", {
        children: "Option"
      }), jsx("div", {
        class: "options",
        role: "radiogroup",
        "aria-label": "Option",
        children: variants.map((v) => jsxs("label", {
          class: `option${v.sku === sku ? " chosen" : ""}`,
          children: [jsx("input", {
            type: "radio",
            name: "variant",
            value: v.sku,
            checked: v.sku === sku,
            onChange: () => choose(v),
            disabled: state === "discontinued"
          }), jsx("span", {
            children: v.option_value
          }), jsx("span", {
            class: "tnum price-inline",
            children: fmt(v.price_minor)
          }), v.inventory_policy === "deny" && v.available <= 0 ? jsx("span", {
            class: "muted small",
            children: "Sold out"
          }) : null, v.inventory_policy === "deny" && v.available > 0 && v.available <= 10 ? jsxs("span", {
            class: "muted small tnum",
            children: ["Only ", v.available, " left"]
          }) : null]
        }))
      })]
    }), jsxs("div", {
      class: "qty",
      children: [jsx("label", {
        for: "qty",
        children: "Quantity"
      }), jsxs("div", {
        class: "stepper",
        children: [jsx("button", {
          type: "button",
          class: "btn",
          "aria-label": "Decrease quantity",
          onClick: () => setQty((q2) => Math.max(1, q2 - 1)),
          disabled: qty <= 1,
          children: "−"
        }), jsx("input", {
          id: "qty",
          class: "tnum",
          type: "text",
          inputmode: "numeric",
          value: qty,
          "aria-live": "polite",
          onChange: (e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            setQty(Number.isFinite(n) ? Math.max(1, Math.min(maxQty, n)) : 1);
          }
        }), jsx("button", {
          type: "button",
          class: "btn",
          "aria-label": "Increase quantity",
          onClick: () => setQty((q2) => Math.min(maxQty, q2 + 1)),
          disabled: qty >= maxQty,
          children: "+"
        })]
      }), jsxs("span", {
        class: "muted small",
        children: ["Up to ", maxQty]
      })]
    }), jsxs("div", {
      class: "buy",
      children: [jsx("button", {
        type: "button",
        class: "btn btn-primary",
        onClick: add,
        disabled,
        children: state === "discontinued" ? "Discontinued" : soldOut ? "Sold out" : busy ? "Adding" : "Add to cart"
      }), why ? jsx("span", {
        class: "muted small",
        children: why
      }) : null]
    }), err ? jsx("p", {
      class: "error-text",
      role: "alert",
      children: err
    }) : null, msg ? jsxs("p", {
      class: "ok-text",
      role: "status",
      children: [msg, " ", jsx("a", {
        href: "/cart",
        children: "View cart"
      })]
    }) : null]
  });
}
function fmt(minor) {
  const abs = Math.abs(minor);
  return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
const $$Astro = createAstro();
const $$handle = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$handle;
  const { handle } = Astro2.params;
  const product = await one(
    `SELECT * FROM product WHERE handle = $1 AND kind <> 'protection'`,
    [handle]
  );
  if (!product) return Astro2.redirect("/404");
  const variants = await q(
    `SELECT v.id, v.sku, v.title, v.option_value, v.price_minor, v.inventory_policy,
          COALESCE(il.available, 0) AS available, COALESCE(il.committed, 0) AS committed
   FROM variant v LEFT JOIN inventory_level il ON il.variant_id = v.id
   WHERE v.product_id = $1 ORDER BY v.position, v.id`,
    [product.id]
  );
  const blocks = await q("SELECT kind, payload FROM product_block WHERE product_id = $1 ORDER BY position", [product.id]);
  const url = Astro2.url;
  let selected = variants.find((v) => v.sku === url.searchParams.get("variant")) || variants[0] || null;
  const badVariant = url.searchParams.get("variant") && !variants.some((v) => v.sku === url.searchParams.get("variant"));
  const supportNote = blocks.find((b) => b.kind === "support_note")?.payload?.text || (product.support_until ? `We no longer sell this. We will support it until ${new Date(product.support_until).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` : "");
  const state = (() => {
    if (product.status === "discontinued") return "discontinued";
    if (!selected) return "sold_out";
    if (selected.inventory_policy === "deny" && selected.available < 1) return "sold_out";
    return "available";
  })();
  const onlyLeft = state === "available" && selected && selected.available < 11 ? selected.available : null;
  const gallery = [0, 1, 2].map((i) => ({ i, label: i === 0 ? "Front" : i === 1 ? "Back" : "Top" }));
  const fmt2 = (m) => {
    const abs = Math.abs(m);
    return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  };
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": product.title, "data-astro-cid-aqxoqqhg": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-aqxoqqhg><a href="/shop" data-astro-cid-aqxoqqhg>Shop</a> / <span data-astro-cid-aqxoqqhg>${product.title}</span></nav> <div class="product" data-astro-cid-aqxoqqhg> <section class="gallery" aria-label="Product views" data-astro-cid-aqxoqqhg> ${gallery.map((g, idx) => renderTemplate`<div${addAttribute(["shot", { active: idx === 0 }], "class:list")}${addAttribute(g.i, "data-shot")}${addAttribute(idx === 0 ? "0" : "-1", "tabindex")} role="group"${addAttribute(`View: ${g.label}`, "aria-label")} data-astro-cid-aqxoqqhg></div>`)} </section> <section class="detail" data-astro-cid-aqxoqqhg> <h1 data-astro-cid-aqxoqqhg>${product.title}</h1> <p class="muted" data-astro-cid-aqxoqqhg>${product.subtitle}</p> <p class="price tnum" data-astro-cid-aqxoqqhg>${selected ? fmt2(selected.price_minor) : ""}</p> ${onlyLeft ? renderTemplate`<p class="muted" data-astro-cid-aqxoqqhg>Only ${onlyLeft} left</p>` : null} ${state === "sold_out" ? renderTemplate`<p data-astro-cid-aqxoqqhg><span class="chip chip-err" data-astro-cid-aqxoqqhg>Sold out</span></p>` : null} ${state === "discontinued" ? renderTemplate`<p class="notice" data-astro-cid-aqxoqqhg>${supportNote}</p>` : null} ${state === "sold_out" ? renderTemplate`<p class="muted small" data-astro-cid-aqxoqqhg>Sold out means the button is off until stock returns.</p>` : null} ${renderComponent($$result2, "BuyBox", BuyBox, { "client:load": true, "handle": product.handle, "title": product.title, "variants": variants.map((v) => ({ sku: v.sku, title: v.title, option_value: v.option_value, price_minor: v.price_minor, available: v.available, inventory_policy: v.inventory_policy })), "selectedSku": selected?.sku ?? "", "state": state, "badVariant": !!badVariant, "client:component-hydration": "load", "client:component-path": "@components/BuyBox.jsx", "client:component-export": "default", "data-astro-cid-aqxoqqhg": true })} <div class="blocks" data-astro-cid-aqxoqqhg> ${blocks.filter((b) => b.kind === "lede").map((b) => renderTemplate`<p class="lede" data-astro-cid-aqxoqqhg>${b.payload.text}</p>`)} ${blocks.filter((b) => b.kind === "spec_group").map((b) => renderTemplate`<div data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>${b.payload.title}</h2> <table class="spec" data-astro-cid-aqxoqqhg> <tbody data-astro-cid-aqxoqqhg> ${b.payload.rows.map(([k, v]) => renderTemplate`<tr data-astro-cid-aqxoqqhg><th scope="row" data-astro-cid-aqxoqqhg>${k}</th><td${addAttribute(/\d/.test(v) ? "num mono" : "", "class")} data-astro-cid-aqxoqqhg>${v}</td></tr>`)} </tbody> </table> </div>`)} ${blocks.filter((b) => b.kind === "in_the_box").map((b) => renderTemplate`<div data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>In the box</h2> <ul data-astro-cid-aqxoqqhg>${b.payload.items.map((i) => renderTemplate`<li data-astro-cid-aqxoqqhg>${i}</li>`)}</ul> </div>`)} ${blocks.filter((b) => b.kind === "compatibility").map((b) => renderTemplate`<div data-astro-cid-aqxoqqhg> <h2 data-astro-cid-aqxoqqhg>Compatibility</h2> <p data-astro-cid-aqxoqqhg>Requires ${b.payload.os}. Works with ${b.payload.app}.</p> </div>`)} </div> </section> </div> ` })} `;
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

import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { useState } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
import { currentCart } from "../../chunks/session_C_3CDjrl.mjs";
import { renderers } from "../../renderers.mjs";
const fmt = (m) => {
  const abs = Math.abs(m || 0);
  return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
function CheckoutHow({
  delivery = [],
  selectedMethod = "",
  subtotalMinor = 0,
  addressKnown = false,
  email = ""
}) {
  const [chosen, setChosen] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) {
      setErr("Choose a delivery method.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const cartRes = await fetch("/api/cart", {
        credentials: "same-origin"
      });
      const cart = await cartRes.json();
      const res = await fetch("/api/cart/delivery", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: cart.email || email,
          shipping_address: cart.shipping_address,
          shipping_method: chosen,
          marketing_opt_in: false
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      window.location.href = "/checkout/payment";
    } catch {
      setErr("That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return jsxs("div", {
    class: "checkout",
    children: [jsxs("ol", {
      class: "steps",
      "aria-label": "Checkout steps",
      children: [jsx("li", {
        children: "Where it goes"
      }), jsx("li", {
        "aria-current": "step",
        children: "How it gets there"
      }), jsx("li", {
        children: "Payment"
      })]
    }), jsxs("form", {
      class: "step-form",
      onSubmit: submit,
      children: [jsx("h1", {
        children: "How it gets there"
      }), !addressKnown ? jsxs("p", {
        class: "notice",
        children: ["Tell us where it goes first. ", jsx("a", {
          href: "/checkout/where-it-goes",
          children: "Go back to step one"
        }), "."]
      }) : null, jsxs("fieldset", {
        children: [jsx("legend", {
          children: "Delivery method"
        }), jsx("div", {
          class: "options",
          role: "radiogroup",
          "aria-label": "Delivery method",
          children: delivery.map((m) => jsxs("label", {
            class: `option${chosen === m.title ? " chosen" : ""}`,
            children: [jsx("input", {
              type: "radio",
              name: "method",
              value: m.title,
              checked: chosen === m.title,
              onChange: () => setChosen(m.title)
            }), jsx("span", {
              children: m.title
            }), jsx("span", {
              class: "muted small",
              children: m.min_days === m.max_days ? `${m.max_days} days` : `${m.min_days} to ${m.max_days} days`
            }), jsx("span", {
              class: "tnum price-inline",
              children: m.price_minor === 0 ? "Free" : fmt(m.price_minor)
            })]
          }))
        })]
      }), jsx("p", {
        class: "muted small",
        children: "No method is preselected. Pick one."
      }), err ? jsx("p", {
        class: "error-text",
        role: "alert",
        children: err
      }) : null, jsx("button", {
        class: "btn btn-primary",
        type: "submit",
        disabled: busy || !addressKnown,
        children: busy ? "Saving" : "Continue to payment"
      })]
    }), jsxs("aside", {
      class: "summary card",
      "aria-label": "Order summary",
      children: [jsx("h2", {
        children: "Summary"
      }), jsxs("dl", {
        class: "dl",
        children: [jsx("dt", {
          children: "Subtotal"
        }), jsx("dd", {
          class: "tnum",
          children: fmt(subtotalMinor)
        }), jsx("dt", {
          children: "Delivery"
        }), jsx("dd", {
          children: chosen ? delivery.find((m) => m.title === chosen)?.price_minor === 0 ? "Free" : fmt(delivery.find((m) => m.title === chosen).price_minor) : "—"
        }), jsx("dt", {
          children: "Tax"
        }), jsx("dd", {
          children: "Shown next"
        })]
      })]
    })]
  });
}
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const { request } = Astro2;
  const { state } = await currentCart(request);
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "How it gets there" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "CheckoutHow", CheckoutHow, { "client:load": true, "subtotalMinor": state?.subtotal_minor ?? 0, "selectedMethod": state?.shipping_method || "", "delivery": await (await import("../../chunks/index_CC0DBeZe.mjs")).q(
    `SELECT dm.title, dm.price_minor, dm.min_days, dm.max_days FROM delivery_method dm
       JOIN delivery_zone z ON z.id = dm.zone_id WHERE z.country='US' ORDER BY dm.price_minor`
  ), "addressKnown": !!state?.shipping_address, "email": state?.email || "", "client:component-hydration": "load", "client:component-path": "@components/CheckoutHow.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/checkout/how-it-gets-there/index.astro", void 0);
const $$file = "/app/src/pages/checkout/how-it-gets-there/index.astro";
const $$url = "/checkout/how-it-gets-there";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

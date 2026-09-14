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
function CheckoutWhere({
  initial,
  subtotalMinor
}) {
  const [f, setF] = useState(initial);
  const [marketing, setMarketing] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({
    ...f,
    [k]: e.target.value
  });
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/cart/delivery", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: f.email,
          shipping_address: {
            name: f.name,
            line1: f.line1,
            line2: f.line2,
            city: f.city,
            region: f.region,
            postal_code: f.postal_code,
            country: f.country,
            phone: f.phone
          },
          marketing_opt_in: marketing,
          shipping_method: "Standard"
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      window.location.href = "/checkout/how-it-gets-there";
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
        "aria-current": "step",
        children: "Where it goes"
      }), jsx("li", {
        children: "How it gets there"
      }), jsx("li", {
        children: "Payment"
      })]
    }), jsxs("form", {
      class: "step-form",
      onSubmit: submit,
      novalidate: true,
      children: [jsx("h1", {
        children: "Where it goes"
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "email",
          children: "Email"
        }), jsx("input", {
          id: "email",
          type: "email",
          required: true,
          value: f.email,
          onInput: set("email"),
          autocomplete: "email"
        })]
      }), jsxs("label", {
        class: "checkrow",
        children: [jsx("input", {
          type: "checkbox",
          checked: marketing,
          onChange: (e) => setMarketing(e.target.checked)
        }), jsx("span", {
          children: "Send me news about firmware. Unticked by default."
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "name",
          children: "Name"
        }), jsx("input", {
          id: "name",
          required: true,
          value: f.name,
          onInput: set("name"),
          autocomplete: "name"
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "line1",
          children: "Address line 1"
        }), jsx("input", {
          id: "line1",
          required: true,
          value: f.line1,
          onInput: set("line1"),
          autocomplete: "address-line1"
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsxs("label", {
          for: "line2",
          children: ["Address line 2 ", jsx("span", {
            class: "muted",
            children: "(optional)"
          })]
        }), jsx("input", {
          id: "line2",
          value: f.line2,
          onInput: set("line2"),
          autocomplete: "address-line2"
        })]
      }), jsxs("div", {
        class: "row3",
        children: [jsxs("div", {
          class: "field",
          children: [jsx("label", {
            for: "city",
            children: "City"
          }), jsx("input", {
            id: "city",
            required: true,
            value: f.city,
            onInput: set("city"),
            autocomplete: "address-level2"
          })]
        }), jsxs("div", {
          class: "field",
          children: [jsx("label", {
            for: "region",
            children: "Region"
          }), jsx("input", {
            id: "region",
            value: f.region,
            onInput: set("region"),
            autocomplete: "address-level1"
          })]
        }), jsxs("div", {
          class: "field",
          children: [jsx("label", {
            for: "postal",
            children: "Postal code"
          }), jsx("input", {
            id: "postal",
            required: true,
            value: f.postal_code,
            onInput: set("postal_code"),
            autocomplete: "postal-code"
          })]
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsx("label", {
          for: "country",
          children: "Country"
        }), jsx("select", {
          id: "country",
          value: f.country,
          onChange: set("country"),
          children: jsx("option", {
            value: "US",
            children: "United States"
          })
        })]
      }), jsxs("div", {
        class: "field",
        children: [jsxs("label", {
          for: "phone",
          children: ["Phone ", jsx("span", {
            class: "muted",
            children: "(optional)"
          })]
        }), jsx("input", {
          id: "phone",
          type: "tel",
          value: f.phone,
          onInput: set("phone"),
          autocomplete: "tel"
        })]
      }), err ? jsx("p", {
        class: "error-text",
        role: "alert",
        children: err
      }) : null, jsx("button", {
        class: "btn btn-primary",
        type: "submit",
        disabled: busy,
        children: busy ? "Saving" : "Continue to delivery"
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
          children: "Chosen next"
        }), jsx("dt", {
          children: "Tax"
        }), jsx("dd", {
          children: "Shown next"
        })]
      }), jsx("p", {
        class: "muted small",
        children: "Estimated. We will show the exact amount once we know where it is going."
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
  const addr = state?.shipping_address || {};
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Where it goes" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "CheckoutWhere", CheckoutWhere, { "client:load": true, "initial": {
    email: state?.email || "",
    name: addr.name || "",
    line1: addr.line1 || "",
    line2: addr.line2 || "",
    city: addr.city || "",
    region: addr.region || "",
    postal_code: addr.postal_code || "",
    country: addr.country || "US",
    phone: addr.phone || ""
  }, "subtotalMinor": state?.subtotal_minor ?? 0, "client:component-hydration": "load", "client:component-path": "@components/CheckoutWhere.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/checkout/where-it-goes/index.astro", void 0);
const $$file = "/app/src/pages/checkout/where-it-goes/index.astro";
const $$url = "/checkout/where-it-goes";
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

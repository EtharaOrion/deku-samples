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
function CheckoutPay({
  cart,
  ready
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const place = async () => {
    setBusy(true);
    setErr(null);
    try {
      let key = sessionStorage.getItem("vela_idempotency_key");
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem("vela_idempotency_key", key);
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key
        },
        body: JSON.stringify({})
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        if (body?.error?.code === "cart_reprice") setTimeout(() => {
          window.location.href = "/cart";
        }, 1200);
        return;
      }
      sessionStorage.removeItem("vela_idempotency_key");
      window.dispatchEvent(new CustomEvent("vela-cart"));
      const token = body.access_token ? `?access_token=${encodeURIComponent(body.access_token)}` : "";
      window.location.href = `/orders/${body.number}${token}`;
    } catch {
      setErr("That did not work.");
    } finally {
      setBusy(false);
    }
  };
  if (!ready) {
    return jsxs("div", {
      class: "checkout",
      children: [jsxs("ol", {
        class: "steps",
        "aria-label": "Checkout steps",
        children: [jsx("li", {
          children: "Where it goes"
        }), jsx("li", {
          children: "How it gets there"
        }), jsx("li", {
          "aria-current": "step",
          children: "Payment"
        })]
      }), jsxs("div", {
        class: "card",
        children: [jsx("h1", {
          children: "Payment"
        }), jsx("p", {
          children: "Finish the first two steps and the total will be waiting here."
        }), jsx("a", {
          class: "btn",
          href: "/checkout/where-it-goes",
          children: "Go to step one"
        })]
      })]
    });
  }
  return jsxs("div", {
    class: "checkout",
    children: [jsxs("ol", {
      class: "steps",
      "aria-label": "Checkout steps",
      children: [jsx("li", {
        children: "Where it goes"
      }), jsx("li", {
        children: "How it gets there"
      }), jsx("li", {
        "aria-current": "step",
        children: "Payment"
      })]
    }), jsxs("div", {
      class: "step-form",
      children: [jsx("h1", {
        children: "Payment"
      }), jsxs("p", {
        class: "muted",
        children: ["This shop takes no card. The order is invoiced to ", cart.email, "."]
      }), jsx("button", {
        class: "btn btn-primary",
        onClick: place,
        disabled: busy,
        children: busy ? "Placing your order" : `Place the order`
      }), busy ? jsx("p", {
        class: "muted",
        role: "status",
        children: "Placing your order."
      }) : null, err ? jsxs("p", {
        class: "error-text",
        role: "alert",
        children: [err, " ", jsx("a", {
          href: "/cart",
          children: "Back to the cart"
        })]
      }) : null]
    }), jsxs("aside", {
      class: "summary card",
      "aria-label": "Order summary",
      children: [jsx("h2", {
        children: "Order total"
      }), jsx("table", {
        class: "spec",
        children: jsxs("tbody", {
          children: [cart.lines.map((l, i) => jsxs("tr", {
            children: [jsxs("th", {
              scope: "row",
              children: [l.title, " ", jsx("span", {
                class: "muted small",
                children: l.variant_title
              }), " x", l.quantity]
            }), jsx("td", {
              class: "num tnum",
              children: fmt(l.line_total_minor)
            })]
          }, i)), cart.protection_minor ? jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              children: "Shipment protection"
            }), jsx("td", {
              class: "num tnum",
              children: fmt(cart.protection_minor)
            })]
          }) : null, jsxs("tr", {
            children: [jsxs("th", {
              scope: "row",
              children: ["Delivery (", cart.shipping_method, ")"]
            }), jsx("td", {
              class: "num tnum",
              children: fmt(cart.shipping_minor)
            })]
          }), jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              children: "Tax"
            }), jsx("td", {
              class: "num tnum",
              children: fmt(cart.tax_minor)
            })]
          }), jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              children: "Total"
            }), jsx("td", {
              class: "num tnum",
              children: jsx("strong", {
                children: fmt(cart.total_minor)
              })
            })]
          })]
        })
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
  const ready = !!(state && state.shipping_address && state.shipping_method);
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Payment" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "CheckoutPay", CheckoutPay, { "client:load": true, "ready": ready, "cart": {
    lines: (state?.lines || []).map((l) => ({ title: l.product_title, variant_title: l.variant_title, quantity: l.quantity, line_total_minor: l.quantity * l.current_price_minor })),
    subtotal_minor: state?.subtotal_minor ?? 0,
    shipping_minor: state?.shipping_minor ?? 0,
    tax_minor: state?.tax_minor ?? null,
    total_minor: state?.total_minor ?? null,
    shipping_method: state?.shipping_method ?? null,
    protection_minor: state?.protection?.enabled && state?.protection?.rung ? state.protection.rung.price_minor : 0,
    email: state?.email ?? null
  }, "client:component-hydration": "load", "client:component-path": "@components/CheckoutPay.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/checkout/payment/index.astro", void 0);
const $$file = "/app/src/pages/checkout/payment/index.astro";
const $$url = "/checkout/payment";
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

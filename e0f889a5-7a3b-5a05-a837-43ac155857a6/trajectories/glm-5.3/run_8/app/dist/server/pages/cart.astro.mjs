import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { useState, useEffect } from "preact/hooks";
import { jsxs, jsx, Fragment } from "preact/jsx-runtime";
import { currentCart } from "../chunks/session_C_3CDjrl.mjs";
import { renderers } from "../renderers.mjs";
const fmt = (m) => {
  const abs = Math.abs(Math.trunc(m || 0));
  const sign = (m || 0) < 0 ? "-" : "";
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
};
function CartView({
  initialCart
}) {
  const [cart, setCart] = useState(initialCart);
  const [pending, setPending] = useState(null);
  const [lineErr, setLineErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cart", {
        credentials: "same-origin"
      });
      if (res.ok) setCart(await res.json());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const setQty = async (line, qty) => {
    const before = cart;
    setPending({
      lineId: line.id,
      qty
    });
    setLineErr(null);
    setCart({
      ...cart,
      lines: cart.lines.map((l) => l.id === line.id ? {
        ...l,
        quantity: qty,
        line_total_minor: qty * l.current_price_minor
      } : l),
      subtotal_minor: cart.lines.reduce((s, l) => s + (l.id === line.id ? qty * l.current_price_minor : l.line_total_minor), 0)
    });
    try {
      const res = await fetch(`/api/cart/lines/${line.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          quantity: qty
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCart(before);
        setLineErr(body?.error?.message || "That did not work.");
        return;
      }
      setCart(body);
    } catch {
      setCart(before);
      setLineErr("That did not work.");
    } finally {
      setPending(null);
    }
  };
  const removeLine = async (line) => {
    if (!window.confirm(`Remove ${line.title} from your cart?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cart/lines/${line.id}`, {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (res.ok) setCart(await res.json());
    } finally {
      setBusy(false);
    }
  };
  const setProtection = async (enabled) => {
    setCart({
      ...cart,
      protection: {
        ...cart.protection,
        enabled
      }
    });
    const res = await fetch("/api/cart/protection", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        enabled
      })
    });
    if (res.ok) setCart(await res.json());
    else refresh();
  };
  if (!cart || cart.lines.length === 0) {
    return jsxs("div", {
      children: [jsx("h1", {
        children: "Cart"
      }), jsxs("div", {
        class: "card empty",
        "data-loading": true,
        children: [jsx("p", {
          children: "Your cart is empty."
        }), jsx("a", {
          class: "btn",
          href: "/shop",
          children: "Go to the shop"
        })]
      })]
    });
  }
  const subtotal = cart.subtotal_minor;
  const protection = cart.protection || {};
  const protectionMinor = protection.enabled && protection.rung ? protection.rung.price_minor : 0;
  const shipping = cart.shipping_minor || 0;
  const tax = cart.tax_minor;
  const total = cart.total_minor != null ? cart.total_minor : subtotal + protectionMinor + shipping + (tax || 0);
  return jsxs("div", {
    children: [jsx("h1", {
      children: "Cart"
    }), (cart.notices || []).map((n) => jsx("p", {
      class: "notice",
      role: "status",
      children: n.message
    })), jsxs("table", {
      class: "cart-table",
      children: [jsx("caption", {
        class: "sr-only",
        children: "Cart lines"
      }), jsx("thead", {
        children: jsxs("tr", {
          children: [jsx("th", {
            scope: "col",
            children: "Item"
          }), jsx("th", {
            scope: "col",
            children: "Unit"
          }), jsx("th", {
            scope: "col",
            children: "Quantity"
          }), jsx("th", {
            scope: "col",
            class: "num",
            children: "Line total"
          }), jsx("th", {
            scope: "col",
            children: jsx("span", {
              class: "sr-only",
              children: "Remove"
            })
          })]
        })
      }), jsx("tbody", {
        children: cart.lines.map((l) => jsxs("tr", {
          class: pending && pending.lineId === l.id ? "pending" : "",
          children: [jsx("td", {
            children: jsxs("div", {
              class: "line-title",
              children: [jsx("div", {
                class: "thumb",
                "aria-hidden": "true"
              }), jsxs("div", {
                children: [jsx("a", {
                  href: `/shop/${l.handle}`,
                  children: l.title
                }), jsx("div", {
                  class: "muted small",
                  children: l.variant_title
                }), jsx("div", {
                  class: "muted small mono",
                  children: l.sku
                })]
              })]
            })
          }), jsx("td", {
            class: "tnum",
            children: fmt(l.current_price_minor)
          }), jsx("td", {
            children: jsxs("div", {
              class: "stepper",
              children: [jsx("button", {
                class: "btn",
                "aria-label": `Decrease quantity of ${l.title}`,
                disabled: l.quantity <= 1 || busy,
                onClick: () => setQty(l, Math.max(1, l.quantity - 1)),
                children: "−"
              }), jsx("span", {
                class: "tnum qty-read",
                "aria-live": "polite",
                children: l.quantity
              }), jsx("button", {
                class: "btn",
                "aria-label": `Increase quantity of ${l.title}`,
                disabled: l.quantity >= 10 || busy,
                onClick: () => setQty(l, Math.min(10, l.quantity + 1)),
                children: "+"
              })]
            })
          }), jsx("td", {
            class: "num tnum",
            children: fmt(l.line_total_minor)
          }), jsx("td", {
            children: jsxs("button", {
              class: "btn btn-quiet",
              onClick: () => removeLine(l),
              children: ["Remove", jsxs("span", {
                class: "sr-only",
                children: [" ", l.title]
              })]
            })
          })]
        }))
      })]
    }), lineErr ? jsx("p", {
      class: "error-text",
      role: "alert",
      children: lineErr
    }) : null, pending ? jsx("p", {
      class: "muted small",
      role: "status",
      children: "Updating your cart."
    }) : null, jsxs("div", {
      class: "cart-foot",
      children: [jsxs("div", {
        class: "summary card",
        children: [jsx("h2", {
          children: "Summary"
        }), jsxs("dl", {
          class: "dl",
          children: [jsx("dt", {
            children: "Subtotal"
          }), jsx("dd", {
            class: "tnum",
            children: fmt(subtotal)
          }), protectionMinor ? jsxs(Fragment, {
            children: [jsx("dt", {
              children: "Shipment protection"
            }), jsx("dd", {
              class: "tnum",
              children: fmt(protectionMinor)
            })]
          }) : null, jsx("dt", {
            children: "Estimated delivery"
          }), jsx("dd", {
            class: "tnum",
            children: shipping ? fmt(shipping) : "—"
          }), jsx("dt", {
            children: "Estimated tax"
          }), jsx("dd", {
            class: "tnum",
            children: tax != null ? fmt(tax) : "—"
          }), jsx("dt", {
            children: "Total"
          }), jsx("dd", {
            class: "tnum",
            children: jsx("strong", {
              children: fmt(total)
            })
          })]
        }), cart.estimated !== false ? jsx("p", {
          class: "muted small",
          children: "Estimated. We will show the exact amount once we know where it is going."
        }) : null, jsx("a", {
          class: "btn btn-primary",
          href: "/checkout/where-it-goes",
          children: "Check out"
        })]
      }), jsx("div", {
        class: "extras",
        children: protection.rung ? jsxs("label", {
          class: "protect card",
          children: [jsx("input", {
            type: "checkbox",
            checked: !!protection.enabled,
            onChange: (e) => setProtection(e.target.checked)
          }), jsxs("span", {
            children: ["Protect this shipment against loss, theft and damage for ", fmt(protection.rung.price_minor)]
          })]
        }) : jsx("p", {
          class: "muted small",
          children: "Shipment protection is available once the cart holds something."
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
  function serialize(state2) {
    if (!state2) return { lines: [], notices: [], subtotal_minor: 0, tax_minor: null, shipping_minor: 0, total_minor: 0, protection: { enabled: false, rung: null }, shipping_method: null, email: null, estimated: true };
    return {
      lines: state2.lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        handle: l.handle,
        title: l.product_title,
        variant_title: l.variant_title,
        quantity: l.quantity,
        unit_price_minor: l.unit_price_minor,
        current_price_minor: l.current_price_minor,
        line_total_minor: l.quantity * l.current_price_minor,
        available: l.available
      })),
      notices: state2.notices,
      subtotal_minor: state2.subtotal_minor,
      protection: state2.protection,
      shipping_minor: state2.shipping_minor,
      shipping_method: state2.shipping_method,
      tax_minor: state2.tax_minor,
      total_minor: state2.total_minor,
      email: state2.email,
      estimated: !state2.shipping_address
    };
  }
  const initialCart = serialize(state);
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Cart" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "CartView", CartView, { "client:load": true, "initialCart": initialCart, "client:component-hydration": "load", "client:component-path": "@components/CartView.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/cart/index.astro", void 0);
const $$file = "/app/src/pages/cart/index.astro";
const $$url = "/cart";
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { p as publishCartCount, f as formatMinor, a as api, b as announce, v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { a as apiGet, b as formatMinor$1 } from '../chunks/api_D4zreuKm.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const MEDIA = {
  "VELA-A1-GRAPHITE": "/media/flagship.jpg",
  "VELA-A1-SAND": "/media/flagship-sand.jpg",
  "VELA-A1-YELLOW": "/media/flagship-yellow.jpg",
  "VELA-CRICKET-GRAPHITE": "/media/compact.jpg",
  "VELA-CRICKET-YELLOW": "/media/compact-yellow.jpg",
  "VELA-CASE-STD": "/media/case.jpg",
  "VELA-CABLE-1M": "/media/cable.jpg",
  "VELA-CABLE-2M": "/media/cable.jpg"
};
function CartView({
  initialCart = null
}) {
  const [cart, setCart] = useState(initialCart);
  const [loading, setLoading] = useState(!initialCart);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      const d = await api("/cart");
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!initialCart) load();
    else publishCartCount(initialCart.item_count);
  }, []);
  const setQuantity = async (line, quantity) => {
    if (quantity < 1 || quantity > 10) return;
    line.quantity;
    setOptimistic((o) => ({
      ...o,
      [line.id]: quantity
    }));
    setPending(true);
    setError(null);
    try {
      const d = await api(`/cart/lines/${line.id}`, {
        method: "PATCH",
        body: {
          quantity
        }
      });
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
      setOptimistic((o) => {
        const n = {
          ...o
        };
        delete n[line.id];
        return n;
      });
    } catch (err) {
      setOptimistic((o) => {
        const n = {
          ...o
        };
        delete n[line.id];
        return n;
      });
      setError(err.message);
      announce(err.message);
    } finally {
      setPending(false);
    }
  };
  const remove = async (line) => {
    setPending(true);
    setError(null);
    try {
      const d = await api(`/cart/lines/${line.id}`, {
        method: "DELETE"
      });
      setCart(d.cart);
      publishCartCount(d.cart.item_count);
      announce(`${line.title} removed from your cart.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };
  const toggleProtection = async (enabled) => {
    setPending(true);
    try {
      const d = await api("/cart/protection", {
        method: "POST",
        body: {
          enabled
        }
      });
      setCart(d.cart);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };
  if (loading) {
    return jsxs("div", {
      class: "cart-layout",
      children: [jsxs("div", {
        class: "stack",
        "aria-busy": "true",
        "aria-live": "polite",
        children: [jsx("span", {
          class: "visually-hidden",
          children: "Loading your cart."
        }), [0, 1].map((i) => jsxs("div", {
          class: "card",
          style: "display:grid;grid-template-columns:96px minmax(0,1fr);gap:calc(var(--unit)*4)",
          children: [jsx("div", {
            class: "skeleton",
            style: "height:72px"
          }), jsxs("div", {
            class: "stack",
            style: "gap:calc(var(--unit)*2)",
            children: [jsx("div", {
              class: "skeleton",
              style: "height:20px;width:40%"
            }), jsx("div", {
              class: "skeleton",
              style: "height:16px;width:24%"
            }), jsx("div", {
              class: "skeleton",
              style: "height:32px;width:30%"
            })]
          })]
        }, i))]
      }), jsx("div", {
        class: "card",
        style: "height:280px",
        children: jsx("div", {
          class: "skeleton",
          style: "height:100%"
        })
      })]
    });
  }
  if (!cart || cart.lines.length === 0) {
    return jsxs("div", {
      class: "empty",
      children: [jsx("p", {
        children: "Your cart is empty."
      }), jsxs("p", {
        class: "small",
        style: "margin-top:calc(var(--unit)*2)",
        children: [jsx("a", {
          href: "/shop",
          children: "Go to the shop"
        }), "."]
      })]
    });
  }
  return jsxs("div", {
    class: "cart-layout",
    children: [jsxs("div", {
      children: [cart.notices.map((n) => jsx("div", {
        class: "notice notice-danger",
        role: "status",
        children: jsx("p", {
          children: n.message
        })
      }, n.sku + n.kind)), error && jsx("div", {
        class: "notice notice-danger",
        role: "alert",
        children: jsx("p", {
          children: error
        })
      }), jsx("ul", {
        style: "list-style:none;padding:0;margin:0",
        class: "stack",
        children: cart.lines.map((line) => {
          const shown = optimistic[line.id] ?? line.quantity;
          return jsxs("li", {
            class: "card cart-line",
            children: [jsx("img", {
              class: "media",
              src: MEDIA[line.sku] || "/media/compact.jpg",
              alt: "",
              width: "96",
              height: "72",
              style: "width:96px;height:72px;aspect-ratio:auto"
            }), jsxs("div", {
              children: [jsxs("div", {
                class: "row-between",
                style: "align-items:flex-start",
                children: [jsxs("div", {
                  children: [jsx("p", {
                    style: "font-weight:700",
                    children: jsx("a", {
                      href: `/shop/${line.handle}`,
                      style: "text-decoration:none",
                      children: line.title
                    })
                  }), jsx("p", {
                    class: "small muted",
                    children: line.option_value
                  }), jsx("p", {
                    class: "small muted mono",
                    children: line.sku
                  })]
                }), jsx("p", {
                  class: "money",
                  style: "font-weight:700",
                  children: formatMinor(line.total_minor)
                })]
              }), jsxs("div", {
                class: "row",
                style: "margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*3)",
                children: [jsxs("div", {
                  class: "row",
                  style: "gap:calc(var(--unit)*2)",
                  children: [jsx("button", {
                    type: "button",
                    class: "btn btn-secondary btn-sm",
                    onClick: () => setQuantity(line, shown - 1),
                    disabled: shown <= 1,
                    "aria-label": `One fewer ${line.title}`,
                    children: "−"
                  }), jsx("output", {
                    class: "tnum",
                    style: "min-width:3ch;text-align:center;font-weight:700",
                    children: shown
                  }), jsx("button", {
                    type: "button",
                    class: "btn btn-secondary btn-sm",
                    onClick: () => setQuantity(line, shown + 1),
                    disabled: shown >= Math.min(10, line.available),
                    "aria-label": `One more ${line.title}`,
                    children: "+"
                  })]
                }), jsxs("span", {
                  class: "small muted money",
                  children: [formatMinor(line.unit_price_minor), " each"]
                }), jsx("button", {
                  type: "button",
                  class: "btn-quiet",
                  onClick: () => remove(line),
                  children: "Remove"
                })]
              })]
            })]
          }, line.id);
        })
      })]
    }), jsxs("aside", {
      class: "card",
      "aria-label": "Summary",
      children: [jsx("h2", {
        style: "font-size:16px;line-height:24px;margin-bottom:calc(var(--unit)*4)",
        children: "Summary"
      }), jsx("table", {
        class: "data",
        style: "margin-bottom:calc(var(--unit)*4)",
        children: jsxs("tbody", {
          children: [jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              style: "font-weight:400",
              children: "Estimated subtotal"
            }), jsx("td", {
              class: "num money",
              children: formatMinor(cart.subtotal_minor)
            })]
          }), jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              style: "font-weight:400",
              children: "Estimated delivery"
            }), jsx("td", {
              class: "num money",
              children: cart.shipping_method ? formatMinor(cart.shipping_minor) : "—"
            })]
          }), jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              style: "font-weight:400",
              children: "Estimated tax"
            }), jsx("td", {
              class: "num money",
              children: formatMinor(cart.tax_minor)
            })]
          }), jsxs("tr", {
            children: [jsx("th", {
              scope: "row",
              style: "font-weight:700",
              children: "Estimated total"
            }), jsx("td", {
              class: "num money",
              style: "font-weight:700",
              children: formatMinor(cart.total_minor)
            })]
          })]
        })
      }), jsx("p", {
        class: "small muted",
        "aria-live": "polite",
        style: "margin-bottom:calc(var(--unit)*4)",
        children: pending ? "Updating the totals." : "Estimated. We will show the exact amount once we know where it is going."
      }), cart.protection_rung && jsxs("label", {
        class: "row",
        style: "gap:calc(var(--unit)*2);margin-bottom:calc(var(--unit)*4);align-items:flex-start;flex-wrap:nowrap",
        children: [jsx("input", {
          type: "checkbox",
          checked: cart.protection_enabled,
          onChange: (e) => toggleProtection(e.currentTarget.checked),
          style: "margin-top:4px"
        }), jsx("span", {
          class: "small",
          children: cart.protection_rung.label
        })]
      }), jsx("a", {
        class: "btn",
        href: "/checkout/where-it-goes",
        style: "width:100%",
        children: "Check out"
      })]
    })]
  });
}

const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  const v = await viewer(Astro2);
  const res = v.cartToken ? await apiGet(Astro2.request, "/cart", { cartToken: v.cartToken }) : null;
  const cart = res && res.ok ? res.data.cart : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart \u2014 Vela", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Cart</h1> <p class="page-lede">Quantities are edited in place. Nothing is charged until you place the order.</p> <div id="live-region" role="status" aria-live="polite" class="visually-hidden"></div> ${renderComponent($$result2, "CartView", CartView, { "client:load": true, "initialCart": cart, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CartView.jsx", "client:component-export": "default" })} <noscript> ${cart && cart.lines.length > 0 ? renderTemplate`<div> ${cart.notices.map((n) => renderTemplate`<div class="notice notice-danger"><p>${n.message}</p></div>`)} <table class="data" style="max-width:60rem"> <thead> <tr><th>Item</th><th class="num">Quantity</th><th class="num">Total</th></tr> </thead> <tbody> ${cart.lines.map((l) => renderTemplate`<tr> <td>${l.title} — ${l.option_value}</td> <td class="num tnum">${l.quantity}</td> <td class="num money">${formatMinor$1(l.total_minor)}</td> </tr>`)} <tr><th scope="row">Estimated total</th><td></td><td class="num money">${formatMinor$1(cart.total_minor)}</td></tr> </tbody> </table> <p style="margin-top:calc(var(--unit)*4)"><a class="btn" href="/checkout/where-it-goes">Check out</a></p> </div>` : renderTemplate`<div class="empty"><p>Your cart is empty.</p><p class="small"><a href="/shop">Go to the shop</a>.</p></div>`} </noscript> ` })} `;
}, "/app/src/pages/cart.astro", void 0);

const $$file = "/app/src/pages/cart.astro";
const $$url = "/cart";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Cart,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

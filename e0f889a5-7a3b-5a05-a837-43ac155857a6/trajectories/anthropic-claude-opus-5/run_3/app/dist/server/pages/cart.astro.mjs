import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { useState, useEffect } from 'preact/hooks';
import { b as formatMoney } from '../chunks/app_BbZzWQ31.mjs';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { p as pageCustomer, a as pageCart } from '../chunks/server-fetch_DBHxzT0a.mjs';
export { renderers } from '../renderers.mjs';

function CartView({
  initialCart
}) {
  const [cart, setCart] = useState(initialCart);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);
  useEffect(() => {
    const onCart = (ev) => setCart(ev.detail);
    window.addEventListener("vela:cart", onCart);
    return () => window.removeEventListener("vela:cart", onCart);
  }, []);
  async function send(path, init) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setOptimistic({});
        setError(body?.message || "That did not work.");
        return null;
      }
      setCart(body.cart);
      setOptimistic({});
      return body.cart;
    } catch {
      setOptimistic({});
      setError("That did not work.");
      return null;
    } finally {
      setPending(false);
    }
  }
  function setQuantity(line, quantity) {
    if (quantity < 1 || quantity > 10) return;
    setOptimistic((o) => ({
      ...o,
      [line.id]: quantity
    }));
    send(`/api/cart/lines/${line.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        quantity
      })
    });
  }
  function remove(line) {
    send(`/api/cart/lines/${line.id}`, {
      method: "DELETE"
    });
  }
  function toggleProtection(enabled) {
    send("/api/cart/protection", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        enabled
      })
    });
  }
  if (!cart || cart.lines.length === 0) {
    return jsxs("div", {
      class: "empty",
      children: [jsx("p", {
        children: "Your cart is empty."
      }), jsx("p", {
        children: jsx("a", {
          href: "/shop",
          children: "Shop"
        })
      })]
    });
  }
  const rung = cart.protection_rung;
  return jsxs("div", {
    class: "cartview",
    children: [cart.notices.map((notice) => jsx("div", {
      class: "notice notice--warn",
      role: "status",
      children: jsx("span", {
        class: "notice__body",
        children: notice.message
      })
    }, notice.sku)), error && jsx("div", {
      class: "notice notice--error",
      role: "alert",
      children: jsx("span", {
        class: "notice__body",
        children: error
      })
    }), jsxs("div", {
      class: "cartview__grid",
      children: [jsx("div", {
        children: jsxs("table", {
          class: "table cart-table",
          children: [jsx("caption", {
            class: "visually-hidden",
            children: "Items in your cart"
          }), jsx("thead", {
            children: jsxs("tr", {
              children: [jsx("th", {
                scope: "col",
                children: "Item"
              }), jsx("th", {
                scope: "col",
                class: "right",
                children: "Unit"
              }), jsx("th", {
                scope: "col",
                children: "Quantity"
              }), jsx("th", {
                scope: "col",
                class: "right",
                children: "Line total"
              }), jsx("th", {
                scope: "col",
                children: jsx("span", {
                  class: "visually-hidden",
                  children: "Remove"
                })
              })]
            })
          }), jsx("tbody", {
            children: cart.lines.map((line) => {
              const qty = optimistic[line.id] ?? line.quantity;
              return jsxs("tr", {
                children: [jsx("td", {
                  children: jsxs("div", {
                    class: "cart-line",
                    children: [jsx("img", {
                      class: "cart-line__thumb",
                      src: `/media/products/${line.handle}.svg`,
                      alt: "",
                      width: "72",
                      height: "60"
                    }), jsxs("div", {
                      children: [jsx("a", {
                        class: "cart-line__title",
                        href: `/shop/${line.handle}`,
                        children: line.title
                      }), jsx("p", {
                        class: "small muted cart-line__variant",
                        children: line.option_value
                      })]
                    })]
                  })
                }), jsx("td", {
                  class: "right money",
                  children: formatMoney(line.unit_price_minor)
                }), jsx("td", {
                  children: jsxs("div", {
                    class: "stepper",
                    children: [jsx("button", {
                      type: "button",
                      class: "btn btn--secondary btn--small",
                      onClick: () => setQuantity(line, qty - 1),
                      disabled: qty <= 1,
                      "aria-label": `One fewer ${line.title}`,
                      children: jsx("span", {
                        "aria-hidden": "true",
                        children: "−"
                      })
                    }), jsx("span", {
                      class: "num stepper__value",
                      "aria-live": "off",
                      children: qty
                    }), jsx("button", {
                      type: "button",
                      class: "btn btn--secondary btn--small",
                      onClick: () => setQuantity(line, qty + 1),
                      disabled: qty >= Math.min(10, line.available),
                      "aria-label": `One more ${line.title}`,
                      children: jsx("span", {
                        "aria-hidden": "true",
                        children: "+"
                      })
                    })]
                  })
                }), jsx("td", {
                  class: "right money",
                  children: formatMoney(line.unit_price_minor * qty)
                }), jsx("td", {
                  class: "right",
                  children: jsxs("button", {
                    type: "button",
                    class: "btn btn--quiet btn--small",
                    onClick: () => remove(line),
                    children: ["Remove", jsxs("span", {
                      class: "visually-hidden",
                      children: [" ", line.title]
                    })]
                  })
                })]
              }, line.id);
            })
          })]
        })
      }), jsxs("aside", {
        class: "panel cart-summary",
        "aria-label": "Summary",
        children: [jsx("h2", {
          class: "section-title",
          children: "Summary"
        }), jsxs("dl", {
          class: `totals ${pending ? "is-pending" : ""}`,
          children: [jsxs("div", {
            class: "totals__row",
            children: [jsx("dt", {
              children: "Subtotal"
            }), jsx("dd", {
              class: "money",
              children: formatMoney(cart.subtotal_minor)
            })]
          }), jsxs("div", {
            class: "totals__row",
            children: [jsx("dt", {
              children: "Estimated delivery"
            }), jsx("dd", {
              class: "money",
              children: formatMoney(cart.shipping_minor)
            })]
          }), jsxs("div", {
            class: "totals__row",
            children: [jsx("dt", {
              children: "Estimated tax"
            }), jsx("dd", {
              class: "money",
              children: formatMoney(cart.tax_minor)
            })]
          }), jsxs("div", {
            class: "totals__row totals__row--total",
            children: [jsx("dt", {
              children: "Total"
            }), jsx("dd", {
              class: "money strong",
              children: formatMoney(cart.total_minor)
            })]
          })]
        }), jsx("p", {
          class: "small muted",
          children: "Estimated. We will show the exact amount once we know where it is going."
        }), rung && jsxs("label", {
          class: "checkbox-row protect",
          children: [jsx("input", {
            type: "checkbox",
            checked: rung.enabled,
            onChange: (e) => toggleProtection(e.currentTarget.checked)
          }), jsxs("span", {
            children: ["Protect this shipment against loss, theft and damage for", " ", jsx("span", {
              class: "money",
              children: formatMoney(rung.price_minor)
            })]
          })]
        }), jsx("a", {
          class: "btn cart-summary__go",
          href: "/checkout/where-it-goes",
          children: "Check out"
        })]
      })]
    }), jsx("style", {
      children: `
        .cartview__grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: calc(var(--unit) * 6);
          align-items: start;
        }
        .cart-line { display: flex; gap: calc(var(--unit) * 3); align-items: center; }
        .cart-line__thumb { border-radius: 0; border: var(--border-w) solid var(--line); }
        .cart-line__title { font-weight: 700; text-decoration: none; }
        .cart-line__variant { margin: calc(var(--unit) * 0.5) 0 0; }
        .stepper { display: flex; align-items: center; gap: calc(var(--unit) * 2); }
        .stepper__value { min-width: 2ch; text-align: center; }
        .totals { margin: 0 0 calc(var(--unit) * 3); }
        .totals__row { display: flex; justify-content: space-between; gap: calc(var(--unit) * 3); padding: calc(var(--unit) * 1) 0; }
        .totals__row dt, .totals__row dd { margin: 0; }
        .totals__row--total { border-top: var(--border-w) solid var(--line); margin-top: calc(var(--unit) * 2); padding-top: calc(var(--unit) * 2); }
        /* The totals show a pending state while the server is authoritative. */
        .totals.is-pending { opacity: 0.55; }
        .cart-summary__go { width: 100%; margin-top: calc(var(--unit) * 4); }
        .protect { margin-top: calc(var(--unit) * 4); }
        @media (max-width: 63.999rem) {
          .cartview__grid { grid-template-columns: minmax(0, 1fr); }
        }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart \u2014 Vela", "description": "What is in your cart.", "current": "shop", "customer": customer, "cartCount": cart?.item_count ?? 0 }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1 class="page-title">Cart</h1> </div>  ${renderComponent($$result2, "CartView", CartView, { "client:load": true, "initialCart": cart, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CartView.jsx", "client:component-export": "default" })} ` })}`;
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

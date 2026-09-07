import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, n as Fragment } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { useState } from 'preact/hooks';
import { a as formatMinor } from '../chunks/format_y0Y9nLbA.mjs';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { d as currentCart } from '../chunks/server_SMyiD-DF.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

function CartControls({
  initial
}) {
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  async function send(path, options, revert) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        ...options
      });
      const body = await res.json();
      if (!res.ok) {
        revert?.();
        setError(body.message || "That did not work.");
        return null;
      }
      setCart(body);
      setOptimistic({});
      window.dispatchEvent(new CustomEvent("vela:cart-changed", {
        detail: body
      }));
      return body;
    } catch {
      revert?.();
      setError("That did not work. Check your connection and try again.");
      return null;
    } finally {
      setPending(false);
    }
  }
  function changeQuantity(line, next) {
    if (next < 1 || next > 10) return;
    const previous = optimistic[line.id] ?? line.quantity;
    setOptimistic((o) => ({
      ...o,
      [line.id]: next
    }));
    send(`/api/cart/lines/${line.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity: next
      })
    }, () => setOptimistic((o) => ({
      ...o,
      [line.id]: previous
    })));
  }
  function removeLine(line) {
    send(`/api/cart/lines/${line.id}`, {
      method: "DELETE"
    });
    setConfirming(null);
  }
  function toggleProtection(enabled) {
    send("/api/cart/protection", {
      method: "POST",
      body: JSON.stringify({
        enabled
      })
    });
  }
  const lines = cart.lines || [];
  const rung = cart.protection_rung;
  if (!lines.length) {
    return jsxs("div", {
      class: "empty card",
      children: [jsx("p", {
        children: "Your cart is empty."
      }), jsx("a", {
        href: "/shop",
        children: "Shop"
      }), jsx("style", {
        children: `
          .empty {
            padding: calc(var(--space) * 6);
            display: flex; flex-direction: column; gap: calc(var(--space) * 2);
            align-items: flex-start;
          }
        `
      })]
    });
  }
  return jsxs("div", {
    class: "cart-grid",
    children: [jsxs("div", {
      class: "lines-side",
      children: [(cart.notices || []).length > 0 && jsx("ul", {
        class: "notices",
        children: cart.notices.map((n) => jsx("li", {
          class: "notice notice-danger",
          children: n.message
        }, n.line_id + n.kind))
      }), error && jsx("p", {
        class: "notice notice-danger",
        role: "alert",
        children: error
      }), jsx("ul", {
        class: "lines",
        children: lines.map((line) => {
          const shown = optimistic[line.id] ?? line.quantity;
          return jsxs("li", {
            class: "line",
            children: [jsx("div", {
              class: "line-media",
              "aria-hidden": "true"
            }), jsxs("div", {
              class: "line-body",
              children: [jsx("a", {
                class: "line-title",
                href: `/shop/${line.handle}`,
                children: line.title
              }), jsx("p", {
                class: "hint",
                children: line.option_value
              }), jsxs("p", {
                class: "hint money tnum",
                children: [formatMinor(line.unit_price_minor), " each"]
              })]
            }), jsxs("div", {
              class: "stepper",
              role: "group",
              "aria-label": `Quantity of ${line.title}`,
              children: [jsxs("button", {
                type: "button",
                class: "step",
                onClick: () => changeQuantity(line, shown - 1),
                disabled: shown <= 1,
                children: [jsx("span", {
                  "aria-hidden": "true",
                  children: "−"
                }), jsxs("span", {
                  class: "visually-hidden",
                  children: ["One fewer ", line.title]
                })]
              }), jsx("output", {
                class: "qty-value tnum",
                children: shown
              }), jsxs("button", {
                type: "button",
                class: "step",
                onClick: () => changeQuantity(line, shown + 1),
                disabled: shown >= Math.min(10, line.available),
                children: [jsx("span", {
                  "aria-hidden": "true",
                  children: "+"
                }), jsxs("span", {
                  class: "visually-hidden",
                  children: ["One more ", line.title]
                })]
              })]
            }), jsx("p", {
              class: `line-total money tnum${pending ? " pending" : ""}`,
              children: formatMinor(line.unit_price_minor * shown)
            }), confirming === line.id ? jsxs("div", {
              class: "confirm",
              children: [jsx("p", {
                children: "Remove it?"
              }), jsx("button", {
                type: "button",
                class: "btn",
                onClick: () => removeLine(line),
                children: "Remove"
              }), jsx("button", {
                type: "button",
                class: "btn",
                onClick: () => setConfirming(null),
                children: "Keep"
              })]
            }) : jsxs("button", {
              type: "button",
              class: "btn remove",
              onClick: () => setConfirming(line.id),
              children: ["Remove", jsxs("span", {
                class: "visually-hidden",
                children: [" ", line.title]
              })]
            })]
          }, line.id);
        })
      })]
    }), jsxs("aside", {
      class: "summary card",
      "aria-label": "Cart summary",
      children: [jsx("h2", {
        children: "Summary"
      }), jsxs("dl", {
        class: "totals",
        children: [jsxs("div", {
          children: [jsx("dt", {
            children: "Subtotal"
          }), jsx("dd", {
            class: "money tnum",
            children: formatMinor(cart.subtotal_minor)
          })]
        }), jsxs("div", {
          children: [jsx("dt", {
            children: "Estimated delivery"
          }), jsx("dd", {
            class: "money tnum",
            children: formatMinor(cart.shipping_minor)
          })]
        }), cart.protection_minor > 0 && jsxs("div", {
          children: [jsx("dt", {
            children: "Shipment protection"
          }), jsx("dd", {
            class: "money tnum",
            children: formatMinor(cart.protection_minor)
          })]
        }), jsxs("div", {
          children: [jsx("dt", {
            children: "Estimated tax"
          }), jsx("dd", {
            class: "money tnum",
            children: formatMinor(cart.tax_minor)
          })]
        }), jsxs("div", {
          class: "grand",
          children: [jsx("dt", {
            children: "Total"
          }), jsx("dd", {
            class: "money tnum",
            children: formatMinor(cart.total_minor)
          })]
        })]
      }), jsx("p", {
        class: "hint",
        children: "Estimated. We will show the exact amount once we know where it is going."
      }), rung && jsxs("label", {
        class: "protect",
        children: [jsx("input", {
          type: "checkbox",
          checked: Boolean(cart.protection_enabled),
          onChange: (e) => toggleProtection(e.currentTarget.checked)
        }), jsxs("span", {
          children: ["Protect this shipment against loss, theft and damage for ", formatMinor(rung.price_minor)]
        })]
      }), jsx("a", {
        class: "btn btn-primary checkout",
        href: "/checkout/where-it-goes",
        children: "Check out"
      })]
    }), jsx("style", {
      children: `
        .cart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
          gap: calc(var(--space) * 8);
          align-items: start;
        }
        .lines-side { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .notices, .lines { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 3); }

        .line {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) auto auto auto;
          gap: calc(var(--space) * 3);
          align-items: center;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          background: var(--bg-raised);
        }
        .line-media {
          width: 64px; height: 48px;
          background: var(--bg-sunken);
          border: var(--border-w) solid var(--rule);
          border-radius: 0;
        }
        .line-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .line-title { font-weight: 700; text-decoration: none; }
        .line-total { min-width: 84px; text-align: right; font-weight: 700; }
        /* The totals show a pending state while the server settles. */
        .line-total.pending { opacity: 0.5; }

        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step { width: 32px; height: 32px; border: 0; background: transparent; cursor: pointer; }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 30px; text-align: center; font-variant-numeric: tabular-nums; }

        .remove { min-height: 32px; font-size: 14px; }
        .confirm { display: flex; align-items: center; gap: calc(var(--space) * 2); font-size: 14px; }

        .summary {
          padding: calc(var(--space) * 4);
          display: flex; flex-direction: column; gap: calc(var(--space) * 4);
          position: sticky; top: calc(var(--header-h) + var(--space) * 4);
        }
        .summary h2 { font-size: 16px; }
        .totals { display: flex; flex-direction: column; gap: calc(var(--space) * 2); font-size: 14px; }
        .totals > div { display: flex; justify-content: space-between; gap: calc(var(--space) * 3); }
        .totals dd { margin: 0; }
        .grand { border-top: var(--border-w) solid var(--rule); padding-top: calc(var(--space) * 2); font-weight: 700; font-size: 16px; }
        .protect { display: flex; gap: calc(var(--space) * 2); font-size: 14px; align-items: flex-start; }
        .checkout { width: 100%; }

        @media (max-width: 63.999rem) {
          .cart-grid { grid-template-columns: minmax(0, 1fr); }
          .line { grid-template-columns: 48px minmax(0, 1fr); grid-auto-flow: row; }
          .summary { position: static; }
        }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Cart = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Cart;
  let cart = null;
  let failed = false;
  try {
    cart = await currentCart(Astro2);
  } catch {
    failed = true;
  }
  const empty = {
    lines: [],
    notices: [],
    subtotal_minor: 0,
    shipping_minor: 0,
    tax_minor: 0,
    total_minor: 0,
    protection_minor: 0,
    protection_enabled: false,
    protection_rung: null,
    item_count: 0,
    currency: "usd"
  };
  const view = cart || empty;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cart \u2014 Vela", "description": "What is in your cart.", "data-astro-cid-h3zw4u6d": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-h3zw4u6d> <h1 data-astro-cid-h3zw4u6d>Cart</h1> ${failed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-h3zw4u6d>We could not load your cart. Reload the page to try again.</p>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-h3zw4u6d": true }, { "default": async ($$result3) => renderTemplate`  <noscript> ${view.lines.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-h3zw4u6d> <p data-astro-cid-h3zw4u6d>Your cart is empty.</p> <a href="/shop" data-astro-cid-h3zw4u6d>Shop</a> </div>` : renderTemplate`<table class="table" data-astro-cid-h3zw4u6d> <caption class="visually-hidden" data-astro-cid-h3zw4u6d>Cart lines</caption> <thead data-astro-cid-h3zw4u6d> <tr data-astro-cid-h3zw4u6d> <th data-astro-cid-h3zw4u6d>Item</th><th class="num" data-astro-cid-h3zw4u6d>Unit</th> <th class="num" data-astro-cid-h3zw4u6d>Qty</th><th class="num" data-astro-cid-h3zw4u6d>Total</th> </tr> </thead> <tbody data-astro-cid-h3zw4u6d> ${view.lines.map((line) => renderTemplate`<tr data-astro-cid-h3zw4u6d> <td data-astro-cid-h3zw4u6d>${line.title} <span class="hint" data-astro-cid-h3zw4u6d>${line.option_value}</span></td> <td class="num money" data-astro-cid-h3zw4u6d>${formatMinor(line.unit_price_minor)}</td> <td class="num" data-astro-cid-h3zw4u6d>${line.quantity}</td> <td class="num money" data-astro-cid-h3zw4u6d>${formatMinor(line.line_total_minor)}</td> </tr>`)} </tbody> <tfoot data-astro-cid-h3zw4u6d> <tr data-astro-cid-h3zw4u6d><th colspan="3" class="num" data-astro-cid-h3zw4u6d>Subtotal</th><td class="num money" data-astro-cid-h3zw4u6d>${formatMinor(view.subtotal_minor)}</td></tr> <tr data-astro-cid-h3zw4u6d><th colspan="3" class="num" data-astro-cid-h3zw4u6d>Estimated tax</th><td class="num money" data-astro-cid-h3zw4u6d>${formatMinor(view.tax_minor)}</td></tr> <tr data-astro-cid-h3zw4u6d><th colspan="3" class="num" data-astro-cid-h3zw4u6d>Total</th><td class="num money" data-astro-cid-h3zw4u6d>${formatMinor(view.total_minor)}</td></tr> </tfoot> </table>`} <p data-astro-cid-h3zw4u6d><a class="btn btn-primary" href="/checkout/where-it-goes" data-astro-cid-h3zw4u6d>Check out</a></p> </noscript> ${renderComponent($$result3, "CartControls", CartControls, { "client:load": true, "initial": view, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CartControls.jsx", "client:component-export": "default", "data-astro-cid-h3zw4u6d": true })} ` })}`} </div> ` })} `;
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

import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { a as api, b as announce, v as viewer, s as signInRedirect, $ as $$Shell } from '../../chunks/page_CERy5BG_.mjs';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { a as apiGet } from '../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../renderers.mjs';

function formatDate(value) {
  if (!value) return "";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}
function groupSerial(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}
const unformat = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
function CameraGrid({
  initialDevices = null,
  prefillSerial = ""
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [loading, setLoading] = useState(initialDevices === null);
  const [failed, setFailed] = useState(false);
  const [value, setValue] = useState(prefillSerial ? groupSerial(prefillSerial) : "");
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const clean = unformat(value);
  const shapeOk = clean.length === 0 || SHAPE.test(clean);
  const ready = SHAPE.test(clean);
  const load = async () => {
    try {
      const d = await api("/account/devices?page_size=100", {
        auth: true
      });
      setDevices(d.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (initialDevices === null) load();
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4e3);
    return () => clearTimeout(t);
  }, [flash]);
  const register = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setState("working");
    setError(null);
    try {
      const d = await api("/account/devices", {
        method: "POST",
        body: {
          serial: clean
        },
        auth: true
      });
      setDevices((list) => [...list || [], d.device]);
      setValue("");
      setFlash(`${d.device.serial} is on your account.`);
      announce(`${d.device.model} added to your account.`);
      setState("idle");
    } catch (err) {
      setState("idle");
      setError(err.message);
      announce(err.message);
    }
  };
  const release = async (serial) => {
    setConfirming(null);
    try {
      await api(`/account/devices/${encodeURIComponent(serial)}`, {
        method: "DELETE",
        auth: true
      });
      setDevices((list) => list.filter((d) => d.serial !== serial));
      setFlash(`${serial} was removed from your account.`);
      announce(`${serial} removed.`);
    } catch (err) {
      setError(err.message);
    }
  };
  return jsxs("div", {
    children: [jsx("div", {
      id: "live-region",
      role: "status",
      "aria-live": "polite",
      class: "visually-hidden"
    }), jsxs("form", {
      class: "card",
      onSubmit: register,
      style: "margin-bottom:calc(var(--unit)*6)",
      children: [jsxs("div", {
        class: "row",
        style: "gap:calc(var(--unit)*4);align-items:flex-start",
        children: [jsxs("label", {
          style: "flex:1;min-width:16rem",
          children: [jsx("span", {
            class: "label",
            style: "display:block;font-weight:700;font-size:14px;margin-bottom:calc(var(--unit)*1.5)",
            children: "Register a camera"
          }), jsx("input", {
            class: "input serial",
            value,
            onInput: (e) => setValue(groupSerial(e.currentTarget.value)),
            placeholder: "VC26-09PV-DA7Q",
            maxLength: 14,
            "aria-invalid": !shapeOk ? "true" : void 0,
            "aria-describedby": "serial-help"
          }), jsx("span", {
            class: "field-hint",
            id: "serial-help",
            children: !shapeOk ? "A serial is twelve characters: two letters, four digits, then six more." : "Twelve characters, engraved on the underside of the camera."
          })]
        }), jsx("button", {
          type: "submit",
          class: "btn",
          disabled: !ready || state === "working",
          style: "margin-top:26px",
          children: state === "working" ? "Registering" : "Register"
        })]
      }), error && jsx("p", {
        class: "field-error",
        role: "alert",
        style: "margin-top:calc(var(--unit)*2)",
        children: error
      })]
    }), flash && jsx("div", {
      class: "notice notice-done",
      role: "status",
      style: "margin-bottom:calc(var(--unit)*5)",
      children: jsx("p", {
        children: flash
      })
    }), loading ? jsxs("div", {
      class: "grid-3",
      "aria-busy": "true",
      children: [jsx("span", {
        class: "visually-hidden",
        children: "Loading your cameras."
      }), [0, 1, 2].map((i) => jsxs("div", {
        class: "card",
        children: [jsx("div", {
          class: "skeleton",
          style: "height:20px;width:60%"
        }), jsx("div", {
          class: "skeleton",
          style: "height:16px;width:40%;margin-top:12px"
        }), jsx("div", {
          class: "skeleton",
          style: "height:16px;width:70%;margin-top:12px"
        })]
      }, i))]
    }) : failed ? jsx("div", {
      class: "notice notice-danger",
      role: "alert",
      children: jsx("p", {
        children: "We could not load your cameras. Reload the page to try again."
      })
    }) : !devices || devices.length === 0 ? jsx("div", {
      class: "empty",
      children: jsx("p", {
        children: "No cameras registered yet."
      })
    }) : jsx("div", {
      class: "grid-3",
      children: devices.map((d) => jsxs("article", {
        class: "card",
        children: [jsx("h3", {
          style: "font-size:16px;line-height:24px",
          children: jsx("a", {
            href: `/account/cameras/${d.serial}`,
            style: "text-decoration:none",
            children: d.nickname || d.model
          })
        }), jsxs("p", {
          class: "small muted",
          children: [d.model, " — ", d.option_value]
        }), jsx("p", {
          class: "serial small",
          style: "margin-top:calc(var(--unit)*2)",
          children: d.serial
        }), jsxs("div", {
          class: "row",
          style: "margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*2)",
          children: [d.never_connected ? jsx("span", {
            class: "chip",
            children: "Not yet connected"
          }) : d.update_available ? jsx("span", {
            class: "chip chip-progress",
            children: "Update available"
          }) : jsxs("span", {
            class: "chip chip-done",
            children: ["Firmware ", d.firmware_version]
          }), d.warranty_until && jsx("span", {
            class: "chip",
            children: d.warranty_expired ? "Warranty ended" : `Warranty to ${formatDate(d.warranty_until)}`
          })]
        }), confirming === d.serial ? jsxs("div", {
          class: "notice",
          style: "margin-top:calc(var(--unit)*3)",
          children: [jsxs("p", {
            class: "small",
            children: ["Remove ", d.serial, " from your account? This gives it to nobody."]
          }), jsxs("div", {
            class: "row",
            style: "gap:calc(var(--unit)*2);margin-top:calc(var(--unit)*2)",
            children: [jsx("button", {
              type: "button",
              class: "btn btn-sm",
              onClick: () => release(d.serial),
              children: "Remove it"
            }), jsx("button", {
              type: "button",
              class: "btn btn-secondary btn-sm",
              onClick: () => setConfirming(null),
              children: "Keep it"
            })]
          })]
        }) : jsxs("div", {
          class: "row",
          style: "margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*3)",
          children: [jsx("a", {
            class: "small",
            href: `/account/cameras/${d.serial}`,
            children: "Details"
          }), jsx("button", {
            type: "button",
            class: "btn-quiet",
            onClick: () => setConfirming(d.serial),
            children: "Remove from my account"
          })]
        })]
      }, d.serial))
    })]
  });
}

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const v = await viewer(Astro2);
  if (!v.signedIn) return signInRedirect(Astro2);
  const res = await apiGet(Astro2.request, "/account/devices?page_size=100", { token: v.token });
  const devices = res.ok ? res.data.data : null;
  const prefill = Astro2.url.searchParams.get("serial") || "";
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Your cameras \u2014 Vela", "signedIn": true, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Your cameras</h1> <p class="page-lede">
A serial number is a record in its own right. Registering one links it to this
    account; removing it releases the link and gives it to nobody.
</p> ${renderComponent($$result2, "CameraGrid", CameraGrid, { "client:load": true, "initialDevices": devices, "prefillSerial": prefill, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CameraGrid.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/account/cameras/index.astro", void 0);

const $$file = "/app/src/pages/account/cameras/index.astro";
const $$url = "/account/cameras";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

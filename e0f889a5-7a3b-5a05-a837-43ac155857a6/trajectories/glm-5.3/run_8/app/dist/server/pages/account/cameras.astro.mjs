import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro, m as maybeRenderHead } from "../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../chunks/App_CiTDO3Su.mjs";
import { q } from "../../chunks/index_CC0DBeZe.mjs";
import { currentCustomer } from "../../chunks/session_C_3CDjrl.mjs";
import { useState } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
import { renderers } from "../../renderers.mjs";
const SERIAL_RE = /^(VA|VC)\d{2}\d{2}[2-9A-HJ-NP-Z]{6}$/;
function groupSerial(v) {
  const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return s.replace(/^(.{2})(.{2})(.{2})(.{4})(.{2})$/, "$1$2$3 $4 $5").replace(/^(.{10})(.{2})$/, "$1 $2");
}
function CameraGrid({
  initial = [],
  prefill = ""
}) {
  const [cameras, setCameras] = useState(initial);
  const [serial, setSerial] = useState(prefill);
  const [err, setErr] = useState(null);
  const [justAdded, setJustAdded] = useState(null);
  const [busy, setBusy] = useState(false);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("vela_token") : null;
  const authHeaders = {
    "Content-Type": "application/json",
    ...token ? {
      Authorization: `Bearer ${token}`
    } : {}
  };
  const raw = serial.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const shapeOk = SERIAL_RE.test(raw);
  const register = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!shapeOk) {
      setErr("A serial is twelve characters, engraved under the camera.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/devices", {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders,
        body: JSON.stringify({
          serial: raw
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || "That did not work.");
        return;
      }
      const r2 = await fetch(`/api/account/devices/${raw}`, {
        credentials: "same-origin",
        headers: authHeaders
      });
      const d = await r2.json();
      setCameras([{
        serial: d.serial,
        nickname: d.nickname,
        model: d.model,
        variant_title: d.variant_title,
        firmware_version: d.firmware_version,
        latest_firmware: d.latest_firmware,
        warranty_until: d.warranty_until ? new Date(d.warranty_until).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : null
      }, ...cameras.filter((c) => c.serial !== d.serial)]);
      setSerial("");
      setJustAdded(d.serial);
      setTimeout(() => setJustAdded(null), 4e3);
    } finally {
      setBusy(false);
    }
  };
  return jsxs("div", {
    children: [jsxs("form", {
      class: "register card",
      onSubmit: register,
      children: [jsxs("div", {
        class: "reg-field",
        children: [jsx("label", {
          for: "serial",
          children: "Register a camera by its serial"
        }), jsx("input", {
          id: "serial",
          class: "mono",
          inputmode: "text",
          autocomplete: "off",
          spellcheck: "false",
          placeholder: "VC26 09PV DA7Q",
          value: groupSerial(serial),
          onInput: (e) => setSerial(e.target.value),
          "aria-describedby": "serial-help serial-state"
        }), jsx("span", {
          id: "serial-help",
          class: "muted small",
          children: "Grouped as it is typed. Stored unformatted."
        }), jsx("span", {
          id: "serial-state",
          class: "muted small",
          role: "status",
          children: raw.length === 0 ? "" : shapeOk ? "That looks right." : "Twelve characters, capitals, no I, O, 0 or 1."
        })]
      }), jsx("button", {
        class: "btn btn-primary",
        type: "submit",
        disabled: busy || !shapeOk,
        children: "Register"
      }), err ? jsx("p", {
        class: "error-text",
        role: "alert",
        children: err
      }) : null, justAdded ? jsx("p", {
        class: "ok-text flash-confirm",
        role: "status",
        children: "Added to your account."
      }) : null]
    }), cameras.length === 0 ? jsx("p", {
      class: "empty card",
      children: "No cameras registered yet."
    }) : jsx("ul", {
      class: "camera-grid",
      children: cameras.map((d) => jsxs("li", {
        class: "card",
        children: [jsx("h2", {
          children: jsx("a", {
            href: `/account/cameras/${d.serial}`,
            children: d.model
          })
        }), d.nickname ? jsxs("p", {
          class: "muted",
          children: ["“", d.nickname, "”"]
        }) : null, jsx("p", {
          class: "mono",
          children: d.serial
        }), jsx("p", {
          class: "muted small",
          children: d.variant_title
        }), jsxs("div", {
          class: "chips",
          children: [jsx("span", {
            class: "chip",
            children: d.firmware_version ? `Firmware ${d.firmware_version}` : "Not yet connected"
          }), d.firmware_version && d.latest_firmware && d.firmware_version !== d.latest_firmware ? jsx("span", {
            class: "chip chip-warn",
            children: "Update available"
          }) : null, jsx("span", {
            class: "chip",
            children: d.warranty_until ? `Warranty to ${d.warranty_until}` : "No warranty date"
          })]
        })]
      }))
    })]
  });
}
const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2.request);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent("/account/cameras")}`);
  const devices = await q(
    `SELECT d.serial, d.nickname, d.firmware_version, d.firmware_reported_at, d.warranty_until,
          p.title AS model, v.title AS variant_title,
          (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel='general' ORDER BY f.build DESC LIMIT 1) AS latest_firmware
   FROM device_ownership o
   JOIN device d ON d.id = o.device_id
   JOIN product p ON p.id = d.product_id
   JOIN variant v ON v.id = d.variant_id
   WHERE o.customer_id = $1 AND o.released_at IS NULL
   ORDER BY o.id DESC`,
    [customer.id]
  );
  const date = (d) => d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Cameras" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1>Cameras</h1> ${renderComponent($$result2, "CameraGrid", CameraGrid, { "client:load": true, "prefill": Astro2.url.searchParams.get("register") || "", "initial": devices.map((d) => ({
    serial: d.serial,
    nickname: d.nickname,
    model: d.model,
    variant_title: d.variant_title,
    firmware_version: d.firmware_version,
    latest_firmware: d.latest_firmware,
    warranty_until: d.warranty_until ? date(d.warranty_until) : null
  })), "client:component-hydration": "load", "client:component-path": "@components/CameraGrid.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/account/cameras/index.astro", void 0);
const $$file = "/app/src/pages/account/cameras/index.astro";
const $$url = "/account/cameras";
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

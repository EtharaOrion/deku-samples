import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute } from '../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_5xqhq6uI.mjs';
import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { r as requirePageCustomer } from '../../chunks/guard_CgiEvtXQ.mjs';
import { a as pageCart, b as apiGet } from '../../chunks/server-fetch_DBHxzT0a.mjs';
import { f as formatDateLong } from '../../chunks/app_BbZzWQ31.mjs';
/* empty css                                    */
export { renderers } from '../../renderers.mjs';

const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
function RegisterRow({
  onRegistered
}) {
  const [value, setValue] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const raw = value.replace(/[\s-]/g, "").toUpperCase();
  const shapeOk = SHAPE.test(raw);
  const complete = raw.length === 12;
  function onInput(ev) {
    const next = ev.currentTarget.value.replace(/[\s-]/g, "").toUpperCase().slice(0, 12);
    setValue(next.replace(/(.{4})(?=.)/g, "$1 ").trim());
    setError(null);
  }
  async function submit(ev) {
    ev.preventDefault();
    if (!complete || state === "working") return;
    if (!shapeOk) {
      setError("We do not recognise that serial number.");
      return;
    }
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/account/devices", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          serial: raw
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("idle");
        setError(body?.message || "That did not work.");
        return;
      }
      setState("idle");
      setValue("");
      setDone(`${body.device.model} added.`);
      setTimeout(() => setDone(null), 4e3);
      if (onRegistered) onRegistered(body.device);
      else window.location.reload();
    } catch {
      setState("idle");
      setError("That did not work.");
    }
  }
  return jsxs("form", {
    class: "register",
    onSubmit: submit,
    children: [jsxs("div", {
      class: "register__row",
      children: [jsxs("label", {
        class: "register__field",
        children: [jsx("span", {
          class: "field__label",
          children: "Register a camera"
        }), jsx("input", {
          class: "input serial",
          value,
          onInput,
          placeholder: "VA26 09KT MHX4",
          "aria-describedby": "register-help",
          "aria-invalid": error ? "true" : void 0
        })]
      }), jsx("button", {
        class: "btn",
        type: "submit",
        disabled: !complete || state === "working",
        children: state === "working" ? "Checking" : "Register"
      })]
    }), jsx("p", {
      id: "register-help",
      class: "small muted register__help",
      children: "The serial is on the underside of the camera. Twelve characters."
    }), error && jsx("div", {
      class: "notice notice--error register__msg",
      role: "alert",
      children: jsx("span", {
        class: "notice__body",
        children: error
      })
    }), done && jsx("p", {
      class: "register__done small",
      role: "status",
      children: done
    }), jsx("style", {
      children: `
        .register { margin-bottom: calc(var(--unit) * 6); }
        .register__row { display: flex; gap: calc(var(--unit) * 3); align-items: flex-end; flex-wrap: wrap; }
        .register__field { flex: 1; min-width: 16rem; }
        .register__field .input { width: 100%; }
        .register__help { margin: calc(var(--unit) * 2) 0 0; }
        .register__msg { margin-top: calc(var(--unit) * 3); }
        /* A brief confirmation that fades on its own. A notice about a price or
           an availability change never does that. */
        .register__done { color: var(--done); margin: calc(var(--unit) * 2) 0 0; }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const { customer, redirect } = await requirePageCustomer(Astro2);
  if (redirect) return redirect;
  const cart = await pageCart(Astro2);
  const res = await apiGet("/api/account/devices?page_size=100", Astro2);
  const devices = res.ok ? res.body.data : [];
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cameras \u2014 Vela", "current": "cameras", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-xzlb2mys": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-xzlb2mys> <h1 class="page-title" data-astro-cid-xzlb2mys>Cameras</h1> <p class="page-sub" data-astro-cid-xzlb2mys>Every camera registered to this account.</p> </div> ${renderComponent($$result2, "RegisterRow", RegisterRow, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/RegisterRow.jsx", "client:component-export": "default", "data-astro-cid-xzlb2mys": true })} ${devices.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-xzlb2mys> <p data-astro-cid-xzlb2mys>No cameras registered yet.</p> </div>` : renderTemplate`<ul class="camera-grid" role="list" data-astro-cid-xzlb2mys> ${devices.map((device) => renderTemplate`<li class="card camera" data-astro-cid-xzlb2mys> <div class="row row--between" data-astro-cid-xzlb2mys> <h2 class="camera__model" data-astro-cid-xzlb2mys>${device.model}</h2>  ${device.warranty_until && renderTemplate`<span class="chip chip--neutral" data-astro-cid-xzlb2mys> ${device.warranty_expired ? "Warranty ended" : `Warranty to ${formatDateLong(device.warranty_until)}`} </span>`} </div> ${device.nickname && renderTemplate`<p class="camera__nickname muted" data-astro-cid-xzlb2mys>${device.nickname}</p>`} <p class="serial camera__serial" data-astro-cid-xzlb2mys>${device.serial}</p> <div class="row camera__chips" data-astro-cid-xzlb2mys> ${device.never_connected ? renderTemplate`<span class="chip chip--neutral" data-astro-cid-xzlb2mys>Not yet connected</span>` : device.update_available ? renderTemplate`<span class="chip chip--progress" data-astro-cid-xzlb2mys>Update available</span>` : renderTemplate`<span class="chip chip--done" data-astro-cid-xzlb2mys>
Firmware <span class="version" data-astro-cid-xzlb2mys>${device.firmware_version}</span> </span>`} </div> <a class="btn btn--secondary btn--small camera__open"${addAttribute(`/account/cameras/${device.serial}`, "href")} data-astro-cid-xzlb2mys>
Open
</a> </li>`)} </ul>`}` })} `;
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

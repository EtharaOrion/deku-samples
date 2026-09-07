import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead, g as addAttribute, n as Fragment } from '../../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../chunks/Shell_xAScgdos.mjs';
import { $ as $$CameraCard } from '../../chunks/CameraCard_Cq2nTa3a.mjs';
import { useState } from 'preact/hooks';
import { g as groupSerial } from '../../chunks/format_y0Y9nLbA.mjs';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { c as currentCustomer, s as signInRedirect } from '../../chunks/server_SMyiD-DF.mjs';
import { b as registerDevice, l as listDevicesForCustomer } from '../../chunks/devices_BvEkuw7E.mjs';
/* empty css                                    */
export { renderers } from '../../renderers.mjs';

const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
function RegisterRow() {
  const [value, setValue] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);
  const raw = value.replace(/[^0-9A-Z]/g, "");
  const shapeOk = SHAPE.test(raw);
  const shapeMessage = raw.length === 12 && !shapeOk ? "We do not recognise that serial number." : null;
  async function submit(event) {
    event.preventDefault();
    if (!shapeOk || state === "working") return;
    setState("working");
    setError(null);
    setAdded(null);
    try {
      const res = await fetch("/api/account/devices", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          serial: raw
        })
      });
      const body = await res.json();
      if (!res.ok) {
        setState("error");
        setError(body.message || "That did not work.");
        return;
      }
      setState("done");
      setAdded(body);
      setValue("");
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setState("error");
      setError("That did not work. Check your connection and try again.");
    }
  }
  return jsxs("form", {
    class: "register",
    onSubmit: submit,
    children: [jsxs("div", {
      class: "field",
      children: [jsx("label", {
        for: "serial",
        children: "Register a camera"
      }), jsx("input", {
        class: "input ident",
        id: "serial",
        name: "serial",
        value,
        maxLength: 14,
        spellcheck: false,
        autocomplete: "off",
        placeholder: "VA26 09KT MHX4",
        "aria-describedby": "serial-hint",
        "aria-invalid": shapeMessage ? "true" : void 0,
        onInput: (e) => setValue(groupSerial(e.currentTarget.value))
      }), jsx("span", {
        class: "hint",
        id: "serial-hint",
        children: "Twelve characters, engraved on the underside."
      })]
    }), jsx("button", {
      type: "submit",
      class: "btn btn-primary",
      disabled: !shapeOk || state === "working",
      children: state === "working" ? "Checking" : "Register"
    }), jsxs("p", {
      class: "live",
      role: "status",
      "aria-live": "polite",
      children: [shapeMessage && jsx("span", {
        class: "error-text",
        children: shapeMessage
      }), error && jsx("span", {
        class: "error-text",
        children: error
      }), added && jsxs("span", {
        class: "added",
        children: ["Registered. ", added.model, " is on your account."]
      })]
    }), jsx("style", {
      children: `
        .register {
          display: grid;
          grid-template-columns: minmax(0, 320px) auto;
          gap: calc(var(--space) * 3);
          align-items: end;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
        }
        .live { grid-column: 1 / -1; min-height: 21px; font-size: 14px; }
        .added { animation: fade-out 400ms var(--ease) 3s forwards; }
        @keyframes fade-out { to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .added { animation: none; }
        }
        @media (max-width: 63.999rem) {
          .register { grid-template-columns: minmax(0, 1fr); }
        }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  const customer = await currentCustomer(Astro2);
  if (!customer) return signInRedirect(Astro2);
  let notice = null;
  let noticeKind = "danger";
  if (Astro2.request.method === "POST") {
    const form = await Astro2.request.formData();
    try {
      const device = await registerDevice(form.get("serial"), customer.id);
      notice = `Registered. ${device.model} is on your account.`;
      noticeKind = "done";
    } catch (err) {
      notice = err.message || "That did not work.";
    }
  }
  const PAGE_SIZE = 60;
  const rawCursor = Astro2.url.searchParams.get("after");
  const afterId = /^[0-9]+$/.test(rawCursor || "") ? rawCursor : null;
  let devices = [];
  let hasMore = false;
  let nextCursor = null;
  let failed = false;
  try {
    const rows = await listDevicesForCustomer(customer.id, {
      afterId,
      limit: PAGE_SIZE + 1
    });
    hasMore = rows.length > PAGE_SIZE;
    devices = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    if (hasMore && devices.length) nextCursor = String(devices[devices.length - 1].id);
  } catch {
    failed = true;
  }
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Cameras \u2014 Vela", "description": "The cameras on your account.", "data-astro-cid-xzlb2mys": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-xzlb2mys> <header class="stack stack-2" data-astro-cid-xzlb2mys> <h1 data-astro-cid-xzlb2mys>Your cameras</h1> <p class="hint" data-astro-cid-xzlb2mys>A camera is a record in its own right. Registering one links it to this account.</p> </header> ${notice && renderTemplate`<p${addAttribute(["notice", noticeKind === "done" ? "notice-done" : "notice-danger"], "class:list")} role="alert" data-astro-cid-xzlb2mys> ${notice} </p>`} <!-- Registration happens in place at the top of the grid. --> ${renderComponent($$result2, "RegisterRow", RegisterRow, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/RegisterRow.jsx", "client:component-export": "default", "data-astro-cid-xzlb2mys": true })} <noscript> <form method="post" class="ns-form" data-astro-cid-xzlb2mys> <label for="ns-serial" data-astro-cid-xzlb2mys>Serial number</label> <input class="input ident" id="ns-serial" name="serial" required maxlength="14" data-astro-cid-xzlb2mys> <button class="btn" type="submit" data-astro-cid-xzlb2mys>Register</button> </form> </noscript> ${failed ? renderTemplate`<p class="notice notice-danger" data-astro-cid-xzlb2mys>We could not load your cameras. Reload the page to try again.</p>` : devices.length === 0 ? renderTemplate`<div class="card empty" data-astro-cid-xzlb2mys> <p data-astro-cid-xzlb2mys>No cameras registered yet.</p> <p class="hint" data-astro-cid-xzlb2mys>The serial is engraved on the underside of the camera.</p> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-xzlb2mys": true }, { "default": async ($$result3) => renderTemplate` <ul class="grid" data-astro-cid-xzlb2mys> ${devices.map((device) => renderTemplate`<li data-astro-cid-xzlb2mys>${renderComponent($$result3, "CameraCard", $$CameraCard, { "device": device, "data-astro-cid-xzlb2mys": true })}</li>`)} </ul> ${hasMore && renderTemplate`<p data-astro-cid-xzlb2mys><a class="btn"${addAttribute(`/account/cameras?after=${nextCursor}`, "href")} data-astro-cid-xzlb2mys>More cameras</a></p>`}${afterId && renderTemplate`<p data-astro-cid-xzlb2mys><a href="/account/cameras" data-astro-cid-xzlb2mys>Back to the first</a></p>`}` })}`} </div> ` })} `;
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

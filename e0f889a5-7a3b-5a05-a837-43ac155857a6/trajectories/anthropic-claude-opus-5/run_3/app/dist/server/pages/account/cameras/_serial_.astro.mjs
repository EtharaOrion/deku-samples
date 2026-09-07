import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../../../chunks/Shell_5xqhq6uI.mjs';
import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { r as requirePageCustomer } from '../../../chunks/guard_CgiEvtXQ.mjs';
import { a as pageCart, b as apiGet } from '../../../chunks/server-fetch_DBHxzT0a.mjs';
import { f as formatDateLong } from '../../../chunks/app_BbZzWQ31.mjs';
/* empty css                                          */
export { renderers } from '../../../renderers.mjs';

function CameraActions({
  serial,
  nickname
}) {
  const [name, setName] = useState(nickname ?? "");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function rename(ev) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/devices/${encodeURIComponent(serial)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          nickname: name
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || "That did not work.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3e3);
    } catch {
      setError("That did not work.");
    } finally {
      setBusy(false);
    }
  }
  async function release() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/devices/${encodeURIComponent(serial)}`, {
        method: "DELETE"
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || "That did not work.");
        setBusy(false);
        return;
      }
      window.location.assign("/account/cameras");
    } catch {
      setError("That did not work.");
      setBusy(false);
    }
  }
  return jsxs("div", {
    class: "actions",
    children: [error && jsx("div", {
      class: "notice notice--error",
      role: "alert",
      children: jsx("span", {
        class: "notice__body",
        children: error
      })
    }), jsxs("form", {
      class: "panel",
      onSubmit: rename,
      children: [jsx("h2", {
        class: "section-title",
        children: "Name this camera"
      }), jsxs("label", {
        class: "field",
        children: [jsx("span", {
          class: "field__label",
          children: "Nickname"
        }), jsx("input", {
          class: "input",
          value: name,
          onInput: (e) => setName(e.currentTarget.value),
          placeholder: "The one with the dented plate"
        })]
      }), jsx("button", {
        class: "btn btn--secondary",
        type: "submit",
        disabled: busy,
        children: "Save name"
      }), saved && jsx("p", {
        class: "small saved",
        role: "status",
        children: "Saved."
      })]
    }), jsxs("section", {
      class: "panel",
      children: [jsx("h2", {
        class: "section-title",
        children: "Remove from my account"
      }), jsx("p", {
        class: "muted small",
        children: "This releases the camera without giving it to anyone. Do this when you sell it to a stranger. The camera keeps working and stays repairable."
      }), !confirming ? jsx("button", {
        class: "btn btn--secondary",
        type: "button",
        onClick: () => setConfirming(true),
        children: "Remove from my account"
      }) : jsxs("div", {
        class: "confirm",
        role: "group",
        "aria-label": "Confirm removal",
        onKeyDown: (e) => {
          if (e.key === "Escape") setConfirming(false);
        },
        children: [jsx("p", {
          class: "strong",
          children: "Remove this camera from your account?"
        }), jsxs("div", {
          class: "row",
          children: [jsx("button", {
            class: "btn",
            type: "button",
            onClick: release,
            disabled: busy,
            children: busy ? "Removing" : "Yes, remove it"
          }), jsx("button", {
            class: "btn btn--secondary",
            type: "button",
            onClick: () => setConfirming(false),
            disabled: busy,
            children: "Keep it"
          })]
        })]
      })]
    }), jsxs("section", {
      class: "panel",
      children: [jsx("h2", {
        class: "section-title",
        children: "Hand this camera to someone else"
      }), jsx("p", {
        class: "muted small",
        children: "Remove it from your account first. The next owner registers it with their own account using the serial on the underside. We do not move a camera between accounts for you."
      })]
    }), jsx("style", {
      children: `
        .actions > * + * { margin-top: calc(var(--unit) * 4); }
        .saved { color: var(--done); margin: calc(var(--unit) * 2) 0 0; }
        .confirm {
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          padding: calc(var(--unit) * 3);
        }
        .confirm p { margin: 0 0 calc(var(--unit) * 3); }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const { serial } = Astro2.params;
  const { customer, redirect } = await requirePageCustomer(Astro2);
  if (redirect) return redirect;
  const cart = await pageCart(Astro2);
  const res = await apiGet(`/api/account/devices/${encodeURIComponent(serial)}`, Astro2);
  if (!res.ok) return new Response(null, { status: 404 });
  const device = res.body.device;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": `${device.model} \u2014 Vela`, "current": "cameras", "customer": customer, "cartCount": cart?.item_count ?? 0, "data-astro-cid-nd76frh6": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<nav class="crumbs small" aria-label="Breadcrumb" data-astro-cid-nd76frh6> <a href="/account/cameras" data-astro-cid-nd76frh6>Cameras</a> <span aria-hidden="true" data-astro-cid-nd76frh6>/</span> <span aria-current="page" class="serial" data-astro-cid-nd76frh6>${device.serial}</span> </nav> <div class="page-head" data-astro-cid-nd76frh6> <h1 class="page-title" data-astro-cid-nd76frh6>${device.model}</h1> ${device.nickname && renderTemplate`<p class="page-sub" data-astro-cid-nd76frh6>${device.nickname}</p>`} </div> <div class="camera-detail" data-astro-cid-nd76frh6> <section class="panel" data-astro-cid-nd76frh6> <h2 class="section-title" data-astro-cid-nd76frh6>This camera</h2> <table class="table" data-astro-cid-nd76frh6> <tbody data-astro-cid-nd76frh6> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Serial</th> <td class="right serial" data-astro-cid-nd76frh6>${device.serial}</td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Colour</th> <td class="right" data-astro-cid-nd76frh6>${device.option_value ?? "\u2014"}</td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Firmware</th> <td class="right" data-astro-cid-nd76frh6> ${device.firmware_version ? renderTemplate`<span class="version" data-astro-cid-nd76frh6>${device.firmware_version}</span>` : "Not yet connected"} </td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Latest firmware</th> <td class="right" data-astro-cid-nd76frh6> <span class="version" data-astro-cid-nd76frh6>${device.latest_firmware_version ?? "\u2014"}</span> </td> </tr> <tr data-astro-cid-nd76frh6> <th scope="row" data-astro-cid-nd76frh6>Warranty</th> <td class="right" data-astro-cid-nd76frh6> ${device.warranty_until ? formatDateLong(device.warranty_until) : "\u2014"} </td> </tr> </tbody> </table> <div class="row camera-detail__chips" data-astro-cid-nd76frh6> ${device.never_connected ? renderTemplate`<span class="chip chip--neutral" data-astro-cid-nd76frh6>Not yet connected</span>` : device.update_available ? renderTemplate`<span class="chip chip--progress" data-astro-cid-nd76frh6>Update available</span>` : renderTemplate`<span class="chip chip--done" data-astro-cid-nd76frh6>Up to date</span>`} ${device.warranty_expired && renderTemplate`<span class="chip chip--neutral" data-astro-cid-nd76frh6>Warranty ended</span>`} </div> ${device.update_available && renderTemplate`<p class="small muted" data-astro-cid-nd76frh6>
Update it with Arranger, or use the <a href="/doctor" data-astro-cid-nd76frh6>firmware installer</a> if
            Arranger cannot see it.
</p>`} </section> ${renderComponent($$result2, "CameraActions", CameraActions, { "client:load": true, "serial": device.serial, "nickname": device.nickname, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CameraActions.jsx", "client:component-export": "default", "data-astro-cid-nd76frh6": true })} </div> ` })} `;
}, "/app/src/pages/account/cameras/[serial].astro", void 0);

const $$file = "/app/src/pages/account/cameras/[serial].astro";
const $$url = "/account/cameras/[serial]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$serial,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

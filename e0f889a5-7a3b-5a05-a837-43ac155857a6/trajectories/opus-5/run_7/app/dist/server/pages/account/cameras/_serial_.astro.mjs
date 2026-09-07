import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../../../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { a as api, b as announce, v as viewer, s as signInRedirect, $ as $$Shell } from '../../../chunks/page_CERy5BG_.mjs';
import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
import { a as apiGet, f as formatDate } from '../../../chunks/api_D4zreuKm.mjs';
export { renderers } from '../../../renderers.mjs';

function CameraDetail({
  device
}) {
  const [nickname, setNickname] = useState(device.nickname || "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const rename = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/account/devices/${encodeURIComponent(device.serial)}`, {
        method: "PATCH",
        body: {
          nickname: nickname.trim() || null
        },
        auth: true
      });
      setSaved(true);
      announce("The name was saved.");
      setTimeout(() => setSaved(false), 3e3);
    } catch (err) {
      setError(err.message);
    }
  };
  const release = async () => {
    setError(null);
    try {
      await api(`/account/devices/${encodeURIComponent(device.serial)}`, {
        method: "DELETE",
        auth: true
      });
      window.location.assign("/account/cameras");
    } catch (err) {
      setConfirming(false);
      setError(err.message);
    }
  };
  return jsxs("div", {
    children: [jsxs("section", {
      class: "section",
      "aria-labelledby": "name-h",
      children: [jsx("h2", {
        class: "section-title",
        id: "name-h",
        children: "Name"
      }), jsxs("form", {
        onSubmit: rename,
        style: "max-width:26rem",
        children: [jsxs("label", {
          class: "field",
          children: [jsx("span", {
            class: "label",
            children: "What you call this camera"
          }), jsx("input", {
            class: "input",
            value: nickname,
            onInput: (e) => setNickname(e.currentTarget.value),
            maxLength: 60,
            placeholder: device.model
          }), jsx("span", {
            class: "field-hint",
            children: "Only you see this."
          })]
        }), jsx("button", {
          type: "submit",
          class: "btn btn-secondary",
          children: "Save the name"
        }), saved && jsx("p", {
          class: "small",
          style: "margin-top:calc(var(--unit)*2);color:var(--done)",
          children: "The name was saved."
        })]
      })]
    }), jsxs("section", {
      class: "section",
      "aria-labelledby": "release-h",
      children: [jsx("h2", {
        class: "section-title",
        id: "release-h",
        children: "Removing this camera"
      }), jsxs("div", {
        style: "max-width:52rem",
        children: [jsxs("p", {
          class: "small",
          style: "margin-bottom:calc(var(--unit)*4)",
          children: [jsx("strong", {
            children: "Remove from my account"
          }), " releases the camera without giving it to anyone. It is what you do when you sell it to a stranger: they can then register it themselves."]
        }), jsxs("p", {
          class: "small muted",
          style: "margin-bottom:calc(var(--unit)*5)",
          children: [jsx("strong", {
            children: "Hand this camera to someone else"
          }), " is a different action and we do not offer it here. Remove it, then give them the serial number."]
        }), error && jsx("p", {
          class: "field-error",
          role: "alert",
          style: "margin-bottom:calc(var(--unit)*3)",
          children: error
        }), confirming ? jsxs("div", {
          class: "notice notice-danger",
          role: "alertdialog",
          "aria-label": "Confirm removal",
          tabIndex: -1,
          onKeyDown: (e) => {
            if (e.key === "Escape") setConfirming(false);
          },
          children: [jsxs("p", {
            style: "font-weight:700",
            children: ["Remove ", device.serial, " from your account?"]
          }), jsx("p", {
            class: "small",
            style: "margin-top:var(--unit)",
            children: "This releases the camera and grants it to nobody. You can register it again later."
          }), jsxs("div", {
            class: "row",
            style: "gap:calc(var(--unit)*3);margin-top:calc(var(--unit)*3)",
            children: [jsx("button", {
              type: "button",
              class: "btn",
              onClick: release,
              children: "Remove it from my account"
            }), jsx("button", {
              type: "button",
              class: "btn btn-secondary",
              onClick: () => setConfirming(false),
              children: "Keep it"
            })]
          })]
        }) : jsx("button", {
          type: "button",
          class: "btn btn-secondary",
          onClick: () => setConfirming(true),
          children: "Remove from my account"
        })]
      })]
    })]
  });
}

const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const v = await viewer(Astro2);
  if (!v.signedIn) return signInRedirect(Astro2);
  const { serial } = Astro2.params;
  const res = await apiGet(Astro2.request, `/account/devices/${encodeURIComponent(serial)}`, { token: v.token });
  const device = res.ok ? res.data.device : null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": device ? `${device.serial} \u2014 Vela` : "Camera \u2014 Vela", "signedIn": true, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate`${!device ? renderTemplate`${maybeRenderHead()}<div> <h1 class="page-title">We do not recognise that serial number.</h1> <p class="page-lede">It may not be registered to this account.</p> <p><a class="btn btn-secondary" href="/account/cameras">Your cameras</a></p> </div>` : renderTemplate`<div> <nav aria-label="Breadcrumb" class="small muted" style="margin-bottom:calc(var(--unit)*4)"> <a href="/account/cameras">Cameras</a> <span aria-hidden="true">/</span> <span class="serial">${device.serial}</span> </nav> <h1 class="page-title">${device.nickname || device.model}</h1> <p class="page-lede"> ${device.model} — ${device.option_value}, serial <span class="serial">${device.serial}</span> </p> <section class="section"> <table class="data" style="max-width:46rem"> <tbody> <tr> <th scope="row" style="font-weight:400">Firmware</th> <td> ${device.firmware_version ? renderTemplate`<span> <span class="version">${device.firmware_version}</span> ${device.update_available && renderTemplate`<span class="chip chip-progress" style="margin-inline-start:calc(var(--unit)*2)">Update available</span>`} </span>` : renderTemplate`<span class="chip">Not yet connected</span>`} </td> </tr> <tr> <th scope="row" style="font-weight:400">Latest firmware</th> <td class="version">${device.latest_firmware || "\u2014"}</td> </tr> <tr> <th scope="row" style="font-weight:400">Last heard from</th> <td class="tnum">${device.firmware_reported_at ? formatDate(device.firmware_reported_at) : "Never"}</td> </tr> <tr> <th scope="row" style="font-weight:400">Warranty</th> <td> ${device.warranty_until ? renderTemplate`<span class="chip"> ${device.warranty_expired ? "Warranty ended" : `To ${formatDate(device.warranty_until)}`} </span>` : "\u2014"} </td> </tr> </tbody> </table> ${device.update_available && renderTemplate`<p style="margin-top:calc(var(--unit)*5)"> <a class="btn btn-secondary" href="/downloads">Get the firmware</a> <a class="btn-quiet" href="/doctor" style="margin-inline-start:calc(var(--unit)*3)">
Or install it from this browser
</a> </p>`} </section> ${renderComponent($$result2, "CameraDetail", CameraDetail, { "client:load": true, "device": device, "client:component-hydration": "load", "client:component-path": "/app/src/islands/CameraDetail.jsx", "client:component-export": "default" })} </div>`}` })}`;
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

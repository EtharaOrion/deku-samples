import { c as createComponent, d as renderComponent, r as renderTemplate, b as createAstro } from "../../../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../../../chunks/App_CiTDO3Su.mjs";
import { one } from "../../../chunks/index_CC0DBeZe.mjs";
import { currentCustomer } from "../../../chunks/session_C_3CDjrl.mjs";
import { useState } from "preact/hooks";
import { jsxs, jsx, Fragment } from "preact/jsx-runtime";
import { renderers } from "../../../renderers.mjs";
function CameraDetail({
  camera
}) {
  const [nickname, setNickname] = useState(camera.nickname || "");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("vela_token") : null;
  const headers = {
    "Content-Type": "application/json",
    ...token ? {
      Authorization: `Bearer ${token}`
    } : {}
  };
  const call = (path, method, body) => fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
  const rename = async () => {
    setErr(null);
    setMsg(null);
    const res = await call(`/api/account/devices/${camera.serial}`, "PATCH", {
      nickname
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(body?.error?.message || "That did not work.");
      return;
    }
    setMsg("Renamed.");
  };
  const remove = async () => {
    if (!window.confirm("Remove this camera from your account? It is not given to anyone.")) return;
    const res = await call(`/api/account/devices/${camera.serial}`, "DELETE");
    if (res.ok) window.location.href = "/account/cameras";
  };
  const handOver = async () => {
    if (!window.confirm("Release this camera so someone else can register it?")) return;
    const res = await call(`/api/account/devices/${camera.serial}`, "DELETE");
    if (res.ok) window.location.href = "/account/cameras";
  };
  return jsxs("div", {
    class: "camera-detail",
    children: [jsxs("nav", {
      class: "crumbs",
      children: [jsx("a", {
        href: "/account/cameras",
        children: "Cameras"
      }), " / ", jsx("span", {
        class: "mono",
        children: camera.serial
      })]
    }), jsx("h1", {
      children: camera.model
    }), jsxs("p", {
      class: "muted",
      children: [camera.variant_title, ". Serial ", jsx("span", {
        class: "mono",
        children: camera.serial
      }), "."]
    }), jsxs("dl", {
      class: "dl",
      children: [jsx("dt", {
        children: "Firmware"
      }), jsx("dd", {
        class: "mono",
        children: camera.firmware_version || "Not yet connected"
      }), camera.firmware_version && camera.latest_firmware && camera.firmware_version !== camera.latest_firmware ? jsxs(Fragment, {
        children: [jsx("dt", {
          children: "Newer firmware"
        }), jsxs("dd", {
          children: [jsx("span", {
            class: "chip chip-warn",
            children: "Update available"
          }), " ", jsx("span", {
            class: "mono",
            children: camera.latest_firmware
          })]
        })]
      }) : null, jsx("dt", {
        children: "Warranty"
      }), jsx("dd", {
        children: camera.warranty_until ? new Date(camera.warranty_until).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "No date"
      }), jsx("dt", {
        children: "Last heard from"
      }), jsx("dd", {
        children: camera.firmware_reported_at ? new Date(camera.firmware_reported_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric"
        }) : "Never"
      })]
    }), jsxs("div", {
      class: "row",
      children: [jsx("label", {
        for: "nickname",
        children: "Nickname"
      }), jsx("input", {
        id: "nickname",
        value: nickname,
        onInput: (e) => setNickname(e.target.value)
      }), jsx("button", {
        class: "btn",
        onClick: rename,
        children: "Rename"
      })]
    }), msg ? jsx("p", {
      class: "ok-text",
      role: "status",
      children: msg
    }) : null, err ? jsx("p", {
      class: "error-text",
      role: "alert",
      children: err
    }) : null, jsxs("div", {
      class: "actions",
      children: [jsx("button", {
        class: "btn btn-danger",
        onClick: remove,
        children: "Remove from my account"
      }), jsx("p", {
        class: "muted small",
        children: "Removing releases the camera without giving it to anyone. It is what you do when you sell it to a stranger."
      }), jsx("button", {
        class: "btn",
        onClick: handOver,
        children: "Hand this camera to someone else"
      }), jsx("p", {
        class: "muted small",
        children: "Handing over ends your link so the next owner can register the same serial."
      })]
    })]
  });
}
const $$Astro = createAstro();
const $$serial = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$serial;
  const customer = await currentCustomer(Astro2.request);
  if (!customer) return Astro2.redirect(`/sign-in?redirect=${encodeURIComponent("/account/cameras")}`);
  const serial = String(Astro2.params.serial || "").toUpperCase();
  const dev = await one(
    `SELECT d.*, p.title AS model, v.title AS variant_title,
          (SELECT f.version FROM firmware f WHERE f.product_id = d.product_id AND f.channel='general' ORDER BY f.build DESC LIMIT 1) AS latest_firmware
   FROM device d JOIN product p ON p.id = d.product_id JOIN variant v ON v.id = d.variant_id
   WHERE upper(d.serial) = $1`,
    [serial]
  );
  const own = await one(
    "SELECT id FROM device_ownership WHERE device_id = $1 AND customer_id = $2 AND released_at IS NULL",
    [dev?.id ?? -1, customer.id]
  );
  if (!dev || !own) return Astro2.redirect("/404");
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": dev.model }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "CameraDetail", CameraDetail, { "client:load": true, "camera": {
    serial: dev.serial,
    model: dev.model,
    variant_title: dev.variant_title,
    nickname: dev.nickname,
    firmware_version: dev.firmware_version,
    latest_firmware: dev.latest_firmware,
    warranty_until: dev.warranty_until,
    firmware_reported_at: dev.firmware_reported_at
  }, "client:component-hydration": "load", "client:component-path": "@components/CameraDetail.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/account/cameras/[serial].astro", void 0);
const $$file = "/app/src/pages/account/cameras/[serial].astro";
const $$url = "/account/cameras/[serial]";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$serial,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};

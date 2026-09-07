import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_5xqhq6uI.mjs';
import { useState, useRef, useEffect } from 'preact/hooks';
import { jsxs, jsx, Fragment } from 'preact/jsx-runtime';
import { p as pageCustomer, a as pageCart } from '../chunks/server-fetch_DBHxzT0a.mjs';
export { renderers } from '../renderers.mjs';

function Doctor() {
  const [supported, setSupported] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [serial, setSerial] = useState("");
  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [percent, setPercent] = useState(0);
  const [finalVersion, setFinalVersion] = useState(null);
  const [failure, setFailure] = useState(null);
  const announced = useRef(-1);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    setSupported("serial" in navigator || "usb" in navigator);
  }, []);
  useEffect(() => {
    if (phase !== "writing") return;
    const decade = Math.floor(percent / 20) * 20;
    if (decade !== announced.current && decade > 0) {
      announced.current = decade;
      setAnnouncement(`Writing, ${decade} percent.`);
    }
  }, [percent, phase]);
  async function connect() {
    setError(null);
    setStatus("Looking for a camera.");
    const clean = serial.replace(/[\s-]/g, "").toUpperCase();
    try {
      const res = await fetch(`/api/firmware/for-serial/${encodeURIComponent(clean)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("");
        setError(body?.message || "We do not recognise that serial number.");
        return;
      }
      setDevice(body.device);
      setImages(body.entries);
      setRecommended(body.recommended);
      setPhase("connected");
      setStatus(`${body.device.model}, serial ${body.device.serial}, currently running ${body.device.firmware_version ?? "an unknown version"}`);
    } catch {
      setStatus("");
      setError("That did not work.");
    }
  }
  async function write(entry) {
    setError(null);
    setFailure(null);
    setPercent(0);
    announced.current = -1;
    let session;
    try {
      const res = await fetch("/api/flash-sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          serial: device.serial,
          target_build: entry.build,
          reported_version: device.firmware_version
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || "That did not work.");
        return;
      }
      session = body.session;
    } catch {
      setError("That did not work.");
      return;
    }
    setPhase("writing");
    setStatus("Writing.");
    const total = entry.size_bytes;
    let written = 0;
    const block = Math.ceil(total / 20);
    const tick = async () => {
      written = Math.min(total, written + block);
      setPercent(Math.floor(written / total * 100));
      if (written < total) {
        setTimeout(tick, 120);
      } else {
        try {
          const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              reported_version: entry.version
            })
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            setPhase("failed");
            setFailure({
              present: true
            });
            setError(body?.message || "That did not work.");
            return;
          }
          setFinalVersion(body.device.firmware_version);
          setPhase("done");
          setStatus(`Done. Your camera is running ${body.device.firmware_version}.`);
          setAnnouncement(`Done. Your camera is running ${body.device.firmware_version}.`);
        } catch {
          setPhase("failed");
          setFailure({
            present: false
          });
        }
      }
    };
    setTimeout(tick, 120);
  }
  return jsxs("div", {
    class: "doctor",
    children: [jsx("p", {
      class: "visually-hidden",
      role: "status",
      "aria-live": "polite",
      children: announcement || status
    }), jsxs("ol", {
      class: "doctor__steps",
      children: [jsxs("li", {
        class: "doctor__step",
        children: [jsx("h2", {
          class: "section-title",
          children: "1. Can this browser do it"
        }), supported === null ? jsx("p", {
          class: "skeleton doctor__skeleton"
        }) : supported ? jsx("p", {
          children: "This browser can talk to a camera over a cable."
        }) : jsxs(Fragment, {
          children: [jsx("p", {
            children: "This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can."
          }), jsxs("p", {
            class: "muted",
            children: ["Use Arranger instead: ", jsx("a", {
              href: "/downloads",
              children: "Downloads"
            }), "."]
          })]
        })]
      }), supported && jsxs(Fragment, {
        children: [jsxs("li", {
          class: "doctor__step",
          children: [jsx("h2", {
            class: "section-title",
            children: "2. Read this first"
          }), jsx("div", {
            class: "warning",
            tabIndex: 0,
            role: "group",
            "aria-label": "Before you start",
            children: jsx("p", {
              children: "This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in."
            })
          }), jsx("button", {
            type: "button",
            class: "btn btn--secondary",
            onClick: () => setUnderstood(true),
            disabled: understood,
            children: understood ? "Understood" : "I understand"
          })]
        }), jsxs("li", {
          class: "doctor__step",
          children: [jsx("h2", {
            class: "section-title",
            children: "3. Connect your camera"
          }), jsxs("label", {
            class: "field",
            children: [jsx("span", {
              class: "field__label",
              children: "Serial number"
            }), jsx("input", {
              class: "input serial",
              value: serial,
              onInput: (e) => setSerial(e.currentTarget.value),
              placeholder: "VC26 09PV DA7Q",
              disabled: !understood,
              "aria-describedby": !understood ? "connect-reason" : void 0
            })]
          }), jsx("button", {
            type: "button",
            class: "btn",
            onClick: connect,
            disabled: !understood || serial.replace(/[\s-]/g, "").length !== 12,
            "aria-describedby": !understood ? "connect-reason" : void 0,
            children: "Connect"
          }), !understood && jsx("p", {
            id: "connect-reason",
            class: "small muted doctor__reason",
            children: "Read the warning above and choose I understand first."
          }), error && phase !== "writing" && jsx("div", {
            class: "notice notice--error doctor__error",
            role: "alert",
            children: jsx("span", {
              class: "notice__body",
              children: error
            })
          })]
        })]
      }), device && phase !== "idle" && jsxs("li", {
        class: "doctor__step",
        children: [jsx("h2", {
          class: "section-title",
          children: "4. Choose the firmware"
        }), jsxs("p", {
          class: "doctor__device",
          children: [device.model, ", serial ", jsx("span", {
            class: "serial",
            children: device.serial
          }), ", currently running", " ", jsx("span", {
            class: "version",
            children: device.firmware_version ?? "an unknown version"
          })]
        }), phase === "connected" && jsxs(Fragment, {
          children: [recommended ? jsxs("div", {
            class: "row",
            children: [jsxs("button", {
              type: "button",
              class: "btn",
              onClick: () => write(images.find((i) => i.build === recommended.build) ?? recommended),
              children: ["Install firmware ", recommended.version]
            }), jsx("span", {
              class: "small muted",
              children: "Recommended for this camera."
            })]
          }) : jsx("p", {
            class: "muted",
            children: "There is no firmware this camera can take right now."
          }), jsxs("details", {
            class: "doctor__others",
            children: [jsx("summary", {
              children: "Other versions"
            }), jsx("ul", {
              class: "doctor__list",
              role: "list",
              children: images.map((entry) => jsxs("li", {
                class: "doctor__image",
                children: [jsx("span", {
                  class: "version",
                  children: entry.version
                }), jsxs("span", {
                  class: "small faint build",
                  children: [" build ", entry.build]
                }), entry.eligible ? jsx("button", {
                  type: "button",
                  class: "btn btn--secondary btn--small",
                  onClick: () => write(entry),
                  children: "Install"
                }) : (
                  // Refuses plainly and with the reason.
                  jsxs("span", {
                    class: "small muted",
                    children: ["Needs firmware ", entry.min_firmware, " or later. This camera reports", " ", device.firmware_version ?? "nothing", "."]
                  })
                )]
              }, entry.build))
            })]
          })]
        }), phase === "writing" && jsxs("div", {
          class: "doctor__writing",
          children: [jsxs("p", {
            class: "strong",
            children: ["Writing, ", percent, "%. Do not unplug your camera."]
          }), jsx("div", {
            class: "meter",
            role: "progressbar",
            "aria-valuenow": percent,
            "aria-valuemin": "0",
            "aria-valuemax": "100",
            "aria-label": "Firmware write",
            children: jsx("div", {
              class: "meter__fill",
              style: {
                width: `${percent}%`
              }
            })
          })]
        }), phase === "done" && jsx("div", {
          class: "notice notice--done",
          role: "status",
          children: jsxs("span", {
            class: "notice__body",
            children: ["Done. Your camera is running ", finalVersion, "."]
          })
        }), phase === "failed" && jsx("div", {
          class: "notice notice--error",
          role: "alert",
          children: jsx("span", {
            class: "notice__body",
            children: failure?.present ? "Your camera is still working and you can try again." : "The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."
          })
        })]
      })]
    }), jsx("style", {
      children: `
        .doctor__steps { list-style: none; margin: 0; padding: 0; }
        .doctor__step {
          padding: calc(var(--unit) * 5) 0;
          border-bottom: var(--border-w) solid var(--line);
        }
        .doctor__skeleton { height: 24px; width: 60%; }
        .warning {
          border: var(--border-w) solid var(--progress);
          color: var(--progress);
          border-radius: var(--radius);
          padding: calc(var(--unit) * 3);
          margin-bottom: calc(var(--unit) * 4);
        }
        .warning p { color: var(--fg); margin: 0; }
        .doctor__reason { margin-top: calc(var(--unit) * 2); }
        .doctor__error { margin-top: calc(var(--unit) * 3); }
        .doctor__device { margin: 0 0 calc(var(--unit) * 4); }
        .doctor__others { margin-top: calc(var(--unit) * 4); }
        .doctor__list { list-style: none; margin: calc(var(--unit) * 3) 0 0; padding: 0; }
        .doctor__image {
          display: flex; align-items: center; gap: calc(var(--unit) * 3);
          padding: calc(var(--unit) * 2) 0;
          border-bottom: var(--border-w) solid var(--line);
        }
        .doctor__writing { margin-top: calc(var(--unit) * 3); }
        .meter {
          height: 8px; background: var(--surface-sunken);
          border-radius: var(--radius); overflow: hidden;
          border: var(--border-w) solid var(--line);
        }
        .meter__fill {
          height: 100%; background: var(--progress);
          transition: width var(--speed) var(--ease);
        }
      `
    })]
  });
}

const $$Astro = createAstro();
const $$Doctor = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Doctor;
  const customer = await pageCustomer(Astro2);
  const cart = await pageCart(Astro2);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer \u2014 Vela", "description": "Write firmware to a camera Arranger cannot reach.", "current": "doctor", "customer": customer, "cartCount": cart?.item_count ?? 0 }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head"> <h1 class="page-title">Firmware installer</h1> <p class="page-sub">
This writes firmware to a camera over a cable. Use it when Arranger cannot see your camera.
      We repair a camera whether or not it is in warranty, and whether or not you were the person
      who bought it.
</p> </div> ${renderComponent($$result2, "Doctor", Doctor, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/Doctor.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/doctor.astro", void 0);

const $$file = "/app/src/pages/doctor.astro";
const $$url = "/doctor";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Doctor,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };

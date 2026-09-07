import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_Dku1auYb.mjs';
import 'piccolore';
import { $ as $$Shell } from '../chunks/Shell_xAScgdos.mjs';
import { useState, useRef, useEffect } from 'preact/hooks';
import { g as groupSerial, b as formatBytes } from '../chunks/format_y0Y9nLbA.mjs';
import { jsxs, jsx, Fragment } from 'preact/jsx-runtime';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

function Doctor() {
  const [supported, setSupported] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [serial, setSerial] = useState("");
  const [device, setDevice] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [lookupError, setLookupError] = useState(null);
  const [looking, setLooking] = useState(false);
  const [choice, setChoice] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const announced = useRef(-1);
  useEffect(() => {
    setSupported("usb" in navigator || "serial" in navigator);
  }, []);
  async function identify(event) {
    event?.preventDefault();
    const value = serial.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    setLookupError(null);
    setRefusal(null);
    setDevice(null);
    setLooking(true);
    setStatus("Looking for that camera.");
    try {
      const res = await fetch(`/api/firmware/device/${encodeURIComponent(value)}`, {
        credentials: "same-origin"
      });
      const body = await res.json();
      if (!res.ok) {
        setLookupError(body.message || "We do not recognise that serial number.");
        setStatus("That camera was not found.");
        return;
      }
      setDevice(body.device);
      setManifest(body.manifest.entries || []);
      const recommended2 = (body.manifest.entries || [])[0];
      setChoice(recommended2 ? recommended2.build : null);
      setStatus(`Found ${body.device.model}, running ${body.device.firmware_version || "an unknown version"}.`);
    } catch {
      setLookupError("That did not work. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  }
  async function write() {
    if (!device || !choice || phase === "writing") return;
    setRefusal(null);
    setPhase("starting");
    setStatus("Starting.");
    setPercent(0);
    let session;
    try {
      const res = await fetch("/api/flash-sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          serial: device.serial,
          target_build: choice
        })
      });
      session = await res.json();
      if (!res.ok) {
        setRefusal(session.message || "That image cannot go on this camera.");
        setPhase("idle");
        setStatus("That image was refused.");
        return;
      }
    } catch {
      setRefusal("That did not work. Check your connection and try again.");
      setPhase("idle");
      return;
    }
    setPhase("writing");
    const target = manifest.find((e) => e.build === choice);
    const total = target ? target.size_bytes : 0;
    let written = 0;
    const block = Math.max(1, Math.floor(total / 40));
    while (written < total) {
      await new Promise((r) => setTimeout(r, 55));
      written = Math.min(total, written + block);
      const pct = Math.floor(written / total * 100);
      setPercent(pct);
      if (pct - announced.current >= 20 || pct === 100) {
        announced.current = pct;
        setStatus(`Writing, ${pct} percent.`);
      }
    }
    try {
      const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        // The version the device reports back, which is what gets recorded.
        body: JSON.stringify({
          reported_version: target.version
        })
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase("failed");
        setResult({
          ok: false,
          present: true,
          message: body.message
        });
        setStatus("The write did not finish.");
        return;
      }
      setPhase("done");
      setResult({
        ok: true,
        version: body.reported_version
      });
      setStatus(`Done. Your camera is running ${body.reported_version}.`);
    } catch {
      await fetch(`/api/flash-sessions/${session.id}/fail`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          reason: "disconnected"
        })
      }).catch(() => {
      });
      setPhase("failed");
      setResult({
        ok: false,
        present: false
      });
      setStatus("The camera disconnected.");
    }
  }
  const recommended = manifest[0];
  const others = manifest.slice(1);
  return jsxs("div", {
    class: "doctor",
    children: [jsx("p", {
      class: "live",
      role: "status",
      "aria-live": "polite",
      children: status
    }), jsxs("ol", {
      class: "steps",
      children: [jsxs("li", {
        class: "step",
        children: [jsxs("h2", {
          children: [jsx("span", {
            class: "n tnum",
            children: "1"
          }), " Can this browser talk to your camera"]
        }), supported === null ? jsx("p", {
          class: "skeleton line",
          "aria-hidden": "true"
        }) : supported ? jsx("p", {
          children: "This browser can talk to a camera over USB. Keep the camera plugged in."
        }) : jsxs(Fragment, {
          children: [jsx("p", {
            children: "This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can."
          }), jsxs("p", {
            children: ["You can also use Arranger, which does the same job. ", jsx("a", {
              href: "/downloads",
              children: "Get Arranger"
            }), "."]
          })]
        })]
      }), jsxs("li", {
        class: "step",
        children: [jsxs("h2", {
          children: [jsx("span", {
            class: "n tnum",
            children: "2"
          }), " Read this first"]
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
          class: "btn",
          onClick: () => setUnderstood(true),
          disabled: understood,
          children: understood ? "Understood" : "I understand"
        })]
      }), jsxs("li", {
        class: "step",
        children: [jsxs("h2", {
          children: [jsx("span", {
            class: "n tnum",
            children: "3"
          }), " Find your camera"]
        }), jsxs("form", {
          onSubmit: identify,
          class: "find",
          children: [jsxs("div", {
            class: "field",
            children: [jsx("label", {
              for: "doctor-serial",
              children: "Serial number"
            }), jsx("input", {
              class: "input ident",
              id: "doctor-serial",
              value: serial,
              maxLength: 14,
              onInput: (e) => setSerial(groupSerial(e.currentTarget.value)),
              placeholder: "VC26 09PV DA7Q",
              "aria-describedby": "doctor-serial-hint"
            }), jsx("span", {
              class: "hint",
              id: "doctor-serial-hint",
              children: "It is engraved on the underside."
            })]
          }), jsx("button", {
            type: "submit",
            class: "btn",
            disabled: !understood || !supported || looking,
            children: looking ? "Looking" : "Connect"
          })]
        }), !understood && jsx("p", {
          class: "hint",
          children: "Read the warning above and choose “I understand” first."
        }), lookupError && jsx("p", {
          class: "notice notice-danger",
          role: "alert",
          children: lookupError
        }), device && jsxs("p", {
          class: "found",
          children: [device.model, ", serial ", jsx("span", {
            class: "ident",
            children: device.serial
          }), ", currently running ", jsx("span", {
            class: "ident",
            children: device.firmware_version || "an unknown version"
          })]
        })]
      }), device && jsxs("li", {
        class: "step",
        children: [jsxs("h2", {
          children: [jsx("span", {
            class: "n tnum",
            children: "4"
          }), " Choose the software"]
        }), recommended && jsxs("label", {
          class: `image${choice === recommended.build ? " selected" : ""}`,
          children: [jsx("input", {
            type: "radio",
            name: "image",
            checked: choice === recommended.build,
            onChange: () => setChoice(recommended.build)
          }), jsxs("span", {
            class: "image-body",
            children: [jsxs("span", {
              class: "image-title",
              children: ["Recommended: ", jsx("span", {
                class: "ident",
                children: recommended.version
              })]
            }), jsx("span", {
              class: "hint tnum",
              children: formatBytes(recommended.size_bytes)
            })]
          })]
        }), others.length > 0 && jsxs("details", {
          class: "others",
          children: [jsx("summary", {
            children: "Other versions"
          }), jsx("div", {
            class: "others-body",
            children: others.map((entry) => jsxs("label", {
              class: `image${choice === entry.build ? " selected" : ""}`,
              children: [jsx("input", {
                type: "radio",
                name: "image",
                checked: choice === entry.build,
                onChange: () => setChoice(entry.build)
              }), jsxs("span", {
                class: "image-body",
                children: [jsx("span", {
                  class: "image-title",
                  children: jsx("span", {
                    class: "ident",
                    children: entry.version
                  })
                }), jsx("span", {
                  class: "hint tnum",
                  children: formatBytes(entry.size_bytes)
                })]
              })]
            }, entry.build))
          })]
        }), refusal && jsx("p", {
          class: "notice notice-danger",
          role: "alert",
          children: refusal
        }), phase !== "writing" && phase !== "done" && jsx("button", {
          type: "button",
          class: "btn btn-primary",
          onClick: write,
          disabled: !choice,
          children: "Write the software"
        })]
      }), (phase === "writing" || phase === "done" || phase === "failed") && jsxs("li", {
        class: "step",
        children: [jsxs("h2", {
          children: [jsx("span", {
            class: "n tnum",
            children: "5"
          }), " The write"]
        }), phase === "writing" && jsxs(Fragment, {
          children: [jsxs("p", {
            class: "writing tnum",
            children: ["Writing, ", percent, "%. Do not unplug your camera."]
          }), jsx("div", {
            class: "bar",
            role: "presentation",
            children: jsx("div", {
              class: "bar-fill",
              style: `width:${percent}%`
            })
          })]
        }), phase === "done" && result?.ok && jsxs("p", {
          class: "done-line",
          children: ["Done. Your camera is running ", jsx("span", {
            class: "ident",
            children: result.version
          }), "."]
        }), phase === "failed" && jsx("p", {
          class: "notice notice-danger",
          children: result?.present ? "Your camera is still working and you can try again." : "The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."
        })]
      })]
    }), jsx("style", {
      children: `
        .doctor { display: flex; flex-direction: column; gap: calc(var(--space) * 4); max-width: 68ch; }
        .live { min-height: 21px; font-size: 14px; color: var(--fg-muted); }
        .steps { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 8); }
        .step { display: flex; flex-direction: column; gap: calc(var(--space) * 3); align-items: flex-start; }
        .step h2 { font-size: 18px; line-height: 24px; display: flex; align-items: center; gap: calc(var(--space) * 2); }
        .n {
          display: inline-grid; place-items: center;
          width: 24px; height: 24px;
          border: var(--border-w) solid currentColor;
          border-radius: var(--radius);
          font-size: 13px;
        }
        .warning {
          border: var(--border-w) solid var(--rule-strong);
          border-left-width: 3px;
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
          max-width: 62ch;
        }
        .find { display: flex; gap: calc(var(--space) * 3); align-items: flex-end; flex-wrap: wrap; }
        .found { font-size: 14px; }
        .line { width: 40ch; height: 21px; }

        .image {
          display: flex; align-items: center; gap: calc(var(--space) * 3);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          cursor: pointer;
          min-width: 320px;
        }
        .image.selected { border-color: var(--fg); border-width: 2px; }
        .image-body { display: flex; flex-direction: column; }
        .image-title { font-weight: 700; }
        .others { width: 100%; }
        .others-body { display: flex; flex-direction: column; gap: calc(var(--space) * 2); padding-top: calc(var(--space) * 2); }

        .writing { font-weight: 700; }
        .bar {
          width: 100%; max-width: 420px; height: 8px;
          background: var(--bg-sunken);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: var(--progress);
          transition: width var(--speed) var(--ease);
        }
        .done-line { font-weight: 700; }
      `
    })]
  });
}

const $$Doctor = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer \u2014 Vela", "description": "Write firmware to a camera Arranger cannot reach.", "data-astro-cid-zyq4rxkj": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack stack-6" data-astro-cid-zyq4rxkj> <header class="stack stack-3" data-astro-cid-zyq4rxkj> <h1 data-astro-cid-zyq4rxkj>Firmware installer</h1> <p class="lede" data-astro-cid-zyq4rxkj>
This is for a camera Arranger cannot see. It writes the software inside the
        camera from this page. You can leave at any point before the write and
        nothing will have changed.
</p> <p class="hint" data-astro-cid-zyq4rxkj>
A camera registered to somebody else, and a camera out of warranty, are both
        repaired here. Ownership and warranty are not conditions of repair.
</p> </header> ${renderComponent($$result2, "Doctor", Doctor, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/Doctor.jsx", "client:component-export": "default", "data-astro-cid-zyq4rxkj": true })} <noscript> <p class="notice" data-astro-cid-zyq4rxkj>
This page needs scripting to talk to a camera. Use Arranger instead:
<a href="/downloads" data-astro-cid-zyq4rxkj>Downloads</a>.
</p> </noscript> </div> ` })} `;
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

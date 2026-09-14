import { c as createComponent, d as renderComponent, r as renderTemplate } from "../chunks/astro/server_D5JO-_2S.mjs";
import "kleur/colors";
import { $ as $$App } from "../chunks/App_CiTDO3Su.mjs";
import { useState, useRef, useEffect } from "preact/hooks";
import { jsxs, jsx } from "preact/jsx-runtime";
import { q } from "../chunks/index_CC0DBeZe.mjs";
import { renderers } from "../renderers.mjs";
function Doctor({
  firmware = []
}) {
  const [supported, setSupported] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [device, setDevice] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [phase, setPhase] = useState("identify");
  const [percent, setPercent] = useState(0);
  const [readBack, setReadBack] = useState(null);
  const [target, setTarget] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [gone, setGone] = useState(false);
  const [status, setStatus] = useState("Waiting to begin.");
  const liveRef = useRef(null);
  useEffect(() => {
    const hasUsb2 = typeof navigator !== "undefined" && !!navigator.usb;
    const hasSerial = typeof navigator !== "undefined" && !!navigator.serial;
    setSupported(hasUsb2 || hasSerial);
  }, []);
  const say = (msg) => {
    setStatus(msg);
    if (liveRef.current) liveRef.current.textContent = msg;
  };
  const secure = typeof window !== "undefined" && (window.isSecureContext || window.location && window.location.hostname === "localhost");
  const hasUsb = typeof navigator !== "undefined" && !!navigator.usb;
  const connect = async () => {
    setRefusal(null);
    say("Asking the browser for the camera.");
    const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
    try {
      if (navigator.usb) {
        const device2 = await withTimeout(navigator.usb.requestDevice({
          filters: []
        }), 8e3);
        const serial = extractSerial(device2.serialNumber || device2.productName || "");
        await identify(serial);
      } else if (navigator.serial) {
        const port = await withTimeout(navigator.serial.requestPort(), 8e3);
        await port.open({
          baudRate: 115200
        });
        await identify("");
      } else {
        throw new Error("no transport");
      }
    } catch (e) {
      say("No camera came forward. Enter the serial engraved under the camera.");
      setPhase("manual");
    }
  };
  const extractSerial = (s) => {
    const m = String(s || "").toUpperCase().match(/\b(VA|VC)[0-9]{4}[2-9A-HJ-NP-Z]{6}\b/);
    return m ? m[0] : "";
  };
  const identify = async (serial) => {
    say("Reading the camera.");
    if (!serial) {
      setPhase("manual");
      return;
    }
    await adoptSerial(serial);
  };
  const adoptSerial = async (serial, reportedVersion) => {
    setRefusal(null);
    try {
      const res = await fetch(`/api/doctor/identify`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serial,
          reported_version: reportedVersion || void 0
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefusal(body?.error?.message || "That did not work.");
        say(body?.error?.message || "That did not work.");
        return;
      }
      setDevice(body.device);
      setManifest(body.manifest || []);
      setPhase("choose");
      say(`Found ${body.device.model}, serial ${body.device.serial}, currently running ${body.device.firmware_version || "nothing"}.`);
    } catch {
      setRefusal("That did not work.");
    }
  };
  const recommended = manifest.filter((m) => m.channel === "general" && (!device?.firmware_version || compare(m.version, device.firmware_version) >= 0));
  const rec = recommended[0] || manifest[0] || null;
  const beginWrite = async (fw) => {
    setRefusal(null);
    setTarget(fw);
    setPhase("writing");
    setPercent(0);
    say(`Writing ${fw.version}. Do not unplug your camera.`);
    try {
      const res = await fetch("/api/flash-sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serial: device.serial,
          target_build: fw.build
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase("choose");
        setRefusal(body?.error?.message || "That did not work.");
        say(body?.error?.message || "That did not work.");
        return;
      }
      const sessionId = body.id;
      let p = 0;
      const tick = async () => {
        try {
          const r = await fetch(`/api/flash-sessions/${sessionId}/progress`, {
            credentials: "same-origin"
          });
          const b = await r.json();
          p = b.percent ?? 0;
        } catch {
        }
        setPercent(p);
        if (p < 100) setTimeout(tick, 700);
        else await finish(sessionId, fw);
      };
      tick();
    } catch {
      fail("camera_gone");
    }
  };
  const finish = async (sessionId, fw) => {
    try {
      const read = await readVersionFromDevice(fw);
      const res = await fetch(`/api/flash-sessions/${sessionId}/complete`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reported_version: read
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message);
      setReadBack(body.device_firmware_version || read);
      setPhase("done");
      say(`Done. Your camera is running ${body.device_firmware_version || read}.`);
    } catch {
      await fail("write_failed");
    }
  };
  const readVersionFromDevice = async (fw) => {
    try {
      const r = await fetch(`/api/doctor/readback?serial=${device.serial}&build=${fw.build}`, {
        credentials: "same-origin"
      });
      const b = await r.json();
      if (b.version) return b.version;
    } catch {
    }
    return fw.version;
  };
  const fail = async (reason) => {
    setGone(reason === "camera_gone");
    setPhase("failed");
    try {
      const r = await fetch(`/api/doctor/last-session?serial=${device?.serial || ""}`, {
        credentials: "same-origin"
      });
      const b = await r.json();
      if (b.id) await fetch(`/api/flash-sessions/${b.id}/fail`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason
        })
      });
    } catch {
    }
    say(reason === "camera_gone" ? "The camera disconnected." : "The write did not finish.");
  };
  return jsxs("div", {
    class: "doctor",
    children: [jsx("h1", {
      children: "Firmware installer"
    }), jsx("p", {
      class: "muted",
      children: "This page writes new software into a camera over its cable. Arranger does this better. Only use this page if Arranger cannot see your camera."
    }), jsx("p", {
      class: "sr-only",
      role: "status",
      "aria-live": "polite",
      ref: liveRef,
      children: status
    }), jsxs("ol", {
      class: "steps doctor-steps",
      children: [jsxs("li", {
        "aria-current": phase === "identify" || phase === "manual" ? "step" : void 0,
        children: [jsx("h2", {
          children: "1. Can this browser talk to a device?"
        }), supported === null ? jsx("p", {
          class: "muted",
          children: "Checking this browser."
        }) : null, supported === false ? jsxs("p", {
          children: ["This browser cannot talk to a device directly. Use ", jsx("a", {
            href: "/downloads",
            children: "Arranger"
          }), " instead, or enter the serial by hand below."]
        }) : jsxs("p", {
          children: ["This browser can talk to a device over ", hasUsb ? "WebUSB" : "Web Serial", "."]
        }), supported && !secure ? jsx("p", {
          class: "muted",
          children: "The device ports need a secure page or localhost."
        }) : null]
      }), jsxs("li", {
        children: [jsx("h2", {
          children: "2. Understand what this does"
        }), jsx("div", {
          class: "warning",
          role: "group",
          "aria-label": "Warning",
          tabindex: "0",
          children: jsx("p", {
            children: "This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in."
          })
        }), jsxs("label", {
          class: "checkrow",
          children: [jsx("input", {
            type: "checkbox",
            checked: understood,
            onChange: (e) => setUnderstood(e.target.checked)
          }), jsx("span", {
            children: "I understand"
          })]
        }), jsxs("p", {
          children: [jsxs("button", {
            class: "btn",
            onClick: connect,
            disabled: !understood,
            children: ["Connect a camera", jsx("span", {
              class: "sr-only",
              children: ". Unavailable until the warning is accepted."
            })]
          }), !understood ? jsx("span", {
            class: "muted small",
            children: " The connect control is unavailable until the warning is accepted."
          }) : null]
        })]
      }), jsxs("li", {
        children: [jsx("h2", {
          children: "3. Identify the camera"
        }), phase === "manual" || supported === false || supported === true || supported === null ? jsxs("form", {
          class: "manual",
          onSubmit: (e) => {
            e.preventDefault();
            const v = e.target.elements.serial.value.trim();
            if (v) adoptSerial(v.toUpperCase());
          },
          children: [jsx("label", {
            for: "serial",
            children: "Serial, engraved under the camera"
          }), jsx("input", {
            id: "serial",
            name: "serial",
            class: "mono",
            placeholder: "VC2609PVDA7Q",
            required: true
          }), jsx("button", {
            class: "btn",
            type: "submit",
            children: "Read this camera"
          })]
        }) : null, device ? jsxs("p", {
          children: [jsx("strong", {
            children: device.model
          }), ", serial ", jsx("span", {
            class: "mono",
            children: device.serial
          }), ", currently running ", jsx("span", {
            class: "mono",
            children: device.firmware_version || "nothing reported"
          }), "."]
        }) : null, refusal ? jsx("p", {
          class: "error-text",
          role: "alert",
          children: refusal
        }) : null]
      }), jsxs("li", {
        children: [jsx("h2", {
          children: "4. Choose the software"
        }), !device ? jsx("p", {
          class: "muted",
          children: "A camera is identified first."
        }) : null, device && rec ? jsxs("div", {
          children: [jsxs("p", {
            children: ["Recommended: ", jsx("strong", {
              class: "mono",
              children: rec.version
            }), " ", jsxs("span", {
              class: "muted small",
              children: ["(build ", jsx("span", {
                class: "tnum",
                children: rec.build
              }), ")"]
            })]
          }), jsxs("button", {
            class: "btn btn-primary",
            onClick: () => beginWrite(rec),
            disabled: phase === "writing",
            children: ["Write ", rec.version]
          }), jsxs("details", {
            class: "more-images",
            children: [jsx("summary", {
              children: "Other images for this camera"
            }), jsx("ul", {
              children: manifest.map((m) => jsx("li", {
                children: jsxs("button", {
                  class: "btn btn-quiet",
                  onClick: () => beginWrite(m),
                  disabled: phase === "writing",
                  children: [m.version, " ", jsxs("span", {
                    class: "muted small",
                    children: ["build ", m.build, ", ", m.channel, m.min_firmware ? `, needs ${m.min_firmware} or newer` : ""]
                  })]
                })
              }))
            })]
          })]
        }) : null]
      }), jsxs("li", {
        children: [jsx("h2", {
          children: "5. Write"
        }), phase === "writing" ? jsxs("p", {
          class: "writing",
          role: "status",
          children: ["Writing, ", jsx("span", {
            class: "tnum",
            children: percent
          }), "%. Do not unplug your camera."]
        }) : jsx("p", {
          class: "muted",
          children: "Nothing is written until you choose an image."
        }), phase === "done" ? jsxs("p", {
          class: "ok-text",
          children: ["Done. Your camera is running ", jsx("span", {
            class: "mono",
            children: readBack
          }), "."]
        }) : null, phase === "failed" ? gone ? jsx("p", {
          class: "error-text",
          children: "The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."
        }) : jsx("p", {
          class: "error-text",
          children: "Your camera is still working and you can try again."
        }) : null]
      })]
    })]
  });
}
function compare(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const firmware = await q(
    `SELECT f.id, f.version, f.build, f.channel, f.min_firmware, f.min_app_version, p.title AS product, p.handle AS product_handle
   FROM firmware f JOIN product p ON p.id = f.product_id ORDER BY f.build DESC`
  );
  return renderTemplate`${renderComponent($$result, "App", $$App, { "title": "Firmware installer" }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Doctor", Doctor, { "client:load": true, "firmware": firmware, "client:component-hydration": "load", "client:component-path": "@components/Doctor.jsx", "client:component-export": "default" })} ` })}`;
}, "/app/src/pages/doctor/index.astro", void 0);
const $$file = "/app/src/pages/doctor/index.astro";
const $$url = "/doctor";
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

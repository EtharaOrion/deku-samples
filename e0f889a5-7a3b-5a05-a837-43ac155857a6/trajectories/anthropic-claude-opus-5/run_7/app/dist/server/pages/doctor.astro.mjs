import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_rOUT-VGP.mjs';
import 'piccolore';
import { a as api, v as viewer, $ as $$Shell } from '../chunks/page_CERy5BG_.mjs';
import { useState, useRef, useEffect } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';
/* empty css                                  */
export { renderers } from '../renderers.mjs';

function Doctor() {
  const [supported, setSupported] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [serial, setSerial] = useState("");
  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [status, setStatus] = useState("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [live, setLive] = useState("");
  const announcedAt = useRef(-1);
  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "usb" in navigator);
  }, []);
  const say = (msg) => setLive(msg);
  const identify = async (e) => {
    e?.preventDefault();
    setError(null);
    setDevice(null);
    setOutcome(null);
    const clean = serial.trim().toUpperCase().replace(/[\s-]/g, "");
    try {
      setStatus("identifying");
      say("Looking for your camera.");
      const d = await api(`/devices/${encodeURIComponent(clean)}/firmware`);
      setDevice(d.device);
      setImages(d.entries);
      setRecommended(d.recommended);
      setChosen(d.recommended?.build ?? null);
      setStatus("identified");
      say(`${d.device.model}, serial ${d.device.serial}, currently running ${d.device.firmware_version || "an unknown version"}.`);
    } catch (err) {
      setStatus("idle");
      setError(err.message);
      say(err.message);
    }
  };
  const write = async () => {
    const image = images.find((i) => i.build === chosen);
    if (!image) return;
    if (!image.eligible) {
      setError(image.reason);
      return;
    }
    setError(null);
    setStatus("writing");
    setPercent(0);
    announcedAt.current = -1;
    say("Writing firmware. Do not unplug your camera.");
    let session;
    try {
      session = await api("/flash-sessions", {
        method: "POST",
        body: {
          serial: device.serial,
          target_build: image.build
        }
      });
    } catch (err) {
      setStatus("identified");
      setError(err.message);
      say(err.message);
      return;
    }
    const id = session.session.id;
    let reported = 0;
    const step = async () => {
      reported = Math.min(100, reported + 4 + Math.floor(Math.random() * 6));
      setPercent(reported);
      const bucket = Math.floor(reported / 25);
      if (bucket > announcedAt.current) {
        announcedAt.current = bucket;
        say(`Writing, ${reported} percent. Do not unplug your camera.`);
      }
    };
    try {
      while (reported < 100) {
        await new Promise((r) => setTimeout(r, 260));
        await step();
      }
      const done = await api(`/flash-sessions/${id}/complete`, {
        method: "POST",
        body: {
          reported_version: image.version
        }
      });
      setStatus("done");
      setOutcome({
        kind: "done",
        version: done.device.firmware_version
      });
      setDevice((d) => ({
        ...d,
        firmware_version: done.device.firmware_version
      }));
      say(`Done. Your camera is running ${done.device.firmware_version}.`);
    } catch (err) {
      try {
        await api(`/flash-sessions/${id}/fail`, {
          method: "POST",
          body: {
            reason: err.message
          }
        });
      } catch {
      }
      setStatus("failed");
      setOutcome({
        kind: "failed",
        present: true
      });
      say("The write did not finish. Your camera is still working and you can try again.");
    }
  };
  return jsxs("div", {
    children: [jsx("div", {
      id: "live-region",
      role: "status",
      "aria-live": "polite",
      class: "visually-hidden",
      children: live
    }), jsxs("ol", {
      class: "doctor-steps",
      children: [jsxs("li", {
        children: [jsx("h2", {
          class: "doctor-h",
          children: "Can this browser talk to your camera?"
        }), supported === null ? jsx("p", {
          class: "skeleton",
          style: "height:24px;max-width:30ch"
        }) : supported ? jsx("p", {
          children: "Yes. This browser can talk to a camera over USB."
        }) : jsxs("div", {
          children: [jsx("p", {
            children: "This browser cannot talk to a camera over USB."
          }), jsx("p", {
            class: "small muted",
            style: "margin-top:calc(var(--unit)*2)",
            children: "Chrome, Edge and Opera on a desktop computer can. On any browser you can install firmware with the application instead."
          }), jsx("p", {
            style: "margin-top:calc(var(--unit)*3)",
            children: jsx("a", {
              class: "btn btn-secondary",
              href: "/downloads",
              children: "Get Arranger and install it from there"
            })
          })]
        })]
      }), supported && jsxs("li", {
        children: [jsx("h2", {
          class: "doctor-h",
          children: "Read this before you start"
        }), jsx("div", {
          class: "notice notice-progress",
          tabIndex: 0,
          role: "group",
          "aria-label": "Warning",
          children: jsx("p", {
            children: "This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in."
          })
        }), jsx("button", {
          type: "button",
          class: "btn btn-secondary",
          onClick: () => {
            setAccepted(true);
            say("Warning accepted. You can connect your camera.");
          },
          disabled: accepted,
          style: "margin-top:calc(var(--unit)*3)",
          children: accepted ? "Understood" : "I understand"
        })]
      }), supported && jsxs("li", {
        children: [jsx("h2", {
          class: "doctor-h",
          children: "Connect your camera"
        }), !accepted && jsx("p", {
          class: "small muted",
          style: "margin-bottom:calc(var(--unit)*3)",
          children: "Read and accept the warning above first."
        }), jsxs("form", {
          onSubmit: identify,
          children: [jsxs("label", {
            class: "field",
            style: "max-width:24rem",
            children: [jsx("span", {
              class: "label",
              children: "Serial number"
            }), jsx("input", {
              class: "input serial",
              value: serial,
              onInput: (e) => setSerial(e.currentTarget.value.toUpperCase()),
              placeholder: "VC2609PVDA7Q",
              maxLength: 14,
              disabled: !accepted,
              "aria-describedby": "serial-hint"
            }), jsx("span", {
              class: "field-hint",
              id: "serial-hint",
              children: "Twelve characters, engraved on the underside."
            })]
          }), jsx("button", {
            type: "submit",
            class: "btn",
            disabled: !accepted || status === "identifying" || status === "writing",
            children: status === "identifying" ? "Looking" : "Find my camera"
          }), !accepted && jsx("p", {
            class: "small muted",
            style: "margin-top:calc(var(--unit)*2)",
            children: "This stays unavailable until you accept the warning."
          })]
        }), error && status !== "writing" && jsx("p", {
          class: "field-error",
          role: "alert",
          style: "margin-top:calc(var(--unit)*3)",
          children: error
        })]
      }), device && jsxs("li", {
        children: [jsx("h2", {
          class: "doctor-h",
          children: "Choose the firmware"
        }), jsxs("p", {
          style: "margin-bottom:calc(var(--unit)*4)",
          children: [jsx("strong", {
            children: device.model
          }), ", serial ", jsx("span", {
            class: "serial",
            children: device.serial
          }), ", currently running ", jsx("span", {
            class: "version",
            children: device.firmware_version || "an unknown version"
          })]
        }), recommended ? jsxs("label", {
          class: "card row",
          style: "gap:calc(var(--unit)*3);align-items:flex-start;flex-wrap:nowrap;margin-bottom:calc(var(--unit)*3)",
          children: [jsx("input", {
            type: "radio",
            name: "image",
            checked: chosen === recommended.build,
            onChange: () => setChosen(recommended.build),
            style: "margin-top:4px"
          }), jsxs("span", {
            children: [jsxs("span", {
              style: "font-weight:700",
              children: ["Firmware ", jsx("span", {
                class: "version",
                children: recommended.version
              })]
            }), jsx("span", {
              class: "chip chip-done",
              style: "margin-inline-start:calc(var(--unit)*2)",
              children: "Recommended"
            }), jsxs("span", {
              class: "small muted",
              style: "display:block;margin-top:var(--unit)",
              children: ["Build ", jsx("span", {
                class: "build",
                children: recommended.build
              })]
            })]
          })]
        }) : jsx("p", {
          class: "muted",
          children: "There is no firmware this camera can take right now."
        }), jsxs("details", {
          style: "margin-bottom:calc(var(--unit)*4)",
          children: [jsx("summary", {
            class: "small",
            style: "cursor:pointer",
            children: "Other versions"
          }), jsx("div", {
            class: "stack",
            style: "margin-top:calc(var(--unit)*3)",
            children: images.filter((i) => i.build !== recommended?.build).map((i) => jsxs("label", {
              class: "card row",
              style: "gap:calc(var(--unit)*3);align-items:flex-start;flex-wrap:nowrap",
              children: [jsx("input", {
                type: "radio",
                name: "image",
                checked: chosen === i.build,
                onChange: () => setChosen(i.build),
                disabled: !i.eligible,
                style: "margin-top:4px"
              }), jsxs("span", {
                children: [jsxs("span", {
                  style: "font-weight:700",
                  children: ["Firmware ", jsx("span", {
                    class: "version",
                    children: i.version
                  })]
                }), jsxs("span", {
                  class: "small muted",
                  style: "display:block;margin-top:var(--unit)",
                  children: ["Build ", jsx("span", {
                    class: "build",
                    children: i.build
                  })]
                }), !i.eligible && jsx("span", {
                  class: "small",
                  style: "display:block;margin-top:var(--unit);color:var(--danger)",
                  children: i.reason
                })]
              })]
            }, i.build))
          })]
        }), status !== "writing" && status !== "done" && jsx("button", {
          type: "button",
          class: "btn",
          onClick: write,
          disabled: !chosen,
          children: "Write this firmware to my camera"
        }), error && status === "identified" && jsx("p", {
          class: "field-error",
          role: "alert",
          style: "margin-top:calc(var(--unit)*3)",
          children: error
        })]
      }), (status === "writing" || outcome) && jsxs("li", {
        children: [jsx("h2", {
          class: "doctor-h",
          children: "The write"
        }), status === "writing" && jsxs("div", {
          children: [jsxs("p", {
            style: "font-weight:700",
            class: "tnum",
            children: ["Writing, ", percent, "%. Do not unplug your camera."]
          }), jsx("div", {
            style: "height:8px;background:var(--bg-sunken);border-radius:var(--radius);overflow:hidden;margin-top:calc(var(--unit)*3);max-width:32rem",
            children: jsx("div", {
              style: `height:100%;width:${percent}%;background:var(--progress)`
            })
          })]
        }), outcome?.kind === "done" && jsxs("div", {
          class: "notice notice-done",
          children: [jsxs("p", {
            style: "font-weight:700",
            children: ["Done. Your camera is running ", jsx("span", {
              class: "version",
              children: outcome.version
            }), "."]
          }), jsx("p", {
            class: "small",
            style: "margin-top:calc(var(--unit)*2)",
            children: "You can unplug it now."
          })]
        }), outcome?.kind === "failed" && jsxs("div", {
          class: "notice notice-danger",
          children: [jsx("p", {
            style: "font-weight:700",
            children: "The write did not finish."
          }), jsx("p", {
            class: "small",
            style: "margin-top:calc(var(--unit)*2)",
            children: outcome.present ? "Your camera is still working and you can try again." : "The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."
          })]
        })]
      })]
    })]
  });
}

const $$Astro = createAstro();
const $$Doctor = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Doctor;
  const v = await viewer(Astro2);
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Firmware installer \u2014 Vela", "description": "Write firmware to a camera Arranger cannot reach.", "signedIn": v.signedIn, "cartCount": v.cartCount }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<h1 class="page-title">Firmware installer</h1> <p class="page-lede" style="max-width:66ch">
This writes firmware to a camera straight from this browser. Use it when Arranger
    cannot see your camera. You can leave at any point before the write and nothing
    will have changed. We repair a camera whoever it is registered to and whatever
    its warranty says.
</p> ${renderComponent($$result2, "Doctor", Doctor, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/app/src/islands/Doctor.jsx", "client:component-export": "default" })} <noscript> <div class="notice"> <p>This page needs scripting to talk to a camera.</p> <p class="small" style="margin-top:calc(var(--unit)*2)">
You can install firmware with the application instead.
<a href="/downloads">Get Arranger</a>.
</p> </div> </noscript> ` })} `;
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

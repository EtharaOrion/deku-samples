import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { link } from "../router.mjs";
import { setMeta } from "../lib/meta.mjs";

export function Reveal({ as: As = "div", children, className = "", ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    if (!("IntersectionObserver" in window)) { setShown(true); return; }
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    const t = setTimeout(() => setShown(true), 2400);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return h(As, Object.assign({ ref, className: ("reveal " + (shown ? "reveal-in" : "") + " " + className).trim() }, rest), children);
}

export function Frame({ children, wide = false }) {
  return h("div", { class: "frame" + (wide ? " frame-wide" : "") }, children);
}

export function Eyebrow({ children }) { return h("p", { class: "eyebrow" }, children); }

export function Button({ href, onClick, children, kind = "primary", type = "button", disabled, ariaLabel }) {
  const cls = "btn btn-" + kind + (disabled ? " is-disabled" : "");
  if (href) return h("a", { href, class: cls, "aria-label": ariaLabel }, children);
  return h("button", { type, class: cls, onClick, disabled, "aria-label": ariaLabel }, children);
}

export function Spinner({ label = "Loading" }) {
  return h("p", { class: "loading", role: "status" }, label + "…");
}

export function Empty({ children }) {
  return h("p", { class: "empty" }, children);
}

export function Banner({ tone = "info", children, title }) {
  return h("div", { class: "banner banner-" + tone, role: tone === "refused" ? "alert" : "status" }, [
    title ? h("p", { class: "banner-title" }, title) : null,
    typeof children === "string" ? h("p", null, children) : children,
  ]);
}

export function Fig({ value, unit, label, cls }) {
  return h("div", { class: "fig" + (cls ? " " + cls : "") }, [
    h("p", { class: "fig-value" }, [h("span", { class: "mono" }, value), unit ? " " + unit : null]),
    label ? h("p", { class: "fig-label" }, label) : null,
  ]);
}

export function Mark({ kind }) {
  const paths = {
    flag: "M5 3v18M5 4h13l-2.5 4L18 12H5",
    lock: "M6 11h12v9H6zM9 11V8a3 3 0 016 0v3",
    arrow: "M4 12h14M12 6l6 6-6 6",
    warn: "M12 3l9 17H3zM12 9v6M12 17.5v.5",
  };
  const d = paths[kind];
  if (!d) return null;
  return h("span", { class: "mark", "aria-hidden": "true" }, h("svg", { viewBox: "0 0 24 24", width: "18", height: "18", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" },
    d.split("M").filter(Boolean).map((p, i) => h("path", { key: i, d: "M" + p, "stroke-width": "1.7" }))
  ));
}

export function StateWord({ children, mark }) {
  return h("span", { class: "state-word" }, [mark ? h(Mark, { kind: mark }) : null, " " + children]);
}

export function Ref({ value }) { return h("span", { class: "mono ref" }, value); }

export function Loading() { return h("p", { class: "loading", role: "status" }, "Loading…"); }

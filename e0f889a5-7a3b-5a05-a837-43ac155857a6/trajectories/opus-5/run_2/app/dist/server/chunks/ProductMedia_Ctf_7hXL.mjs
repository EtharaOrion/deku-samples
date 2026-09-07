import { c as createComponent, m as maybeRenderHead, a as addAttribute, r as renderTemplate, b as createAstro } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import 'clsx';
/* empty css                        */

const $$Astro = createAstro();
const $$ProductMedia = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ProductMedia;
  const { handle, option = "", title, ratio = "4 / 3" } = Astro2.props;
  const bodies = {
    Graphite: "#3b3b3a",
    Sand: "#c6b393",
    Yellow: "#d8a52c",
    Standard: "#4a4a48",
    Clamp: "#6a6a68",
    VESA: "#6a6a68",
    "1 m": "#55554f",
    "2 m": "#55554f"
  };
  const body = bodies[option] || "#4a4a48";
  return renderTemplate`${maybeRenderHead()}<div class="media-frame"${addAttribute(`aspect-ratio:${ratio}`, "style")} data-astro-cid-tn5un4km> <svg viewBox="0 0 320 240" role="img"${addAttribute(`${title}${option ? `, ${option}` : ""}`, "aria-label")} preserveAspectRatio="xMidYMid meet" data-astro-cid-tn5un4km> <rect width="320" height="240" fill="var(--surface-sunken)" data-astro-cid-tn5un4km></rect> ${handle === "flagship" && renderTemplate`<g data-astro-cid-tn5un4km> <rect x="52" y="78" width="216" height="112" rx="12"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <rect x="96" y="60" width="64" height="24" rx="6"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <circle cx="196" cy="134" r="46" fill="#1f1f1e" data-astro-cid-tn5un4km></circle> <circle cx="196" cy="134" r="32" fill="#111" data-astro-cid-tn5un4km></circle> <circle cx="196" cy="134" r="14" fill="#4a5a68" data-astro-cid-tn5un4km></circle> <rect x="70" y="96" width="46" height="30" rx="4" fill="#26262500" stroke="#00000033" data-astro-cid-tn5un4km></rect> </g>`} ${handle === "compact" && renderTemplate`<g data-astro-cid-tn5un4km> <rect x="76" y="92" width="168" height="86" rx="10"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <circle cx="160" cy="135" r="34" fill="#1f1f1e" data-astro-cid-tn5un4km></circle> <circle cx="160" cy="135" r="23" fill="#111" data-astro-cid-tn5un4km></circle> <circle cx="160" cy="135" r="10" fill="#4a5a68" data-astro-cid-tn5un4km></circle> <rect x="92" y="102" width="30" height="16" rx="3" fill="#00000030" data-astro-cid-tn5un4km></rect> </g>`} ${handle === "case" && renderTemplate`<g data-astro-cid-tn5un4km> <rect x="58" y="86" width="204" height="104" rx="14"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <rect x="58" y="128" width="204" height="8" fill="#00000040" data-astro-cid-tn5un4km></rect> <rect x="140" y="74" width="40" height="16" rx="8" fill="#33332f" data-astro-cid-tn5un4km></rect> <circle cx="96" cy="160" r="6" fill="#8a8a86" data-astro-cid-tn5un4km></circle> <circle cx="224" cy="160" r="6" fill="#8a8a86" data-astro-cid-tn5un4km></circle> </g>`} ${handle === "mount" && renderTemplate`<g data-astro-cid-tn5un4km> <rect x="96" y="70" width="24" height="110" rx="6"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <rect x="96" y="164" width="112" height="20" rx="6"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> <circle cx="196" cy="96" r="26" fill="#55555200"${addAttribute(body, "stroke")} stroke-width="10" data-astro-cid-tn5un4km></circle> <rect x="150" y="88" width="40" height="14" rx="4"${addAttribute(body, "fill")} data-astro-cid-tn5un4km></rect> </g>`} ${handle === "cable" && renderTemplate`<g data-astro-cid-tn5un4km> <path d="M70 168 C 130 168, 120 96, 176 96 S 246 120, 252 96" fill="none"${addAttribute(body, "stroke")} stroke-width="12" stroke-linecap="round" data-astro-cid-tn5un4km></path> <rect x="56" y="158" width="26" height="20" rx="4" fill="#8a8a86" data-astro-cid-tn5un4km></rect> <rect x="244" y="84" width="24" height="20" rx="4" fill="#8a8a86" data-astro-cid-tn5un4km></rect> </g>`} </svg> </div> `;
}, "/app/src/components/ProductMedia.astro", void 0);

export { $$ProductMedia as $ };

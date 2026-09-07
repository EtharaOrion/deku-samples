import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro } from './astro/server_CZxa_ltZ.mjs';
import 'piccolore';
import 'clsx';

const $$Astro = createAstro();
const $$ProductMedia = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$ProductMedia;
  const { handle, view = 0, label = "" } = Astro2.props;
  const palettes = {
    flagship: ["#2c2f36", "#3d424b", "#8d949f"],
    compact: ["#31343b", "#454a54", "#9aa2ad"],
    mount: ["#4a4e57", "#5c616b", "#a8aeb8"],
    case: ["#3a3d44", "#4d515a", "#949aa5"],
    cable: ["#3f434b", "#565b65", "#a0a6b1"]
  };
  const [dark, mid, light] = palettes[handle] ?? palettes.flagship;
  const shift = view * 9;
  return renderTemplate`${maybeRenderHead()}<svg class="media-figure" viewBox="0 0 400 300" role="img"${addAttribute(label, "aria-label")} preserveAspectRatio="xMidYMid slice"> <rect width="400" height="300" fill="var(--ink-050)"></rect> ${handle === "flagship" || handle === "compact" ? renderTemplate`<g${addAttribute(`translate(${shift} ${shift / 2})`, "transform")}> <rect x="86" y="96" width="228" height="132" rx="10"${addAttribute(dark, "fill")}></rect> <rect x="128" y="72" width="64" height="30" rx="6"${addAttribute(mid, "fill")}></rect> <circle cx="200" cy="162" r="52"${addAttribute(mid, "fill")}></circle> <circle cx="200" cy="162" r="38"${addAttribute(dark, "fill")}></circle> <circle cx="200" cy="162" r="22" fill="#0f1013"></circle> <circle cx="188" cy="150" r="6"${addAttribute(light, "fill")} opacity="0.5"></circle> <rect x="266" y="118" width="30" height="10" rx="3"${addAttribute(light, "fill")} opacity="0.6"></rect> ${[104, 296].map((x) => [112, 212].map((y) => renderTemplate`<circle${addAttribute(x, "cx")}${addAttribute(y, "cy")} r="4"${addAttribute(light, "fill")} opacity="0.75"></circle>`))} </g>` : handle === "case" ? renderTemplate`<g${addAttribute(`translate(${shift} 0)`, "transform")}> <rect x="60" y="86" width="280" height="150" rx="12"${addAttribute(dark, "fill")}></rect> <rect x="60" y="150" width="280" height="8"${addAttribute(light, "fill")} opacity="0.35"></rect> <rect x="168" y="72" width="64" height="20" rx="8"${addAttribute(mid, "fill")}></rect> ${[112, 288].map((x) => renderTemplate`<rect${addAttribute(x - 12, "x")} y="146" width="24" height="18" rx="4"${addAttribute(light, "fill")} opacity="0.7"></rect>`)} </g>` : handle === "cable" ? renderTemplate`<g${addAttribute(`translate(${shift} 0)`, "transform")}> <path d="M70 190 C 140 90, 260 250, 330 130"${addAttribute(dark, "stroke")} stroke-width="16" fill="none" stroke-linecap="round"></path> <rect x="52" y="176" width="34" height="28" rx="5"${addAttribute(mid, "fill")}></rect> <rect x="316" y="116" width="34" height="28" rx="5"${addAttribute(mid, "fill")}></rect> </g>` : renderTemplate`<g${addAttribute(`translate(${shift} 0)`, "transform")}> <rect x="96" y="196" width="128" height="22" rx="5"${addAttribute(dark, "fill")}></rect> <rect x="140" y="94" width="18" height="108"${addAttribute(mid, "fill")}></rect> <rect x="150" y="82" width="132" height="16" rx="5"${addAttribute(dark, "fill")}></rect> <rect x="268" y="74" width="44" height="34" rx="5"${addAttribute(light, "fill")} opacity="0.75"></rect> </g>`} </svg>`;
}, "/app/src/components/ProductMedia.astro", void 0);

export { $$ProductMedia as $ };

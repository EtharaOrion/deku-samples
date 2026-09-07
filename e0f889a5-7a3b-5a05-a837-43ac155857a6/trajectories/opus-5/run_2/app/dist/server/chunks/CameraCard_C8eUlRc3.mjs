import { c as createComponent, m as maybeRenderHead, r as renderTemplate, a as addAttribute, b as createAstro } from './astro/server_BhsuV_oP.mjs';
import 'kleur/colors';
import 'clsx';
import { f as formatDate } from './api_eUbQd3xF.mjs';
/* empty css                         */

const $$Astro = createAstro();
const $$CameraCard = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CameraCard;
  const { device } = Astro2.props;
  const firmwareChip = !device.firmware_version ? { tone: "neutral", label: "Not yet connected" } : device.update_available ? { tone: "progress", label: "Update available" } : { tone: "done", label: `Firmware ${device.firmware_version}` };
  const warrantyChip = !device.warranty_until ? null : device.warranty_expired ? { tone: "neutral", label: `Warranty ended ${formatDate(device.warranty_until)}` } : { tone: "neutral", label: `Warranty to ${formatDate(device.warranty_until)}` };
  return renderTemplate`${maybeRenderHead()}<article class="camera card" data-astro-cid-to7jz4mq> <div class="camera-head" data-astro-cid-to7jz4mq> <h3 data-astro-cid-to7jz4mq>${device.nickname || device.model}</h3> ${device.nickname && renderTemplate`<p class="model" data-astro-cid-to7jz4mq>${device.model}</p>`} </div> <p class="serial mono" data-astro-cid-to7jz4mq>${device.serial}</p> <div class="chips" data-astro-cid-to7jz4mq> <span${addAttribute(`chip chip-${firmwareChip.tone}`, "class")} data-astro-cid-to7jz4mq>${firmwareChip.label}</span> ${warrantyChip && renderTemplate`<span${addAttribute(`chip chip-${warrantyChip.tone}`, "class")} data-astro-cid-to7jz4mq>${warrantyChip.label}</span>`} </div> <a class="btn btn-secondary btn-small"${addAttribute(`/account/cameras/${device.serial}`, "href")} data-astro-cid-to7jz4mq>Open</a> </article> `;
}, "/app/src/components/CameraCard.astro", void 0);

export { $$CameraCard as $ };

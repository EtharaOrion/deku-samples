import { e as createComponent, m as maybeRenderHead, r as renderTemplate, g as addAttribute, h as createAstro } from './astro/server_Dku1auYb.mjs';
import 'piccolore';
import 'clsx';
import { g as groupSerial, f as formatDate } from './format_y0Y9nLbA.mjs';
/* empty css                         */

const $$Astro = createAstro();
const $$CameraCard = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$CameraCard;
  const { device } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<article class="camera card" data-astro-cid-to7jz4mq> <div class="head" data-astro-cid-to7jz4mq> <h3 class="model" data-astro-cid-to7jz4mq>${device.model}</h3> ${device.nickname && renderTemplate`<p class="nickname" data-astro-cid-to7jz4mq>${device.nickname}</p>`} </div> <p class="serial ident" data-astro-cid-to7jz4mq>${groupSerial(device.serial)}</p> <div class="chips" data-astro-cid-to7jz4mq>  ${device.firmware_state === "unknown" ? renderTemplate`<span class="chip" data-astro-cid-to7jz4mq>Not yet connected</span>` : device.update_available ? renderTemplate`<span class="chip chip-progress" data-astro-cid-to7jz4mq>Update available</span>` : renderTemplate`<span class="chip" data-astro-cid-to7jz4mq>Firmware <span class="ident" data-astro-cid-to7jz4mq>${device.firmware_version}</span></span>`}  ${device.warranty_until ? renderTemplate`<span class="chip" data-astro-cid-to7jz4mq> ${device.warranty_active ? `Warranty to ${formatDate(device.warranty_until)}` : `Warranty ended ${formatDate(device.warranty_until)}`} </span>` : renderTemplate`<span class="chip" data-astro-cid-to7jz4mq>No warranty on record</span>`} </div> <p class="more" data-astro-cid-to7jz4mq> <a${addAttribute(`/account/cameras/${device.serial}`, "href")} data-astro-cid-to7jz4mq>Open this camera</a> </p> </article> `;
}, "/app/src/components/CameraCard.astro", void 0);

export { $$CameraCard as $ };

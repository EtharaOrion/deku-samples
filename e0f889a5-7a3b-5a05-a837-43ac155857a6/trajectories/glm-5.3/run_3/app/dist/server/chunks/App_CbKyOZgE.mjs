import { c as createComponent, e as renderHead, d as renderComponent, f as renderSlot, r as renderTemplate, b as createAstro } from './astro/server_fYfMDxHt.mjs';
import 'kleur/colors';
/* empty css                            */
/* empty css                            */

const $$Astro = createAstro();
const $$App = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$App;
  const { title = "Vela", active = "" } = Astro2.props;
  return renderTemplate`<html lang="en" data-astro-cid-mnwxwo2t> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Vela</title>${renderHead()}</head> <body class="surface-light" data-astro-cid-mnwxwo2t> <a class="skip-link" href="#main" data-astro-cid-mnwxwo2t>Skip to content</a> <div class="shell" data-astro-cid-mnwxwo2t> ${renderComponent($$result, "rail-sidebar", "rail-sidebar", { "data-active": active, "data-astro-cid-mnwxwo2t": true })} <div class="shell-main" data-astro-cid-mnwxwo2t> <header class="topbar" data-astro-cid-mnwxwo2t> <a class="wordmark" href="/" data-astro-cid-mnwxwo2t>vela</a> ${renderComponent($$result, "cart-control", "cart-control", { "data-astro-cid-mnwxwo2t": true })} </header> <main id="main" class="content" data-astro-cid-mnwxwo2t> ${renderSlot($$result, $$slots["default"])} </main> </div> </div>  </body> </html> `;
}, "/app/src/layouts/App.astro", void 0);

export { $$App as $ };

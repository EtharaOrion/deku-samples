import { e as createComponent, m as maybeRenderHead, g as addAttribute, r as renderTemplate, h as createAstro, k as renderComponent, l as Fragment } from './astro/server_BMi1VkyI.mjs';
import 'piccolore';
import { $ as $$Shell } from './Shell_5xqhq6uI.mjs';
import 'clsx';
import { f as formatDateLong, d as formatBytes, N as NOTE_GROUPS } from './app_BbZzWQ31.mjs';
/* empty css                             */
import { useState, useEffect } from 'preact/hooks';
import { jsx } from 'preact/jsx-runtime';

const $$Astro$1 = createAstro();
const $$ReleaseBlock = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$ReleaseBlock;
  const { release, open } = Astro2.props;
  return renderTemplate`<!-- A disclosure that works with no scripting and is keyboard operable. The
     whole archive is present in the markup whatever the collapse state, so an
     in-page find and a crawler both see all of it. -->${maybeRenderHead()}<article class="release" data-astro-cid-7vmtfvrn> <details${addAttribute(open, "open")} data-astro-cid-7vmtfvrn> <summary class="release__summary" data-astro-cid-7vmtfvrn> <h3 class="release__title" data-astro-cid-7vmtfvrn>
Arranger <span class="version" data-astro-cid-7vmtfvrn>${release.version}</span> </h3> <p class="release__dateline small muted" data-astro-cid-7vmtfvrn>
Released on <time${addAttribute(release.released_on, "datetime")} data-astro-cid-7vmtfvrn>${formatDateLong(release.released_on)}</time> </p> </summary> <div class="release__body" data-astro-cid-7vmtfvrn> <p class="muted" data-astro-cid-7vmtfvrn>${release.description}</p> <div class="row release__meta" data-astro-cid-7vmtfvrn> <a class="btn btn--secondary btn--small"${addAttribute(`/downloads/${release.version}`, "href")} data-astro-cid-7vmtfvrn>
Download Arranger ${release.version} </a> <span class="small faint bytes" data-astro-cid-7vmtfvrn>${formatBytes(release.size_bytes)} bytes</span> </div> <p class="digest small faint release__digest" data-astro-cid-7vmtfvrn>${release.sha256}</p> ${NOTE_GROUPS.filter((group) => release.notes?.[group]?.length).map((group) => renderTemplate`<section class="release__group" data-astro-cid-7vmtfvrn> <h4 class="release__group-title" data-astro-cid-7vmtfvrn>${group}</h4> <ul class="release__notes" data-astro-cid-7vmtfvrn> ${release.notes[group].map((note) => renderTemplate`<li data-astro-cid-7vmtfvrn>${note}</li>`)} </ul> </section>`)} <p class="release__sign" data-astro-cid-7vmtfvrn>The Vela team.</p> </div> </details> </article> `;
}, "/app/src/components/ReleaseBlock.astro", void 0);

function PlatformNote() {
  const [mac, setMac] = useState(true);
  useEffect(() => {
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    setMac(/mac/i.test(platform));
  }, []);
  if (mac) return null;
  return jsx("p", {
    class: "small muted platform-note",
    children: "Arranger is a macOS application."
  });
}

const $$Astro = createAstro();
const $$DownloadsPage = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$DownloadsPage;
  const { releases, firmware, expanded, customer, cartCount } = Astro2.props;
  const newest = releases[0];
  const openVersion = expanded ?? newest?.version ?? null;
  const cricketLatest = firmware?.entries?.[0] ?? null;
  return renderTemplate`${renderComponent($$result, "Shell", $$Shell, { "title": "Downloads \u2014 Vela", "description": "Arranger, firmware and the whole release archive.", "current": "downloads", "customer": customer, "cartCount": cartCount, "data-astro-cid-3r5sesm7": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="page-head" data-astro-cid-3r5sesm7> <h1 class="page-title" data-astro-cid-3r5sesm7>Downloads</h1> <p class="page-sub" data-astro-cid-3r5sesm7>Arranger requires macOS 13.0 or later. Download the app below.</p> </div> ${newest && renderTemplate`<section class="panel primary-download" data-astro-cid-3r5sesm7> <div class="row" data-astro-cid-3r5sesm7> <a class="btn"${addAttribute(`/downloads/${newest.version}`, "href")} data-astro-cid-3r5sesm7>
Download Arranger ${newest.version} </a> <span class="small muted bytes" data-astro-cid-3r5sesm7>${formatBytes(newest.size_bytes)} bytes</span> </div> <p class="digest small faint primary-download__digest" data-astro-cid-3r5sesm7>${newest.sha256}</p>  ${renderComponent($$result2, "PlatformNote", PlatformNote, { "client:idle": true, "client:component-hydration": "idle", "client:component-path": "/app/src/islands/PlatformNote.jsx", "client:component-export": "default", "data-astro-cid-3r5sesm7": true })} </section>`}${cricketLatest && renderTemplate`<section class="panel firmware-row" data-astro-cid-3r5sesm7> <h2 class="section-title" data-astro-cid-3r5sesm7>Firmware</h2> <div class="row" data-astro-cid-3r5sesm7> <a class="btn btn--secondary" href="/api/firmware/manifest?model=compact" data-astro-cid-3r5sesm7>
Download Vela Cricket Firmware ${cricketLatest.version} </a> <span class="firmware-row__web" data-astro-cid-3r5sesm7>  <a class="btn btn--quiet btn--small" href="/doctor" data-astro-cid-3r5sesm7>
Firmware install (web-based)
</a> <span class="small muted" data-astro-cid-3r5sesm7> Only use this if Arranger cannot see your camera.</span> </span> </div> </section>`}<section class="archive" data-astro-cid-3r5sesm7> <h2 class="section-title" data-astro-cid-3r5sesm7>Release archive</h2> ${releases.length === 0 ? renderTemplate`<div class="empty" data-astro-cid-3r5sesm7> <p data-astro-cid-3r5sesm7>There are no releases yet.</p> </div>` : releases.map((release, i) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-3r5sesm7": true }, { "default": ($$result3) => renderTemplate`${i > 0 && renderTemplate`<hr class="archive__rule" data-astro-cid-3r5sesm7>`}${renderComponent($$result3, "ReleaseBlock", $$ReleaseBlock, { "release": release, "open": release.version === openVersion, "data-astro-cid-3r5sesm7": true })} ` })}`)} </section> ` })} `;
}, "/app/src/components/DownloadsPage.astro", void 0);

export { $$DownloadsPage as $ };

import { eventBySlug, registrationByTicket, type EventRow } from './db.js';
import { pool } from './main.js';

/** Server-side twin of the client theme derivation, so the first document paints themed. */
export function paletteFromKey(key: string): {
  ground: string; ink: string; button: string; buttonActive: string;
} {
  const c = key.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const f = (n: number, hue: number, sat: number, lig: number) => {
    const a = sat * Math.min(lig, 1 - lig);
    const k = (n + hue / 30) % 12;
    const v = lig - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  const hex = (hue: number, sat: number, lig: number) => `#${f(0, hue, sat, lig)}${f(8, hue, sat, lig)}${f(4, hue, sat, lig)}`;
  return {
    ground: hex(h, 0.08, 0.94),
    ink: hex(h, 1, 0.11),
    button: hex(h, Math.max(0.55, s), 0.45),
    buttonActive: hex(h, Math.max(0.55, s), 0.38),
  };
}

/**
 * Inject an event's whole palette into the application shell so the browser's
 * first document for that address already wears the theme. One query per
 * HTML navigation; static assets bypass this entirely.
 */
export async function themedShell(baseHtml: string, pathname: string): Promise<string> {
  const key = await themeKeyFor(pathname);
  if (!key) return baseHtml;
  const p = paletteFromKey(key);
  const style = `<style id="event-theme">
:root{--event-key:${key};--event-ground:${p.ground};--event-ink:${p.ink};--event-ink-secondary:rgba(0,15,58,0.36);--event-hairline:rgba(0,15,58,0.08);--event-panel:rgba(0,15,58,0.04);--event-button:${p.button};--event-button-active:${p.buttonActive};--event-button-ink:#ffffff}
html.theme-warm{background:${p.ground}}
</style>`;
  return baseHtml.replace('<!--THEME-->', style);
}

async function themeKeyFor(pathname: string): Promise<string | null> {
  const evMatch = /^\/([a-z0-9][a-z0-9-]*)$/.exec(pathname);
  if (evMatch) {
    const ev: EventRow | undefined = await eventBySlug(pool, evMatch[1]);
    if (ev && ev.state !== 'draft') return ev.theme_hex;
    return null;
  }
  const tkMatch = /^\/t\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (tkMatch) {
    const reg = await registrationByTicket(pool, tkMatch[1].toUpperCase());
    if (!reg) return null;
    const ev: EventRow | undefined = await eventBySlug(pool, reg.event_id);
    if (ev) return ev.theme_hex;
    const rows = await pool.query('select theme_hex from events where id = $1', [reg.event_id]);
    return rows.rows[0]?.theme_hex ?? null;
  }
  return null;
}

/** RFC 3339 with a trailing Z, always. No local times cross the API. */
export function toRfc3339(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function parseInstant(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})$/.test(v.trim())) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function isIanaZone(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 64) return false;
  if (!/^[A-Za-z_\/+\-0-9]+$/.test(v)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

const ZONE_FALLBACK = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });

export function zoneFormatter(tz: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return ZONE_FALLBACK;
  }
}

/** Long-form date and time in a zone, e.g. "Thursday, April 3, 2025 at 6:00 PM". */
export function formatInZone(d: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const tf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return `${dtf.format(d)} · ${tf.format(d)}`;
}

/** Short offset label such as GMT+5:30 or GMT+2. */
export function zoneOffsetLabel(d: Date, tz: string): string {
  const parts = zoneFormatter(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const tzName = get('timeZoneName');
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tzName);
  if (!m) return tzName || tz;
  const hh = m[1];
  const mm = m[2] && m[2] !== '00' ? `:${m[2]}` : '';
  return `GMT${hh}${mm}`;
}

export function zoneShortName(tz: string): string {
  return tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

export function visitorZone(): string {
  return 'UTC';
}

/** Calendar file body for one event, UTC instants. */
export function icsFor(opts: { uid: string; title: string; description: string; location: string; startsAt: Date; endsAt: Date; url: string }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//deku//community calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.startsAt)}`,
    `DTEND:${stamp(opts.endsAt)}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    `URL:${opts.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

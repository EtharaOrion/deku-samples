/**
 * Every instant crossing the API is UTC. An event is written out in its own
 * IANA zone, and the visitor's own zone is added underneath only when the two
 * actually differ. Displaying a zone never changes the stored instant.
 */

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function parts(iso: string, zone: string): Record<string, string> {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false,
    timeZoneName: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** e.g. "Thu 18 Sep 2025, 19:00 GMT+2" */
export function formatInZone(iso: string | null, zone: string): string {
  if (!iso) return '';
  try {
    const p = parts(iso, zone);
    return `${p['weekday']} ${p['day']} ${p['month']} ${p['year']}, ${p['hour']}:${p['minute']} ${p['timeZoneName']}`;
  } catch {
    return iso;
  }
}

export function formatRange(startIso: string | null, endIso: string | null, zone: string): string {
  if (!startIso) return '';
  const start = formatInZone(startIso, zone);
  if (!endIso) return start;
  try {
    const sameDay =
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'short' }).format(new Date(startIso)) ===
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, dateStyle: 'short' }).format(new Date(endIso));
    const e = parts(endIso, zone);
    return sameDay ? `${start} – ${e['hour']}:${e['minute']}` : `${start} – ${formatInZone(endIso, zone)}`;
  } catch {
    return start;
  }
}

/** True when the event's zone and the visitor's zone put the instant at a
 *  different wall-clock reading, which is when the second line is worth showing. */
export function zonesDiffer(iso: string | null, eventZone: string): boolean {
  if (!iso) return false;
  const mine = visitorZone();
  if (mine === eventZone) return false;
  try {
    const f = (z: string) => new Intl.DateTimeFormat('en-GB', {
      timeZone: z, dateStyle: 'short', timeStyle: 'short',
    }).format(new Date(iso));
    return f(eventZone) !== f(mine);
  } catch {
    return false;
  }
}

/** The date chip: a month label above a day number, in the event's zone. */
export function chipParts(iso: string | null, zone: string): { month: string; day: string } {
  if (!iso) return { month: '', day: '' };
  try {
    const p = parts(iso, zone);
    return { month: (p['month'] ?? '').toUpperCase(), day: p['day'] ?? '' };
  } catch {
    return { month: '', day: '' };
  }
}

/** The bar clock, e.g. "1:34 PM GMT+5:30". */
export function barClock(now: Date = new Date()): string {
  try {
    const zone = visitorZone();
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(now);
    const tzName = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, timeZoneName: 'longOffset',
    }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${time} ${tzName.replace('GMT+00:00', 'GMT').replace(/:00$/, '')}`.trim();
  } catch {
    return '';
  }
}

/** An .ics file for one event, built in the browser from the stored instants. */
export function icsFor(ev: {
  title: string; starts_at: string; ends_at: string; city?: string;
  slug: string; description?: string;
}, url: string): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => (s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deku Events//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.slug}@deku.events`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`,
    `DTEND:${stamp(ev.ends_at)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.city ? `LOCATION:${esc(ev.city)}` : '',
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : '',
    `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

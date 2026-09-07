/**
 * Every instant crossing the API is UTC. The interface writes each event in the
 * zone the event is actually held in, and adds the visitor's own zone
 * underneath whenever the two differ. Displaying a zone never moves the instant.
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
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

export function zoneAbbrev(iso: string, zone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
    const p = fmt.formatToParts(new Date(iso)).find((x) => x.type === 'timeZoneName');
    return p?.value ?? zone;
  } catch {
    return zone;
  }
}

export function formatDateTime(iso: string | null | undefined, zone: string): string {
  if (!iso) return '';
  const p = parts(iso, zone);
  return `${p['weekday']}, ${p['day']} ${p['month']} ${p['year']} · ${p['hour']}:${p['minute']} ${(p['dayPeriod'] ?? '').toUpperCase()}`;
}

export function formatRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  zone: string,
): string {
  if (!startIso) return 'Date to be announced';
  const s = parts(startIso, zone);
  const head = `${s['weekday']}, ${s['day']} ${s['month']} ${s['year']}`;
  const from = `${s['hour']}:${s['minute']} ${(s['dayPeriod'] ?? '').toUpperCase()}`;
  if (!endIso) return `${head} · ${from}`;
  const e = parts(endIso, zone);
  const to = `${e['hour']}:${e['minute']} ${(e['dayPeriod'] ?? '').toUpperCase()}`;
  const sameDay = s['day'] === e['day'] && s['month'] === e['month'] && s['year'] === e['year'];
  return sameDay
    ? `${head} · ${from} – ${to}`
    : `${head} ${from} – ${e['weekday']}, ${e['day']} ${e['month']} ${to}`;
}

export function formatShortDate(iso: string | null | undefined, zone: string): string {
  if (!iso) return '';
  const p = parts(iso, zone);
  return `${p['day']} ${p['month']} · ${p['hour']}:${p['minute']} ${(p['dayPeriod'] ?? '').toUpperCase()}`;
}

export function dateChip(iso: string | null | undefined, zone: string): { month: string; day: string } {
  if (!iso) return { month: '—', day: '' };
  const p = parts(iso, zone);
  return { month: (p['month'] ?? '').toUpperCase(), day: p['day'] ?? '' };
}

/** True when the visitor's zone renders this instant differently from the event's. */
export function zonesDiffer(iso: string | null | undefined, eventZone: string): boolean {
  if (!iso) return false;
  const mine = visitorZone();
  if (mine === eventZone) return false;
  return formatDateTime(iso, eventZone) !== formatDateTime(iso, mine) || zoneAbbrev(iso, mine) !== zoneAbbrev(iso, eventZone);
}

/** The live local clock in the top bar, as `1:34 PM GMT+5:30`. */
export function localClock(now = new Date()): string {
  const zone = visitorZone();
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  const offsetMinutes = -new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTimezoneOffset();
  const local = new Date(now.toLocaleString('en-US', { timeZone: zone }));
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const diff = Math.round((local.getTime() - utc.getTime()) / 60000);
  const sign = diff < 0 ? '-' : '+';
  const abs = Math.abs(diff);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  void offsetMinutes;
  return `${time} GMT${sign}${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
}

export function isPast(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

/** A calendar file for one event, handed to the visitor from the ticket. */
export function icsFor(e: {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  location?: string;
  city?: string;
  slug: string;
}): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.slug}@community-calendar`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    e.ends_at ? `DTEND:${stamp(e.ends_at)}` : '',
    `SUMMARY:${escape(e.title)}`,
    `LOCATION:${escape([e.location, e.city].filter(Boolean).join(', '))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

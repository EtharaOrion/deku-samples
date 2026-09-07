/**
 * Every instant crosses the API in UTC. The interface renders each event in
 * the zone it is actually held in, and adds the visitor's own zone underneath
 * whenever the two differ. Displaying a zone never changes the stored instant.
 */

export const visitorZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function fmt(iso: string, zone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone }).format(
      new Date(iso),
    );
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(
      new Date(iso),
    );
  }
}

export function dateInZone(iso: string | null, zone: string): string {
  if (!iso) return 'Date to be announced';
  return fmt(iso, zone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeInZone(iso: string | null, zone: string): string {
  if (!iso) return '';
  return fmt(iso, zone, { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function dateTimeInZone(iso: string | null, zone: string): string {
  if (!iso) return 'Date to be announced';
  return `${dateInZone(iso, zone)}, ${timeInZone(iso, zone)}`;
}

export function rangeInZone(
  startIso: string | null,
  endIso: string | null,
  zone: string,
): string {
  if (!startIso) return 'Date to be announced';
  const start = dateTimeInZone(startIso, zone);
  if (!endIso) return start;
  const sameDay =
    fmt(startIso, zone, { year: 'numeric', month: '2-digit', day: '2-digit' }) ===
    fmt(endIso, zone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return sameDay
    ? `${start} – ${timeInZone(endIso, zone)}`
    : `${start} – ${dateTimeInZone(endIso, zone)}`;
}

export function zoneAbbreviation(iso: string | null, zone: string): string {
  if (!iso) return zone;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch {
    return zone;
  }
}

/** True when the visitor's own zone would show this instant differently. */
export function zonesDiffer(iso: string | null, zone: string): boolean {
  if (!iso) return false;
  const mine = visitorZone();
  if (mine === zone) return false;
  return dateTimeInZone(iso, zone) !== dateTimeInZone(iso, mine);
}

export function monthLabel(iso: string | null, zone: string): string {
  if (!iso) return '—';
  return fmt(iso, zone, { month: 'short' }).toUpperCase();
}

export function dayLabel(iso: string | null, zone: string): string {
  if (!iso) return '–';
  return fmt(iso, zone, { day: 'numeric' });
}

/** The bar's live clock, in the format `1:34 PM GMT+5:30`. */
export function visitorClock(now: Date = new Date()): string {
  const zone = visitorZone();
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zone,
  }).format(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const offset = raw.replace(/^GMT([+-])0?(\d+):(\d\d)$/, (_m, sign, h, mm) =>
    mm === '00' ? `GMT${sign}${h}` : `GMT${sign}${h}:${mm}`,
  );
  return `${time} ${offset === 'GMT' ? 'GMT+0' : offset}`;
}

/** A calendar file for one event, generated in the browser. */
export function icsFor(event: {
  title: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  city: string;
  ticket_code?: string | null;
}): string {
  const stamp = (iso: string | null) =>
    iso ? iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.slug}@community-calendar`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    event.ends_at ? `DTEND:${stamp(event.ends_at)}` : '',
    `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc(event.city)}`,
    event.ticket_code ? `DESCRIPTION:${esc(`Ticket ${event.ticket_code}`)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

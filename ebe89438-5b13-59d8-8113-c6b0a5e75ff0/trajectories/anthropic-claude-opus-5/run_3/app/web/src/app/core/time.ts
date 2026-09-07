/**
 * Time and time zones. Every timestamp crossing the API is an instant in UTC;
 * time_zone decides how a stored instant is written out, never what that
 * instant is.
 */

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function fmt(instant: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(new Date(instant));
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(instant));
  }
}

export function zoneAbbrev(instant: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' }).formatToParts(
      new Date(instant)
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function dateLine(instant: string | null, timeZone: string) {
  if (!instant) return 'Date to be announced';
  return fmt(instant, timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeLine(instant: string | null, timeZone: string) {
  if (!instant) return '';
  return fmt(instant, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function rangeLine(startsAt: string | null, endsAt: string | null, timeZone: string) {
  if (!startsAt) return 'Date to be announced';
  const start = timeLine(startsAt, timeZone);
  const end = endsAt ? timeLine(endsAt, timeZone) : '';
  const zone = zoneAbbrev(startsAt, timeZone);
  return end ? `${start} \u2013 ${end} ${zone}` : `${start} ${zone}`;
}

/** True when the visitor's own zone writes this instant differently. */
export function zonesDiffer(instant: string | null, timeZone: string) {
  if (!instant) return false;
  const own = visitorZone();
  if (own === timeZone) return false;
  const a = fmt(instant, timeZone, { dateStyle: 'medium', timeStyle: 'short' });
  const b = fmt(instant, own, { dateStyle: 'medium', timeStyle: 'short' });
  return a !== b;
}

export function visitorLine(startsAt: string | null, endsAt: string | null) {
  return rangeLine(startsAt, endsAt, visitorZone());
}

export function shortDate(instant: string | null, timeZone: string) {
  if (!instant) return 'TBA';
  return fmt(instant, timeZone, { day: 'numeric', month: 'short' });
}

export function dayNumber(instant: string | null, timeZone: string) {
  if (!instant) return '\u2013';
  return fmt(instant, timeZone, { day: 'numeric' });
}

export function monthLabel(instant: string | null, timeZone: string) {
  if (!instant) return 'TBA';
  return fmt(instant, timeZone, { month: 'short' }).toUpperCase();
}

export function arrivalLine(instant: string | null, timeZone: string) {
  if (!instant) return '';
  return fmt(instant, timeZone, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** The bar's clock: 1:34 PM GMT+5:30, updating once a minute on the minute. */
export function clockLine(now: Date = new Date()) {
  const zone = visitorZone();
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: zone,
  }).format(now);
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const offset = mm ? `GMT${sign}${hh}:${String(mm).padStart(2, '0')}` : `GMT${sign}${hh}`;
  return `${time} ${offset}`;
}

/** Milliseconds until the next minute turns, so the clock ticks on the minute. */
export function msToNextMinute(now: Date = new Date()) {
  return 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

/** A calendar file for one event, handed to the visitor from the ticket. */
export function icsFor(event: {
  title: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  location?: string;
  description?: string;
}) {
  const stamp = (iso: string | null) =>
    iso ? new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  const escape = (s: string) => (s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deku//Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.slug}@deku.events`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    event.ends_at ? `DTEND:${stamp(event.ends_at)}` : '',
    `SUMMARY:${escape(event.title)}`,
    event.location ? `LOCATION:${escape(event.location)}` : '',
    event.description ? `DESCRIPTION:${escape(event.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

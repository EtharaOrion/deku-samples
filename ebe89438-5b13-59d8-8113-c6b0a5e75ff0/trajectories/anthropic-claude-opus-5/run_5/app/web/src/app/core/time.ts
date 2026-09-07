/**
 * Every instant crossing the API is UTC with a trailing Z. The interface writes
 * each event in the zone it is actually held in, and adds the visitor's own zone
 * underneath whenever the two differ. The stored instant never changes.
 */

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function fmt(instant: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(new Date(instant));
  } catch {
    return new Date(instant).toISOString();
  }
}

export function dayLine(instant: string | null, timeZone: string): string {
  if (!instant) return 'Date to be announced';
  return fmt(instant, timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDay(instant: string | null, timeZone: string): string {
  if (!instant) return 'TBA';
  return fmt(instant, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeLine(instant: string | null, timeZone: string): string {
  if (!instant) return '';
  return fmt(instant, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function timeRange(start: string | null, end: string | null, timeZone: string): string {
  if (!start) return 'Time to be announced';
  const a = timeLine(start, timeZone);
  const b = end ? timeLine(end, timeZone) : '';
  return b ? `${a} to ${b}` : a;
}

export function zoneAbbrev(instant: string | null, timeZone: string): string {
  if (!instant) return timeZone;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date(instant));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function zonesDiffer(instant: string | null, eventZone: string): boolean {
  const own = visitorZone();
  if (own === eventZone) return false;
  if (!instant) return true;
  // Two names can still name the same offset, in which case there is nothing to add.
  return offsetMinutes(instant, own) !== offsetMinutes(instant, eventZone);
}

function offsetMinutes(instant: string, timeZone: string): number {
  try {
    const d = new Date(instant);
    const local = new Date(d.toLocaleString('en-US', { timeZone }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((local.getTime() - utc.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function monthLabel(instant: string | null, timeZone: string): string {
  if (!instant) return '—';
  return fmt(instant, timeZone, { month: 'short' }).toUpperCase();
}

export function dayNumber(instant: string | null, timeZone: string): string {
  if (!instant) return '·';
  return fmt(instant, timeZone, { day: 'numeric' });
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
  const minutes = offsetMinutes(now.toISOString(), zone);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const offset = mins === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${String(mins).padStart(2, '0')}`;
  return `${time} ${offset}`;
}

export function hasPassed(endsAt: string | null): boolean {
  return !!endsAt && new Date(endsAt).getTime() < Date.now();
}

/** A calendar file the visitor can hand to their own calendar app. */
export function icsFor(event: {
  title: string;
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  city: string | null;
  description?: string;
}): string {
  const stamp = (v: string | null) =>
    v ? new Date(v).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  const escape = (v: string) => v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deku//Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.slug}@deku.events`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    `DTEND:${stamp(event.ends_at)}`,
    `SUMMARY:${escape(event.title)}`,
    event.city ? `LOCATION:${escape(event.city)}` : '',
    event.description ? `DESCRIPTION:${escape(event.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

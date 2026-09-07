/**
 * Times are shown in the event's own zone, with the visitor's zone underneath
 * whenever the two differ. The stored instant never changes when a zone is
 * displayed.
 */

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function fmt(iso: string, zone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-GB', opts).format(new Date(iso));
  }
}

export function longDate(iso: string | null, zone: string): string {
  if (!iso) return 'Date to be announced';
  return fmt(iso, zone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDate(iso: string | null, zone: string): string {
  if (!iso) return 'TBA';
  return fmt(iso, zone, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeOfDay(iso: string | null, zone: string): string {
  if (!iso) return '';
  return fmt(iso, zone, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function zoneAbbr(iso: string | null, zone: string): string {
  if (!iso) return zone;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}

export function dayNumber(iso: string | null, zone: string): string {
  if (!iso) return '--';
  return fmt(iso, zone, { day: 'numeric' });
}

export function monthLabel(iso: string | null, zone: string): string {
  if (!iso) return 'TBA';
  return fmt(iso, zone, { month: 'short' }).toUpperCase();
}

/** The whole line an event page shows for its own zone. */
export function whenLine(startsAt: string | null, endsAt: string | null, zone: string): string {
  if (!startsAt) return 'Date to be announced';
  const start = `${longDate(startsAt, zone)}, ${timeOfDay(startsAt, zone)}`;
  const end = endsAt ? timeOfDay(endsAt, zone) : '';
  return end ? `${start} to ${end} ${zoneAbbr(startsAt, zone)}` : `${start} ${zoneAbbr(startsAt, zone)}`;
}

/** The same instant in the visitor's own zone, or null when the zones agree. */
export function visitorLine(startsAt: string | null, zone: string): string | null {
  if (!startsAt) return null;
  const mine = visitorZone();
  if (mine === zone) return null;
  const there = fmt(startsAt, zone, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const here = fmt(startsAt, mine, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  if (there === here) return null;
  return `${longDate(startsAt, mine)}, ${timeOfDay(startsAt, mine)} ${zoneAbbr(startsAt, mine)} your time`;
}

/** The live clock in the public bar: 1:34 PM GMT+5:30. */
export function visitorClock(now: Date = new Date()): string {
  const zone = visitorZone();
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(now);
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'longOffset',
  })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return `${time} ${offset.replace('GMT', 'GMT').replace(/^UTC/, 'GMT')}`;
}

/** A calendar file for one event, handed to the visitor from the ticket. */
export function icsFor(e: {
  title: string;
  event_slug?: string;
  slug?: string;
  starts_at: string | null;
  ends_at: string | null;
  city: string;
}): string {
  const key = e.event_slug ?? e.slug ?? 'event';
  const stamp = (iso: string | null) =>
    iso ? new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deku//Community Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${key}@deku.events`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    e.ends_at ? `DTEND:${stamp(e.ends_at)}` : '',
    `SUMMARY:${escape(e.title)}`,
    `LOCATION:${escape(e.city)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

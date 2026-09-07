/**
 * Times render in the event's own zone, with the visitor's zone beneath
 * whenever the two differ. The stored instant never changes.
 */

export function zoneName(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export function sameZone(timeZone: string): boolean {
  const now = new Date();
  const a = zoneName(now, timeZone);
  const b = zoneName(now, visitorZone());
  return a === b;
}

export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatInZone(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(d);
  }
}

export function eventWhen(iso: string, timeZone: string): string {
  return formatInZone(iso, timeZone, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function eventZoneTag(iso: string, timeZone: string): string {
  return zoneName(new Date(iso), timeZone);
}

export function visitorWhen(iso: string): string {
  return formatInZone(iso, visitorZone(), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' ' + zoneName(new Date(iso), visitorZone());
}

export function dateChip(iso: string, timeZone: string): { month: string; day: string } {
  return {
    month: formatInZone(iso, timeZone, { month: 'short' }).toUpperCase(),
    day: formatInZone(iso, timeZone, { day: '2-digit' }),
  };
}

export function cardDate(iso: string, timeZone: string): string {
  return formatInZone(iso, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function localClock(date: Date): string {
  // 1:34 PM GMT+5:30
  const tz = zoneName(date, visitorZone());
  let time: string;
  try {
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: visitorZone() }).format(date);
  } catch {
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  }
  return `${time} ${tz}`;
}

/** Calendar file for one event, handed to the visitor from the ticket page. */
export function icsFor(event: { title: string; description?: string; city: string; starts_at: string; ends_at: string; slug: string }): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gatherline//EN',
    'BEGIN:VEVENT',
    `UID:${event.slug}@gatherline`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.starts_at)}`,
    `DTEND:${stamp(event.ends_at)}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.city}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

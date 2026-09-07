/**
 * Every timestamp crossing the API is an instant in UTC. The interface renders
 * each event in the event's own zone, and adds the visitor's zone underneath
 * whenever the two differ. Displaying a zone never changes the stored instant.
 */

export function visitorZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

export function formatIn(iso: string | null, zone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return 'Date to be announced';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false, ...opts,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

export function longDateIn(iso: string | null, zone: string): string {
  if (!iso) return 'Date to be announced';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso));
  } catch { return new Date(iso).toDateString(); }
}

export function timeRangeIn(startIso: string | null, endIso: string | null, zone: string): string {
  if (!startIso) return '';
  const t = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(iso));
    } catch { return ''; }
  };
  const zoneName = shortZone(startIso, zone);
  return endIso ? `${t(startIso)} - ${t(endIso)} ${zoneName}` : `${t(startIso)} ${zoneName}`;
}

export function shortZone(iso: string, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value || zone;
  } catch { return zone; }
}

/** True when the event's zone and the visitor's own resolve to different clocks. */
export function zonesDiffer(iso: string | null, eventZone: string): boolean {
  if (!iso) return false;
  const mine = visitorZone();
  if (mine === eventZone) return false;
  return formatIn(iso, eventZone) !== formatIn(iso, mine);
}

/** The bar's live local clock, in the format 1:34 PM GMT+5:30. */
export function visitorClock(now = new Date()): string {
  const zone = visitorZone();
  let time = '';
  try {
    time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(now);
  } catch { time = now.toISOString().slice(11, 16); }
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${time} GMT${sign}${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
}

export function dateChip(iso: string | null, zone: string): { month: string; day: string } {
  if (!iso) return { month: 'TBA', day: '--' };
  try {
    const month = new Intl.DateTimeFormat('en-GB', { timeZone: zone, month: 'short' })
      .format(new Date(iso)).toUpperCase();
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric' })
      .format(new Date(iso));
    return { month, day };
  } catch { return { month: 'TBA', day: '--' }; }
}

/** Hands the visitor a calendar file for one event, generated in the browser. */
export function icsFor(e: { title: string; slug: string; starts_at: string | null;
                            ends_at: string | null; city: string; }): string {
  const stamp = (iso: string | null) =>
    iso ? new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : '';
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deku Events//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.slug}@deku.events`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.starts_at)}`,
    e.ends_at ? `DTEND:${stamp(e.ends_at)}` : '',
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(e.city)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

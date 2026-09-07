export function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Zone offset written the way the top bar shows it, e.g. GMT+5:30. */
export function zoneLabel(zone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    return name.replace('GMT+00:00', 'GMT').replace(/([+-])0?(\d+):(\d\d)/, (_m, s, h, mm) => `${s}${Number(h)}:${mm}`);
  } catch {
    return 'GMT';
  }
}

export function clockLabel(zone: string, at: Date = new Date()): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(at);
  return `${time} ${zoneLabel(zone, at)}`;
}

export function formatInZone(iso: string | null | undefined, zone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone || 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatRange(startIso: string, endIso: string, zone: string): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  const dayFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone || 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone || 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const day = dayFmt.format(start);
  const from = timeFmt.format(start);
  const to = endIso ? timeFmt.format(new Date(endIso)) : '';
  return to ? `${day}, ${from} – ${to}` : `${day}, ${from}`;
}

/** Whether a stored instant reads differently in two zones. */
export function zonesDiffer(iso: string, a: string, b: string): boolean {
  if (!iso || !a || !b || a === b) return false;
  return formatInZone(iso, a) !== formatInZone(iso, b);
}

export function shortDate(iso: string, zone: string): { month: string; day: string } {
  if (!iso) return { month: '', day: '' };
  const d = new Date(iso);
  return {
    month: new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'UTC', month: 'short' }).format(d).toUpperCase(),
    day: new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'UTC', day: 'numeric' }).format(d),
  };
}

/** Build an .ics file for one event, generated in the browser, no network. */
export function icsFor(ev: { title: string; slug: string; starts_at: string; ends_at: string; city?: string; description?: string }): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => (s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Deku Community Calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.slug}@deku`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(ev.starts_at)}`,
    `DTEND:${stamp(ev.ends_at || ev.starts_at)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.city ? `LOCATION:${esc(ev.city)}` : '',
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function initialsOf(name: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

const AVATAR_HUES = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff'];

export function avatarHue(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < (name ?? '').length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return AVATAR_HUES[(h >>> 0) % AVATAR_HUES.length];
}

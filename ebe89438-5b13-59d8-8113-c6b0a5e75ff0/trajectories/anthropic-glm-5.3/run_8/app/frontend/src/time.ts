/** Time helpers: the stored instant never changes when a zone is displayed. */

export function rfc3339ToParts(iso: string): { month: string; day: string; date: Date } {
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
    day: String(d.getUTCDate()).padStart(2, '0'),
    date: d,
  };
}

function offsetLabel(date: Date, zone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' });
  const part = fmt.formatToParts(date).find((p) => p.type === 'timeZoneName');
  return part?.value ?? 'UTC';
}

export function zoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** 18:00 Europe/Berlin -> "Thu, 15 Sep, 19:00" in that zone. */
export function inZone(iso: string, zone: string, opts: { withTime?: boolean } = {}): string {
  const d = new Date(iso);
  const withTime = opts.withTime !== false;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: withTime ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    hour: withTime ? '2-digit' : undefined,
    minute: withTime ? '2-digit' : undefined,
  }).format(d);
}

export function zoneLine(iso: string, zone: string): string {
  const d = new Date(iso);
  return `${inZone(iso, zone)} ${offsetLabel(d, zone)}`;
}

/** The visitor's own zone line, shown underneath whenever the two differ. */
export function visitorLine(iso: string, eventZone: string): string | null {
  const mine = zoneName();
  if (mine === eventZone) return null;
  return `${zoneLine(iso, mine)} (your time)`;
}

/** The bar clock: "1:34 PM GMT+5:30", on the minute. */
export function localClock(d: Date): string {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset',
  }).format(d);
  return time;
}

export function countdownMinutes(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 60000;
}

export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Short wait, used to align a "working" state to the eye. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

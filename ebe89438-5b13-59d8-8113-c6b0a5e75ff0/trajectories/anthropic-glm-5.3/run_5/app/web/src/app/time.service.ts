import { Injectable, signal } from '@angular/core';

function offsetLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return name;
  const mm = m[2] && m[2] !== '00' ? `:${m[2]}` : '';
  return `GMT${m[1]}${mm}`;
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

@Injectable({ providedIn: 'root' })
export class TimeService {
  readonly visitorZone = localZone();
  /** Live local clock, the anchor for every time the product shows. */
  private _now = signal(new Date());
  now = this._now.asReadonly();

  constructor() {
    const tick = () => {
      const d = new Date();
      // update once a minute on the minute
      const delay = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      setTimeout(() => {
        this._now.set(new Date());
        tick();
      }, delay);
    };
    tick();
  }

  clockLabel(date: Date = this._now()): string {
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
    return `${time} ${offsetLabel(date, this.visitorZone)}`;
  }

  /** Long date and time in a zone. */
  long(instant: string | Date, timeZone: string): string {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    const date = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${date} · ${time}`;
  }

  shortDate(instant: string | Date, timeZone: string): { month: string; day: string; year: number } {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return { month: get('month'), day: get('day'), year: Number(get('year')) };
  }

  zoneLabel(instant: string | Date, timeZone: string): string {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return offsetLabel(d, timeZone);
  }

  zoneCity(timeZone: string): string {
    return timeZone.split('/').pop()?.replace(/_/g, ' ') ?? timeZone;
  }

  /** True when the event zone and the visitor's zone write different wall times. */
  differsFromVisitor(instant: string | Date, timeZone: string): boolean {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    if (timeZone === this.visitorZone) return false;
    const a = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(d);
    const b = new Intl.DateTimeFormat('en-US', { timeZone: this.visitorZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(d);
    return a !== b;
  }

  relativeDays(instant: string | Date): number {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return Math.round((d.getTime() - Date.now()) / 86400000);
  }
}

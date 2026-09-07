import { Injectable } from '@angular/core';

const DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

@Injectable({ providedIn: 'root' })
export class TimeFmt {
  /** The visitor's own zone, as an IANA name. */
  localZone(): string {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }

  inZone(instant: string, zone: string, opts: Intl.DateTimeFormatOptions = {}): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', ...opts,
      }).format(new Date(instant));
    } catch { return new Date(instant).toUTCString(); }
  }

  /** Event zone first, the visitor's zone underneath when the two differ. */
  both(instant: string, zone: string): { primary: string; secondary: string | null } {
    const primary = this.inZone(instant, zone);
    const mine = this.localZone();
    if (mine === zone) return { primary, secondary: null };
    return { primary, secondary: `${this.inZone(instant, mine)} your time` };
  }

  /** The bar's live clock: 1:34 PM GMT+5:30. */
  clock(now: Date): string {
    const off = -now.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    const tz = `GMT${sign}${hh}:${mm}`;
    const t = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now);
    return `${t} ${tz}`;
  }

  dateChip(instant: string): { month: string; day: string } {
    const d = new Date(instant);
    return {
      month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase(),
      day: String(d.getUTCDate()),
    };
  }

  dateChipLocal(instant: string): { month: string; day: string } {
    const d = new Date(instant);
    return {
      month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase(),
      day: String(d.getDate()),
    };
  }

  isPast(instant: string): boolean { return new Date(instant).getTime() < Date.now(); }
}

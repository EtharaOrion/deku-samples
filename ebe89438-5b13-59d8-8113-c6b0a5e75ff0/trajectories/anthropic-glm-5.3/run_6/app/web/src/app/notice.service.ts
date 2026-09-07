import { Injectable, signal } from '@angular/core';

export type NoticeKind = 'info' | 'success' | 'warning' | 'danger';

@Injectable({ providedIn: 'root' })
export class NoticeService {
  current = signal<{ text: string; kind: NoticeKind } | null>(null);
  private timer: any = null;

  say(text: string, kind: NoticeKind = 'info') {
    this.current.set({ text, kind });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), 6000);
  }

  dismiss() {
    if (this.timer) clearTimeout(this.timer);
    this.current.set(null);
  }
}

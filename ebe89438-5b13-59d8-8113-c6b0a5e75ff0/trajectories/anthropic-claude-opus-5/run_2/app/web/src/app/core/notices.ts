import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info';

export interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
}

let seq = 0;

/**
 * A notice names the outcome in words and dismisses on its own after 6000ms.
 * It is announced politely; the registration panel keeps its own assertive
 * live region rather than borrowing this one.
 */
@Injectable({ providedIn: 'root' })
export class Notices {
  readonly items = signal<Notice[]>([]);

  show(message: string, tone: NoticeTone = 'info') {
    const notice: Notice = { id: ++seq, tone, message };
    this.items.update((list) => [...list, notice]);
    setTimeout(() => this.dismiss(notice.id), 6000);
  }

  success = (m: string) => this.show(m, 'success');
  info = (m: string) => this.show(m, 'info');
  warn = (m: string) => this.show(m, 'warning');
  danger = (m: string) => this.show(m, 'danger');

  dismiss(id: number) {
    this.items.update((list) => list.filter((n) => n.id !== id));
  }
}

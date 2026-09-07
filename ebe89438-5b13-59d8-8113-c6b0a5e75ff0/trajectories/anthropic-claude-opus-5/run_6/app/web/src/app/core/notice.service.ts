import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface Notice { id: number; text: string; tone: NoticeTone; }

/** A notice names the outcome in words and dismisses itself after 6000ms. */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  show(text: string, tone: NoticeTone = 'info') {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

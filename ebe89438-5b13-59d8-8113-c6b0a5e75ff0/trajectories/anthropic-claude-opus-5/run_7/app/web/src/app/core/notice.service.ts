import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface Notice {
  id: number;
  text: string;
  tone: NoticeTone;
}

const DISMISS_AFTER = 6000;

@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  /** A notice names the outcome in words, is announced politely, and
   *  dismisses on its own after 6000ms. */
  show(text: string, tone: NoticeTone = 'info') {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), DISMISS_AFTER);
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

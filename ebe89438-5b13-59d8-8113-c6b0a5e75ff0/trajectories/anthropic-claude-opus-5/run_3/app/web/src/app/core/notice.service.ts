import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export type Notice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

/**
 * A notice names the outcome in words, dismisses on its own after 6000ms, and
 * is announced politely.
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  show(message: string, tone: NoticeTone = 'info') {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, message, tone }]);
    setTimeout(() => this.dismiss(id), 6000);
    return id;
  }

  success(message: string) {
    return this.show(message, 'success');
  }

  refuse(message: string) {
    return this.show(message, 'danger');
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info';

export interface Notice {
  id: number;
  text: string;
  tone: NoticeTone;
}

/**
 * A notice names the outcome in words and carries the status hue as a leading
 * edge rather than as a fill. It dismisses itself after 6000ms and is announced
 * politely; only the registration panel's own answer is assertive.
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  show(text: string, tone: NoticeTone = 'info') {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  success(text: string) {
    this.show(text, 'success');
  }
  warn(text: string) {
    this.show(text, 'warning');
  }
  refuse(text: string) {
    this.show(text, 'danger');
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

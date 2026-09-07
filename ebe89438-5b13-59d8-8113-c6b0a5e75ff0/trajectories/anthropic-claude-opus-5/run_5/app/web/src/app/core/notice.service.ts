import { Injectable, signal } from '@angular/core';
import type { StatusTone } from './models';

export interface Notice {
  id: number;
  message: string;
  tone: StatusTone;
  /** The registration panel's own answer is assertive; everything else polite. */
  assertive: boolean;
}

const DISMISS_AFTER_MS = 6000;

@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  show(message: string, tone: StatusTone = 'info', assertive = false): void {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, message, tone, assertive }]);
    setTimeout(() => this.dismiss(id), DISMISS_AFTER_MS);
  }

  success(message: string) {
    this.show(message, 'success');
  }

  refusal(message: string) {
    this.show(message, 'danger');
  }

  pending(message: string) {
    this.show(message, 'warning');
  }

  dismiss(id: number): void {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

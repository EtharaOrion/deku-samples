import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
}

/** A bar that names the outcome in words, dismissing itself after 6000ms. */
@Injectable({ providedIn: 'root' })
export class Notices {
  private seq = 0;
  readonly items = signal<Notice[]>([]);

  show(message: string, tone: NoticeTone = 'info') {
    const id = ++this.seq;
    this.items.update((list) => [...list, { id, message, tone }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  success(message: string) {
    this.show(message, 'success');
  }

  refuse(message: string) {
    this.show(message, 'danger');
  }

  dismiss(id: number) {
    this.items.update((list) => list.filter((n) => n.id !== id));
  }
}

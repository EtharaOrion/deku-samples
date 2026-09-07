import { Injectable, signal } from '@angular/core';

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info';

export interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NoticeService {
  readonly notices = signal<Notice[]>([]);
  private nextId = 1;

  show(message: string, tone: NoticeTone = 'info') {
    const id = this.nextId++;
    this.notices.update((list) => [...list, { id, tone, message }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number) {
    this.notices.update((list) => list.filter((n) => n.id !== id));
  }
}

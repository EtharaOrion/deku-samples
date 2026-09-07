import { Injectable, signal } from '@angular/core';

export type NoticeKind = 'success' | 'warning' | 'danger' | 'info';
export type Notice = { id: number; kind: NoticeKind; message: string };

@Injectable({ providedIn: 'root' })
export class NoticeService {
  private nextId = 1;
  private _notices = signal<Notice[]>([]);
  notices = this._notices.asReadonly();

  show(kind: NoticeKind, message: string) {
    const id = this.nextId++;
    this._notices.update((list) => [...list, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  success(message: string) { this.show('success', message); }
  warning(message: string) { this.show('warning', message); }
  danger(message: string) { this.show('danger', message); }
  info(message: string) { this.show('info', message); }

  dismiss(id: number) {
    this._notices.update((list) => list.filter((n) => n.id !== id));
  }
}

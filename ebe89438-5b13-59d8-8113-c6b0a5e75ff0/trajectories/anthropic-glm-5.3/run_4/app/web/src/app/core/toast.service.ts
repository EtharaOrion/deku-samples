import { Injectable, signal } from '@angular/core';

export type Toast = { id: number; message: string; tone: 'success' | 'warning' | 'danger' | 'info'; assertive?: boolean };

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  toasts = this._toasts.asReadonly();
  private next = 1;

  show(message: string, tone: Toast['tone'] = 'info', assertive = false): void {
    const id = this.next++;
    this._toasts.update((list) => [...list, { id, message, tone, assertive }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}

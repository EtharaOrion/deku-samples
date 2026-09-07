import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Notice { id: number; text: string; kind: 'info' | 'success' | 'warn' | 'danger'; }

@Injectable({ providedIn: 'root' })
export class NoticeService {
  private _notices = new BehaviorSubject<Notice[]>([]);
  notices$ = this._notices.asObservable();
  private seq = 0;

  show(text: string, kind: Notice['kind'] = 'info', ttlMs = 6000) {
    const id = ++this.seq;
    this._notices.next([...this._notices.value, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), ttlMs);
  }
  polite(text: string, kind: Notice['kind'] = 'info') { this.show(text, kind); }
  dismiss(id: number) {
    this._notices.next(this._notices.value.filter(n => n.id !== id));
  }
}

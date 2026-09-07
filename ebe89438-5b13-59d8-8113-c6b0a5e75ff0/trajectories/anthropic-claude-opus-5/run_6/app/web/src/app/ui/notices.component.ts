import { Component, inject } from '@angular/core';
import { NoticeService } from '../core/notice.service';

@Component({
  selector: 'app-notices',
  standalone: true,
  template: `
    <div class="notice-stack" aria-live="polite" aria-atomic="false">
      @for (n of notices.notices(); track n.id) {
        <div class="notice" [class]="'notice-' + n.tone">
          <div class="notice-body">{{ n.text }}</div>
          <button type="button" class="close" (click)="notices.dismiss(n.id)" aria-label="Dismiss this message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .close {
      background: none; border: none; cursor: pointer; color: var(--ink-64);
      padding: 12px; min-width: 44px; min-height: 44px;
      display: inline-flex; align-items: center; justify-content: center;
    }
  `],
})
export class NoticesComponent {
  notices = inject(NoticeService);
}

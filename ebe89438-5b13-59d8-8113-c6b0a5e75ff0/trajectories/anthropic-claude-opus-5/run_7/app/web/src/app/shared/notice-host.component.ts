import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NoticeService } from '../core/notice.service';
import { IconComponent } from './icons.component';

/** Notices sit at depth 9999 and are announced politely. */
@Component({
  selector: 'app-notice-host',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notice-stack" role="status" aria-live="polite">
      @for (n of notices.notices(); track n.id) {
        <div class="notice" [class.notice-success]="n.tone === 'success'"
             [class.notice-warning]="n.tone === 'warning'"
             [class.notice-danger]="n.tone === 'danger'">
          <span class="grow">{{ n.text }}</span>
          <button type="button" class="dismiss" (click)="notices.dismiss(n.id)"
                  aria-label="Dismiss this message">
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .grow { flex: 1; }
    .dismiss {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 44px; min-height: 44px; margin: -12px -8px -12px 0;
      cursor: pointer; color: var(--ink-tertiary);
      transition: color var(--dur) var(--ease);
    }
    .dismiss:hover { color: var(--ink); }
  `],
})
export class NoticeHostComponent {
  notices = inject(NoticeService);
}

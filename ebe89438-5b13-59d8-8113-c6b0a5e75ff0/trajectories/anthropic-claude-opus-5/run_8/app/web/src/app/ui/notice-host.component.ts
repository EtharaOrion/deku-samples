import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NoticeService } from '../core/notice.service';
import { IconComponent } from './icons.component';

/** A notice names the outcome in words and carries its hue as a leading edge. */
@Component({
  selector: 'app-notice-host',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (n of notices.notices(); track n.id) {
        <div class="notice" [class]="'tone-' + n.tone">
          <span class="msg t-row">{{ n.message }}</span>
          <button type="button" class="close" (click)="notices.dismiss(n.id)">
            <span class="sr-only">Dismiss this message</span>
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .stack {
        position: fixed;
        left: 50%;
        bottom: var(--s5);
        transform: translateX(-50%);
        z-index: var(--z-notice);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        width: min(560px, calc(100vw - 32px));
        pointer-events: none;
      }
      .notice {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: var(--s3);
        background: var(--paper);
        color: var(--ink);
        border-radius: var(--r-card);
        box-shadow: var(--elev-primary), var(--ring-card);
        padding: var(--s3) var(--s4);
        border-left: 4px solid var(--info);
        animation: notice-in 0.42s var(--ease-overshoot);
      }
      .tone-success {
        border-left-color: var(--success);
      }
      .tone-warning {
        border-left-color: var(--warning);
      }
      .tone-danger {
        border-left-color: var(--danger);
      }
      .tone-info {
        border-left-color: var(--info);
      }
      .msg {
        flex: 1;
      }
      .close {
        background: transparent;
        border: 0;
        cursor: pointer;
        color: var(--ink-64);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        border-radius: var(--r-nav);
      }
    `,
  ],
})
export class NoticeHostComponent {
  readonly notices = inject(NoticeService);
}

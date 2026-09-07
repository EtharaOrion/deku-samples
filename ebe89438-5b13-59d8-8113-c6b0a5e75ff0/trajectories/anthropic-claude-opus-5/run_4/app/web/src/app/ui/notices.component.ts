import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NoticeService } from '../core/notice.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-notices',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="host" role="status" aria-live="polite">
      @for (n of notices.notices(); track n.id) {
        <div class="notice anim-panel" [class]="'tone-' + n.tone">
          <span class="text">{{ n.text }}</span>
          <button type="button" class="x" (click)="notices.dismiss(n.id)" aria-label="Dismiss this message">
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .host {
        position: fixed;
        bottom: var(--s5);
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
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
        border: 1px solid var(--ink-08);
        border-left-width: 4px;
        border-radius: var(--r-card);
        padding: var(--s3) var(--s4);
        box-shadow: var(--elev-card);
        font-size: 15px;
        line-height: 22px;
        animation: panel-enter 0.3s var(--ease-panel) both;
      }
      .tone-success {
        border-left-color: #28cd41;
      }
      .tone-warning {
        border-left-color: #ffcc00;
      }
      .tone-danger {
        border-left-color: #ff3b30;
      }
      .tone-info {
        border-left-color: #007aff;
      }
      .text {
        flex: 1;
      }
      .x {
        background: none;
        border: 0;
        cursor: pointer;
        color: var(--ink-64);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        margin: -12px -8px -12px 0;
        border-radius: var(--r-nav);
      }
      @media (prefers-reduced-motion: reduce) {
        .notice {
          animation: none;
        }
      }
    `,
  ],
})
export class NoticesComponent {
  notices = inject(NoticeService);
}

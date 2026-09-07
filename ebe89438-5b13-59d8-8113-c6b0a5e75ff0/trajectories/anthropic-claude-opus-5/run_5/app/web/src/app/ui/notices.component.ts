import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NoticeService } from '../core/notice.service';
import { IconComponent } from './icon.component';

/**
 * A notice names the outcome in words and carries the status hue as a 4px
 * leading edge rather than as a fill, dismisses on its own after 6000ms, and is
 * announced politely.
 */
@Component({
  selector: 'app-notices',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dock">
      <div class="live" role="status" aria-live="polite" aria-atomic="true">
        @for (n of notices.notices(); track n.id) {
          @if (!n.assertive) {
            <span>{{ n.message }}</span>
          }
        }
      </div>
      <div class="live" role="alert" aria-live="assertive" aria-atomic="true">
        @for (n of notices.notices(); track n.id) {
          @if (n.assertive) {
            <span>{{ n.message }}</span>
          }
        }
      </div>

      @for (n of notices.notices(); track n.id) {
        <div class="notice" [class]="'notice notice--' + n.tone" data-reveal>
          <p class="notice__text">{{ n.message }}</p>
          <button type="button" class="notice__close" (click)="notices.dismiss(n.id)">
            <app-icon name="close" [size]="16" [colour]="'currentColor'" />
            <span class="visually-hidden">Dismiss this message</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .dock {
        position: fixed;
        right: var(--s4);
        bottom: var(--s4);
        z-index: var(--z-notice);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        max-width: min(420px, calc(100vw - 32px));
        pointer-events: none;
      }
      .live {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
      }
      .notice {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: var(--s3);
        background: var(--paper);
        color: var(--ink);
        border: 1px solid var(--ink-08);
        border-left: 4px solid var(--ink-36);
        border-radius: var(--r-card);
        box-shadow: var(--elev-fine);
        padding: var(--s3) var(--s4);
        animation: notice-enter 0.3s var(--ease-overshoot) both;
      }
      .notice--success { border-left-color: var(--success); }
      .notice--warning { border-left-color: var(--warning); }
      .notice--danger { border-left-color: var(--danger); }
      .notice--info { border-left-color: var(--info); }
      .notice--pink { border-left-color: var(--pink); }
      .notice__text { font-size: 15px; line-height: 22px; flex: 1; }
      .notice__close {
        border: 0;
        background: transparent;
        color: var(--ink-36);
        cursor: pointer;
        min-width: 44px;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: -10px -10px -10px 0;
      }
      @media (hover: hover) {
        .notice__close:hover { color: var(--ink); }
      }
      @media (max-width: 483px) {
        .dock { left: var(--s4); right: var(--s4); max-width: none; }
      }
    `,
  ],
})
export class NoticesComponent {
  readonly notices = inject(NoticeService);
}

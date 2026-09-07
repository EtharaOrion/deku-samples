import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Api } from '../core/api';

/** A bar at depth 9999 carrying its status hue as a leading edge, not a fill. */
@Component({
  selector: 'app-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (n of api.notices(); track n.id) {
        <div class="bar" [attr.data-kind]="n.kind">
          <p>{{ n.message }}</p>
          <button type="button" class="close" (click)="api.dismiss(n.id)" aria-label="Dismiss this message">&times;</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .stack {
      position: fixed; right: 16px; bottom: 16px; z-index: var(--z-toast);
      display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px));
    }
    .bar {
      display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px;
      background: var(--paper); border-radius: var(--r-card); box-shadow: var(--shadow-card), var(--ring-onboard);
    }
    .bar::before {
      content: ''; width: 4px; align-self: stretch; border-radius: 2px; background: var(--info); flex: none;
    }
    .bar[data-kind='success']::before { background: var(--success); }
    .bar[data-kind='warning']::before { background: var(--warning); }
    .bar[data-kind='danger']::before { background: var(--danger); }
    .bar p { font-size: 14px; line-height: 20px; margin: 0; }
    .close {
      border: none; background: none; font-size: 20px; line-height: 1; cursor: pointer;
      color: var(--ink-64); padding: 2px 6px; min-height: 28px; border-radius: var(--r-input);
    }
  `],
})
export class NoticesComponent {
  api = inject(Api);
}

import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticeService } from './core/notice.service';
import { SessionService } from './core/session.service';
import { IconComponent } from './shared/icons.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />

    <!-- Notices are announced politely; the registration panel's own answer is
         assertive and lives on that panel instead. -->
    <div class="notice-stack" role="status" aria-live="polite">
      @for (notice of notices.notices(); track notice.id) {
        <div class="notice" [class]="'notice notice-' + notice.tone">
          <span>{{ notice.message }}</span>
          <button type="button" class="dismiss" (click)="notices.dismiss(notice.id)">
            <app-icon name="close" [size]="14" />
            <span class="visually-hidden">Dismiss this message</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .dismiss {
        border: none;
        background: none;
        cursor: pointer;
        color: var(--ink-36);
        min-height: 24px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        flex: none;
      }

      @media (hover: hover) {
        .dismiss:hover {
          color: var(--ink);
        }
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  notices = inject(NoticeService);
  private session = inject(SessionService);

  ngOnInit() {
    // The session is restored once at boot, so no route paints twice for it.
    void this.session.restore();
  }
}

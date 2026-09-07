import { Component } from '@angular/core';
import { NoticeService } from '../notice.service';

/** Depth 9999, dismisses on its own, announced politely. */
@Component({
  selector: 'app-notices',
  standalone: true,
  template: `
    <div class="notices" role="status" aria-live="polite">
      @for (notice of svc.notices(); track notice.id) {
        <div class="notice {{ notice.kind }}">
          <p>{{ notice.message }}</p>
          <button type="button" (click)="svc.dismiss(notice.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
})
export class NoticesComponent {
  constructor(readonly svc: NoticeService) {}
}

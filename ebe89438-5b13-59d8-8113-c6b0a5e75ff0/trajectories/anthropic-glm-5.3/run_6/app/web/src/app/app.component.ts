import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticeService } from './notice.service';

@Component({
  selector: 'app-root', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <router-outlet></router-outlet>
    @if (notice.current(); as n) {
      <div class="toast" [class]="'t-' + n.kind" role="status" aria-live="polite">
        <span class="toast-text">{{ n.text }}</span>
        <button type="button" class="link toast-close" (click)="notice.dismiss()" aria-label="Dismiss notice">Close</button>
      </div>
    }
  `,
  styles: [':host{display:block;min-height:100vh}.toast-text{flex:1}'],
})
export class AppComponent { notice = inject(NoticeService); }

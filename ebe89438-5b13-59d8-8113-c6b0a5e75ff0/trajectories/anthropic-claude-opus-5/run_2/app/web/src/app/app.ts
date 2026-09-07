import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Api } from './core/api';
import { NoticeHostComponent } from './ui/kit';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet></router-outlet>
    <app-notice-host></app-notice-host>
  `,
})
export class App {
  private api = inject(Api);

  constructor() {
    // Confirms a stored token still stands; an expired one is cleared.
    if (this.api.isSignedIn) void this.api.refreshAccount();
  }
}

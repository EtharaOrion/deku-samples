import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Api } from './core/api';
import { NoticesComponent } from './ui/notices';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NoticesComponent],
  template: `
    <router-outlet />
    <app-notices />
  `,
})
export class AppComponent {
  api = inject(Api);

  constructor() {
    this.api.loadAccount().subscribe();
  }
}

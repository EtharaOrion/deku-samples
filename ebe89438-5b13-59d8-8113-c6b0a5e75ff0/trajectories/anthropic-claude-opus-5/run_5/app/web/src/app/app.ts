import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticesComponent } from './ui/notices.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <router-outlet />
    <app-notices />
  `,
})
export class App {}

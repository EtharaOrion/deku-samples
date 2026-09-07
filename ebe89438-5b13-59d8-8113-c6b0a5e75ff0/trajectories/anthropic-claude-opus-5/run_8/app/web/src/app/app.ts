import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticeHostComponent } from './ui/notice-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <router-outlet />
    <app-notice-host />
  `,
})
export class App {}

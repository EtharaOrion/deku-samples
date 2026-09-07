import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticeStack } from './ui/shared';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NoticeStack],
  template: `
    <router-outlet />
    <app-notices />
  `,
})
export class App {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

@Component({
  selector: 'g-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
  imports: [RouterOutlet],
})
export class Root {}

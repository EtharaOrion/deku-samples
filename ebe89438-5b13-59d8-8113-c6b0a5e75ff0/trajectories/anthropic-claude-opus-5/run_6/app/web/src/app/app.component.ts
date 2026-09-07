import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticesComponent } from './ui/notices.component';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticesComponent],
  template: `
    <router-outlet />
    <app-notices />
  `,
})
export class AppComponent {
  private auth = inject(AuthService);
  constructor() { void this.auth.restore(); }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionService } from './core/session.service';
import { ThemeService } from './core/theme.service';
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
export class App {
  private session = inject(SessionService);
  private theme = inject(ThemeService);
  private router = inject(Router);

  constructor() {
    void this.session.restore();

    // A route that is not an event or a ticket drops the event palette, so the
    // themed ground never leaks onto a plain screen.
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => {
      const url = (e as NavigationEnd).urlAfterRedirects.split('?')[0] ?? '/';
      const segments = url.split('/').filter(Boolean);
      const themed =
        (segments.length === 1 && !RESERVED.includes(segments[0]!)) ||
        (segments.length === 2 && segments[0] === 't');
      if (!themed) this.theme.clear();
    });
  }
}

const RESERVED = ['api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover', 'settings', 'event', 't'];

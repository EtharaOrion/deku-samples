import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../api.service';
import { TopbarComponent } from '../ui/topbar.component';

/**
 * Root-namespace resolution for /<slug>: reserved paths, category names, then
 * events, calendars, handles. Anything else is the not-found page.
 */
@Component({
  selector: 'app-root-resolver',
  standalone: true,
  imports: [TopbarComponent],
  template: `
    @if (loading()) {
      <div class="page"><app-topbar></app-topbar><main class="wrap" role="main">
        <div class="skeleton title"></div><div class="skeleton line" style="width:40%"></div>
      </main></div>
    }
  `,
  styles: [
    `
    .page { min-height: 100vh; padding-top: 64px; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 32px 24px; display: flex; flex-direction: column; gap: 12px; }
  `],
})
export class RootResolverComponent {
  loading = signal(true);

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') ?? '';
      this.api
        .resolve(slug)
        .then((res) => {
          switch (res.kind) {
            case 'category':
              this.router.navigate([`/${slug}`], { replaceUrl: true });
              break;
            case 'event':
              this.router.navigate([`/event/${slug}`], { replaceUrl: true });
              break;
            case 'calendar':
            case 'account':
            case 'system':
              this.router.navigate(['/not-found'], { replaceUrl: true, skipLocationChange: true });
              break;
            default:
              this.router.navigate(['/not-found'], { replaceUrl: true, skipLocationChange: true });
          }
        })
        .catch(() => this.router.navigate(['/not-found'], { replaceUrl: true, skipLocationChange: true }));
    });
  }
}

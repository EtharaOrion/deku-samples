import {
  ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_LABELS } from '../models';
import { TopBarComponent } from '../shared/top-bar.component';
import { CategoryIconComponent } from '../shared/icons.component';
import {
  AvatarComponent, EmptyStateComponent, SkeletonComponent,
} from '../shared/ui.components';
import { NotFoundComponent } from './system.component';

/** An account handle in the root namespace resolves to its public profile. */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    RouterLink, TopBarComponent, CategoryIconComponent, AvatarComponent,
    EmptyStateComponent, SkeletonComponent, NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-top-bar />
      <main id="main" class="container page" role="main">
        @if (loading()) {
          <app-skeleton w="40%" h="40px" radius="8px" />
        } @else if (profile()) {
          @let p = profile()!;
          <header class="masthead">
            <app-avatar [name]="p.display_name" [size]="64" [decorative]="true" />
            <div>
              <h1 class="display">{{ p.display_name }}</h1>
              <p class="caption tertiary">&#64;{{ p.handle }}</p>
            </div>
          </header>

          <h2 class="section-title screen-title">Calendars</h2>
          @if (!p.calendars?.length) {
            <app-empty-state
              heading="No Public Calendars"
              body="This account does not keep a public calendar."
              actionLabel="Discover Events"
              actionLink="/discover" />
          } @else {
            <ul class="grid">
              @for (c of p.calendars; track c.slug) {
                <li>
                  <a class="card card-lift cal" [routerLink]="['/', c.slug]">
                    <h3 class="card-title">{{ c.name }}</h3>
                    <p class="caption slug">/{{ c.slug }}</p>
                    <p class="meta caption">
                      <app-category-icon [name]="c.category" [size]="16" />
                      <span>{{ label(c.category) }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ c.city }}</span>
                    </p>
                  </a>
                </li>
              }
            </ul>
          }
        }
      </main>
    }
  `,
  styles: [`
    .page { padding: 112px var(--s5) var(--s8); }
    .masthead { display: flex; gap: var(--s4); align-items: center; margin-bottom: var(--s7); }
    h1 { font-size: 36px; line-height: 44px; }
    .section-title { margin-bottom: var(--s4); }
    .grid { display: grid; grid-template-columns: 1fr; gap: var(--s4); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .cal { display: block; padding: var(--s4); color: inherit; }
    .cal:hover { color: inherit; }
    .slug { color: var(--muted-text); margin-top: 2px; }
    .meta { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2);
      color: var(--ink-secondary); }
  `],
})
export class ProfileComponent implements OnChanges {
  @Input() handle = '';
  private api = inject(ApiService);

  profile = signal<any | null>(null);
  loading = signal(true);
  missing = signal(false);

  label(c: string) { return CATEGORY_LABELS[c] ?? c; }

  ngOnChanges() {
    if (!this.handle) return;
    this.loading.set(true);
    this.api.getProfile(this.handle).subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: () => { this.missing.set(true); this.loading.set(false); },
    });
  }
}

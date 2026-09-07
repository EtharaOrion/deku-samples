import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES } from '../core/models';
import { CalendarPublicRoute, CategoryRoute, NotFoundRoute, ProfileRoute } from './public-pages';
import { EventPageRoute } from './event-page';

type Kind = 'loading' | 'category' | 'event' | 'calendar' | 'account' | 'none';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-root-slug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryRoute, EventPageRoute, CalendarPublicRoute, ProfileRoute, NotFoundRoute],
  template: `
    @switch (kind()) {
      @case ('category') {
        <app-category-page [name]="slug()" />
      }
      @case ('event') {
        <app-event-page [slug]="slug()" />
      }
      @case ('calendar') {
        <app-calendar-page [slug]="slug()" />
      }
      @case ('account') {
        <app-profile-page [handle]="slug()" />
      }
      @case ('none') {
        <app-not-found />
      }
      @default {
        <div class="page boot" aria-busy="true">
          <div class="sk sk-title" style="width: 40%; height: 44px"></div>
          <div class="sk sk-text" style="width: 25%"></div>
          <div class="sk sk-card" style="height: 240px; margin-top: 24px"></div>
        </div>
      }
    }
  `,
  styles: [
    `
      .boot {
        padding-top: calc(64px + var(--s7));
      }
    `,
  ],
})
export class RootSlugRoute {
  readonly slug = input.required<string>();
  private api = inject(Api);
  private router = inject(Router);
  readonly kind = signal<Kind>('loading');

  constructor() {
    queueMicrotask(() => {
      const s = (this.slug() ?? '').toLowerCase();
      // the twelve category names resolve without a round trip
      if ((CATEGORIES as readonly string[]).includes(s)) {
        this.kind.set('category');
        return;
      }
      this.api.resolve(s).subscribe({
        next: (r) => {
          if (r.kind === 'system') {
            this.kind.set('none');
            return;
          }
          this.kind.set(r.kind as Kind);
        },
        error: () => this.kind.set('none'),
      });
    });
  }
}

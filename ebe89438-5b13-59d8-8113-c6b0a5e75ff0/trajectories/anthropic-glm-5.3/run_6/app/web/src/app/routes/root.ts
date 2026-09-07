import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';
import { CATEGORIES, isCategory, RESERVED_PATHS } from '../shared';
import { NotFoundComponent } from './not-found';
import { CategoryPageComponent } from './category';
import { EventPageComponent } from './event';
import { CalendarPageComponent } from './calendar';
import { ProfilePageComponent } from './profile';

/**
 * One segment, resolved with fixed precedence: reserved system paths, the
 * twelve category names, events.slug, calendars.slug, accounts.handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'route-root', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NotFoundComponent, CategoryPageComponent, EventPageComponent, CalendarPageComponent, ProfilePageComponent],
  template: `
    @switch (kind()) {
      @case ('category') { <route-category [slug]="slug()"></route-category> }
      @case ('event') { <route-event [slug]="slug()"></route-event> }
      @case ('calendar') { <route-calendar [slug]="slug()"></route-calendar> }
      @case ('account') { <route-profile [handle]="slug()"></route-profile> }
      @default { <route-not-found></route-not-found> }
    }
  `,
})
export class RootPageComponent implements OnInit {
  slug = input.required<string>();
  api = inject(ApiService);
  private router = inject(Router);
  kind = signal<'system' | 'category' | 'event' | 'calendar' | 'account' | 'not_found'>('not_found');

  ngOnInit() {
    const slug = (this.slug() || '').toLowerCase();
    if ((RESERVED_PATHS as readonly string[]).includes(slug)) {
      // these are handled by their own routes; anything that lands here is 404
      this.kind.set('not_found');
      return;
    }
    if (isCategory(slug)) { this.kind.set('category'); return; }
    this.api.get<{ kind: string }>(`/resolve/${encodeURIComponent(slug)}`)
      .then((r) => this.kind.set((r.kind as never)))
      .catch(() => this.kind.set('not_found'));
  }
}

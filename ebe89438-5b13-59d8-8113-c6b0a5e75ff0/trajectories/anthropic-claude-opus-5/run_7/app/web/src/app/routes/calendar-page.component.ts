import {
  ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CalendarPage, CATEGORY_LABELS } from '../models';
import { TopBarComponent } from '../shared/top-bar.component';
import { EventCardComponent } from '../shared/event-card.component';
import { CategoryIconComponent } from '../shared/icons.component';
import {
  AvatarComponent, EmptyStateComponent, SkeletonComponent,
} from '../shared/ui.components';
import { NotFoundComponent } from './system.component';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    RouterLink, TopBarComponent, EventCardComponent, CategoryIconComponent,
    AvatarComponent, EmptyStateComponent, SkeletonComponent, NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-top-bar />
      <main id="main" class="container page" role="main">
        @if (loading()) {
          <app-skeleton w="50%" h="40px" radius="8px" />
          <div style="height:24px"></div>
          <app-skeleton w="100%" h="220px" radius="12px" />
        } @else if (cal()) {
          @let c = cal()!;
          <header class="masthead">
            <app-avatar [name]="c.name" [size]="56" [decorative]="true" />
            <div>
              <h1 class="display">{{ c.name }}</h1>
              <p class="meta caption">
                <app-category-icon [name]="c.category" [size]="16" />
                <span>{{ label(c.category) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ c.city }}</span>
                @if (!c.is_public) { <span class="pill pill-danger">Private</span> }
              </p>
              <p class="owner caption tertiary">
                Kept by <a [routerLink]="['/', c.owner_handle]">{{ c.owner_name }}</a>
              </p>
            </div>
          </header>

          <h2 class="section-title screen-title">Events</h2>
          @if (c.events.length === 0) {
            <app-empty-state
              heading="No Events Yet"
              body="This calendar has not published an event yet."
              actionLabel="Discover Events"
              actionLink="/discover" />
          } @else {
            <ul class="grid">
              @for (ev of c.events; track ev.slug) { <li><app-event-card [ev]="ev" /></li> }
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
    .meta { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2);
      color: var(--ink-secondary); }
    .owner { margin-top: var(--s1); }
    .section-title { margin-bottom: var(--s4); }
    .grid { display: grid; grid-template-columns: 1fr; gap: var(--s4); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  `],
})
export class CalendarPageComponent implements OnChanges {
  @Input() slug = '';
  private api = inject(ApiService);

  cal = signal<CalendarPage | null>(null);
  loading = signal(true);
  missing = signal(false);

  label(c: string) { return CATEGORY_LABELS[c] ?? c; }

  ngOnChanges() {
    if (!this.slug) return;
    this.loading.set(true);
    this.api.getCalendar(this.slug).subscribe({
      next: (c) => { this.cal.set(c); this.loading.set(false); },
      error: () => { this.missing.set(true); this.loading.set(false); },
    });
  }
}

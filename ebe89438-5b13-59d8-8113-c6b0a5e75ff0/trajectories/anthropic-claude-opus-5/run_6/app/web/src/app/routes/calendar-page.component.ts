import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { CategoryIconComponent } from '../ui/category-icon.component';
import { PillComponent } from '../ui/pill.component';
import { ApiService } from '../core/api.service';
import { Calendar, EventSummary } from '../core/models';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, EventCardComponent, CategoryIconComponent, PillComponent],
  template: `
    <app-public-bar />
    <main id="main" class="page">
      @if (loading()) {
        <div class="skeleton skeleton-title" style="height:44px"></div>
        <div class="skeleton skeleton-text"></div>
      }
      @if (!loading() && calendar(); as c) {
        <header class="head">
          <app-category-icon [name]="c.category" [size]="48" />
          <h1 class="serif">{{ c.name }}</h1>
          <p class="t-caption muted">{{ c.city }} &middot; /{{ c.slug }}</p>
          @if (!c.is_public) { <app-pill text="Private" toneOverride="danger" /> }
        </header>

        @if (events().length) {
          <ul class="grid">
            @for (e of events(); track e.slug) { <li><app-event-card [event]="e" /></li> }
          </ul>
        } @else {
          <div class="empty">
            <h2>No Events Yet</h2>
            <p>This calendar has nothing published right now.</p>
            <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
          </div>
        }
      }
    </main>
  `,
  styles: [`
    main { padding-top: 96px; padding-bottom: 64px; }
    .head { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 32px; }
    h1 { font-size: 40px; line-height: 48px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    @media (max-width: 999px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class CalendarPageComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  calendar = signal<Calendar | null>(null);
  events = signal<EventSummary[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      this.loading.set(true);
      this.api.publicCalendar(p.get('slug') || '').subscribe({
        next: (r) => { this.calendar.set(r.calendar); this.events.set(r.events); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    });
  }
}

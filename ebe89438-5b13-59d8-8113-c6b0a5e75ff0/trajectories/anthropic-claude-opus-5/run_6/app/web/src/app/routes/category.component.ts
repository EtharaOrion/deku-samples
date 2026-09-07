import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CategoryIconComponent } from '../ui/category-icon.component';
import { CoverComponent } from '../ui/cover.component';
import { EventCardComponent } from '../ui/event-card.component';
import { ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORY_BLURB, CATEGORY_LABELS, Calendar, EventSummary } from '../core/models';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [RouterLink, FormsModule, PublicBarComponent, CategoryIconComponent, CoverComponent, EventCardComponent],
  template: `
    <app-public-bar />
    <main id="main" class="page">
      <section class="masthead">
        <div class="lead">
          <app-category-icon [name]="name()" [size]="48" />
          <h1 class="serif">{{ label() }}</h1>
          <p class="t-overline counts">
            {{ eventCount() }} published {{ eventCount() === 1 ? 'event' : 'events' }}
            &middot; {{ calendarCount() }} {{ calendarCount() === 1 ? 'calendar' : 'calendars' }}
          </p>
          <p class="t-long blurb">{{ blurb() }}</p>
          <form class="subscribe" (ngSubmit)="subscribe()">
            <label class="sr-only" for="sub-email">Your email address</label>
            <input id="sub-email" class="control" type="email" [(ngModel)]="email" name="email"
                   placeholder="you@example.com" />
            <button type="submit" class="btn btn-primary">Subscribe</button>
          </form>
        </div>
        <div class="decor" aria-hidden="true">
          <app-cover [seed]="'category-' + name()" [title]="label()" radius="12px" />
        </div>
      </section>

      @if (loading()) {
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
      } @else if (events().length === 0 && calendars().length === 0) {
        <div class="empty">
          <h2>There are currently no relevant events near you.</h2>
          <a routerLink="/discover" class="btn btn-primary">Explore Events</a>
        </div>
      } @else {
        @if (calendars().length) {
          <section class="block">
            <h2 class="t-section">Calendars</h2>
            <ul class="cal-grid">
              @for (c of calendars(); track c.slug) {
                <li><a class="cal card" [routerLink]="['/', c.slug]">
                  <app-category-icon [name]="c.category" [size]="24" />
                  <span class="t-card-title">{{ c.name }}</span>
                  <span class="t-caption muted">{{ c.city }}</span>
                </a></li>
              }
            </ul>
          </section>
        }
        @if (events().length) {
          <section class="block">
            <h2 class="t-section">Upcoming</h2>
            <ul class="ev-grid">
              @for (e of events(); track e.slug) { <li><app-event-card [event]="e" /></li> }
            </ul>
          </section>
        } @else {
          <div class="empty">
            <h2>There are currently no relevant events near you.</h2>
            <a routerLink="/discover" class="btn btn-primary">Explore Events</a>
          </div>
        }
      }
    </main>
  `,
  styles: [`
    main { padding-top: 96px; padding-bottom: 64px; }
    .masthead { display: grid; grid-template-columns: 1fr 320px; gap: 48px; align-items: center; margin-bottom: 48px; }
    h1 { font-size: 44px; line-height: 52px; margin: 12px 0 8px; }
    .counts { color: var(--ink-64); }
    .blurb { color: var(--ink-64); margin-top: 12px; max-width: 52ch; }
    .subscribe { display: flex; gap: 8px; margin-top: 24px; max-width: 420px; }
    .block { margin-bottom: 48px; }
    .block h2 { margin-bottom: 16px; }
    .cal-grid, .ev-grid { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    .cal { display: flex; flex-direction: column; gap: 8px; color: inherit; }
    @media (max-width: 999px) { .cal-grid, .ev-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 649px) {
      .masthead { grid-template-columns: 1fr; }
      .decor { display: none; }
      .cal-grid, .ev-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class CategoryComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private notices = inject(NoticeService);

  name = signal('running');
  events = signal<EventSummary[]>([]);
  calendars = signal<Calendar[]>([]);
  eventCount = signal(0);
  calendarCount = signal(0);
  loading = signal(true);
  email = '';

  label = () => CATEGORY_LABELS[this.name()] || this.name();
  blurb = () => CATEGORY_BLURB[this.name()] || '';

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      this.name.set(p.get('slug') || 'running');
      this.loading.set(true);
      this.api.category(this.name()).subscribe({
        next: (r) => {
          this.eventCount.set(r.event_count);
          this.calendarCount.set(r.calendar_count);
          this.calendars.set(r.calendars);
        },
        error: () => {},
      });
      this.api.listEvents({ category: this.name(), limit: 12 }).subscribe({
        next: ({ events }) => { this.events.set(events); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    });
  }

  subscribe() {
    this.notices.show(
      this.email ? `We will let ${this.email} know about new ${this.label()} events.`
                 : 'Add an email address to subscribe.',
      this.email ? 'success' : 'warning');
    this.email = '';
  }
}

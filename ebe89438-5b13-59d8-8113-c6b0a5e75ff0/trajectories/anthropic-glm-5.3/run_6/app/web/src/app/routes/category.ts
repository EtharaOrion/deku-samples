import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, CalendarRecord, EventRecord } from '../api.service';
import { PublicBarComponent } from '../public-bar';
import { CatIconComponent, EventCoverComponent } from '../widgets';
import { CATEGORIES, CATEGORY_BLURBS, CATEGORY_LABELS, dayOf, monthOf, shortDate } from '../shared';

@Component({
  selector: 'route-category', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PublicBarComponent, CatIconComponent, EventCoverComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="content-frame page">
      <div class="mast">
        <div class="mast-text">
          <cat-icon [category]="slug()" [size]="48" [label]="true"></cat-icon>
          <h1 class="t-display title">{{ label() }} events</h1>
          <p class="t-caption counts">{{ eventCount() }} events · {{ calendarCount() }} calendars</p>
          <p class="t-body">{{ blurb() }}</p>
          <form class="subscribe" (submit)="subscribe($event)">
            <label class="sr-only" for="sub-email">Email for category updates</label>
            <input id="sub-email" type="email" placeholder="you@example.com" [(ngModel)]="email" name="email" required>
            <button class="btn btn-primary" type="submit">Subscribe</button>
          </form>
        </div>
        <div class="decor card" aria-hidden="true">
          <event-cover [seed]="'category-' + slug()" [title]="label()"></event-cover>
        </div>
      </div>

      @if (loading()) {
        <div class="grid grid-3">@for (i of [1,2,3]; track i) { <div class="card skeleton-card"><div class="skeleton" style="aspect-ratio:1"></div></div> }</div>
      } @else if (events().length === 0) {
        <div class="card empty-card">
          <h2 class="t-screen">There are currently no relevant events near you.</h2>
          <p class="t-para">Try another category or look at everything on the calendar.</p>
          <a routerLink="/discover" class="btn btn-primary">Explore Events</a>
        </div>
      } @else {
        <h2 class="t-overline">Events</h2>
        <ul class="grid grid-3">
          @for (e of events(); track e.slug) {
            <li><a class="card card-lift event-card" [routerLink]="['/' + e.slug]">
              <event-cover [seed]="e.cover_seed || e.slug" [title]="e.title"></event-cover>
              <div class="pad stack gap-8">
                <span class="t-card-title">{{ e.title }}</span>
                <div class="row gap-12">
                  <span class="date-chip" aria-hidden="true"><span class="t-month">{{ monthOf(e.starts_at, e.time_zone) }}</span><span class="day">{{ dayOf(e.starts_at, e.time_zone) }}</span></span>
                  <span class="t-caption">{{ e.city }}</span>
                </div>
              </div>
            </a></li>
          }
        </ul>
      }

      @if (calendars().length) {
        <h2 class="t-overline">Calendars</h2>
        <ul class="grid grid-3">
          @for (c of calendars(); track c.slug) {
            <li><a class="card card-lift cal-card" [routerLink]="['/' + c.slug]">
              <cat-icon [category]="c.category" [size]="24"></cat-icon>
              <span class="t-card-title">{{ c.name }}</span>
              <span class="t-caption">{{ c.city }}</span>
            </a></li>
          }
        </ul>
      }
    </main>
  `,
  styles: [`
    .page{max-width:1080px;margin:0 auto;padding:64px 24px 96px;display:flex;flex-direction:column;gap:24px}
    .mast{display:grid;grid-template-columns:1fr 320px;gap:32px;align-items:center;padding-bottom:16px}
    .mast-text{display:flex;flex-direction:column;gap:12px;align-items:flex-start}
    .title{font-size:36px;line-height:42px}
    .counts{font-size:13px;line-height:18px;font-weight:600}
    .decor{overflow:hidden}
    .subscribe{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .subscribe input{flex:1;min-width:200px}
    .event-card{overflow:hidden;display:flex;flex-direction:column}
    .cal-card{padding:16px;display:flex;flex-direction:column;gap:8px}
    .pad{padding:12px 16px 16px}
    .empty-card{padding:48px 32px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;max-width:520px;margin:24px auto}
    .skeleton-card{overflow:hidden}
    @media (max-width:649px){ .mast{grid-template-columns:1fr} .decor{display:none} }
  `],
})
export class CategoryPageComponent implements OnInit {
  slug = input.required<string>();
  api = inject(ApiService);
  events = signal<EventRecord[]>([]);
  calendars = signal<CalendarRecord[]>([]);
  loading = signal(true);
  eventCount = signal(0);
  calendarCount = signal(0);
  email = '';

  label() { return CATEGORY_LABELS[this.slug()] || this.slug(); }
  blurb() { return CATEGORY_BLURBS[this.slug()] || 'Gatherings near you.'; }

  monthOf = monthOf; dayOf = dayOf;
  ngOnInit() {
    this.api.get<EventRecord[]>(`/events?category=${encodeURIComponent(this.slug())}&limit=100`, { raw: true } as any)
      .then(async (r: any) => {
        this.events.set(await r.json());
        this.eventCount.set(parseInt(r.headers.get('X-Total-Count') || '0', 10));
      })
      .catch(() => { });
    this.api.get<CalendarRecord[]>(`/calendars/by-category/${encodeURIComponent(this.slug())}`)
      .then((c) => {
        this.calendars.set(c);
        this.calendarCount.set(c.length);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  subscribe(e: Event) {
    e.preventDefault();
    this.email = '';
  }
}

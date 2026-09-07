import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, CalendarRecord, EventRecord } from '../api.service';
import { PublicBarComponent } from '../public-bar';
import { CatIconComponent, EventCoverComponent, StatusPillComponent } from '../widgets';
import { CATEGORY_LABELS, dayOf, monthOf } from '../shared';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-calendar', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent, CatIconComponent, EventCoverComponent, StatusPillComponent, NotFoundComponent],
  template: `
    @if (loading()) {
      <public-bar></public-bar>
      <main id="main" class="content-frame page">
        <div class="skeleton" style="height:44px;width:40%;margin-bottom:24px"></div>
        <div class="grid grid-3">@for (i of [1,2,3]; track i) { <div class="skeleton" style="aspect-ratio:1;border-radius:12px"></div> }</div>
      </main>
    } @else if (!cal()) {
      <route-not-found></route-not-found>
    } @else {
      <public-bar></public-bar>
      <main id="main" class="content-frame page">
        <header class="stack gap-12">
          <div class="row gap-12"><cat-icon [category]="cal()!.category" [size]="32" [label]="true"></cat-icon></div>
          <h1 class="t-display title">{{ cal()!.name }}</h1>
          <p class="t-caption">{{ CATEGORY_LABELS[cal()!.category] }} · {{ cal()!.city }} · by {{ cal()!.owner_name }}</p>
        </header>
        @if (cal()!.events!.length === 0) {
          <div class="card empty-card">
            <h2 class="t-screen">Nothing published yet</h2>
            <p class="t-para">This calendar has no published events at the moment. Check back soon.</p>
            <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
          </div>
        } @else {
          <ul class="grid grid-3">
            @for (e of cal()!.events; track e.slug) {
              <li><a class="card card-lift event-card" [routerLink]="['/' + e.slug]">
                <event-cover [seed]="e.cover_seed || e.slug" [title]="e.title"></event-cover>
                <div class="pad stack gap-8">
                  <span class="t-card-title">{{ e.title }}</span>
                  <div class="row gap-12">
                    <span class="date-chip" aria-hidden="true"><span class="t-month">{{ monthOf(e.starts_at, e.time_zone) }}</span><span class="day">{{ dayOf(e.starts_at, e.time_zone) }}</span></span>
                    <span class="t-caption">{{ e.city }}</span>
                  </div>
                  @if (e.state === 'registration_closed') { <status-pill status="registration_closed"></status-pill> }
                </div>
              </a></li>
            }
          </ul>
        }
      </main>
    }
  `,
  styles: [`
    .page{max-width:1080px;margin:0 auto;padding:64px 24px 96px;display:flex;flex-direction:column;gap:24px}
    .title{font-size:36px;line-height:42px}
    .event-card{overflow:hidden;display:flex;flex-direction:column}
    .pad{padding:12px 16px 16px}
    .empty-card{padding:48px 32px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;max-width:480px;margin:24px auto}
  `],
})
export class CalendarPageComponent implements OnInit {
  slug = input.required<string>();
  api = inject(ApiService);
  cal = signal<CalendarRecord | null>(null);
  loading = signal(true);
  CATEGORY_LABELS = CATEGORY_LABELS;
  monthOf = monthOf; dayOf = dayOf;

  ngOnInit() {
    this.api.get<CalendarRecord>(`/calendars/${encodeURIComponent(this.slug())}`)
      .then(c => this.cal.set(c))
      .catch(() => this.cal.set(null))
      .finally(() => this.loading.set(false));
  }
}

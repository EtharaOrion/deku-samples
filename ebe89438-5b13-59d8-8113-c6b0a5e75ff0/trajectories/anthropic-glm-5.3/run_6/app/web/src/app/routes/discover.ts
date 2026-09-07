import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, EventRecord } from '../api.service';
import { PublicBarComponent } from '../public-bar';
import { EventCoverComponent, StatusPillComponent } from '../widgets';
import { CATEGORIES, CATEGORY_LABELS, dayOf, monthOf, shortDate } from '../shared';

@Component({
  selector: 'route-discover', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, PublicBarComponent, EventCoverComponent, StatusPillComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="content-frame page">
      <h1 class="t-screen">Discover Events</h1>
      <form class="filters" (submit)="$event.preventDefault()" role="search">
        <div class="field">
          <label for="f-category">Category</label>
          <select id="f-category" [ngModel]="category()" (ngModelChange)="setParam('category', $event)" name="category">
            <option value="">All categories</option>
            @for (c of categoryList; track c) { <option [value]="c">{{ labelOf(c) }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="f-city">City</label>
          <input id="f-city" type="text" placeholder="City" [ngModel]="city()" (ngModelChange)="setParam('city', $event, 300)" name="city">
        </div>
        <div class="field grow">
          <label for="f-q">Search</label>
          <input id="f-q" type="search" placeholder="Search events" [ngModel]="q()" (ngModelChange)="setParam('q', $event, 400)" name="q">
        </div>
        @if (hasFilters()) {
          <button type="button" class="btn btn-ghost clear" (click)="clear()">Clear Filters</button>
        }
      </form>

      @if (loading()) {
        <ul class="grid grid-3">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li class="card event-card"><div class="skeleton cover-sk"></div><div class="stack gap-8 pad"><div class="skeleton" style="height:18px;width:70%"></div><div class="skeleton" style="height:14px;width:40%"></div></div></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <div class="card empty-card">
          <h2 class="t-screen">No Events Found</h2>
          <p class="t-para">Try a wider date range or a different category.</p>
          <button type="button" class="btn btn-primary" (click)="clear()">Clear Filters</button>
        </div>
      } @else {
        <ul class="grid grid-3">
          @for (e of events(); track e.slug) {
            <li>
              <a class="card card-lift event-card" [routerLink]="['/' + e.slug]">
                <event-cover [seed]="e.cover_seed || e.slug" [title]="e.title"></event-cover>
                <div class="pad stack gap-8">
                  <span class="t-card-title">{{ e.title }}</span>
                  <div class="row gap-12">
                    <span class="date-chip" aria-hidden="true"><span class="t-month">{{ monthOf(e.starts_at, e.time_zone) }}</span><span class="day">{{ dayOf(e.starts_at, e.time_zone) }}</span></span>
                    <span class="t-caption">{{ e.city }}</span>
                  </div>
                  @if (e.state === 'registration_closed') {
                    <status-pill status="registration_closed"></status-pill>
                  } @else if (e.remaining === 0) {
                    <span class="t-caption">Full — waiting list may be open</span>
                  } @else {
                    <span class="t-caption">{{ e.remaining }} of {{ e.capacity }} seats left</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>

        <nav class="pager" aria-label="Pages">
          <button type="button" class="btn btn-secondary" (click)="page(-1)" [disabled]="offset() === 0">Previous</button>
          <span class="t-body showing" aria-live="polite">Showing {{ events().length }} of {{ total() }}</span>
          <button type="button" class="btn btn-secondary" (click)="page(1)" [disabled]="offset() + events().length >= total()">Next</button>
        </nav>
      }
    </main>
  `,
  styles: [`
    .page{max-width:1080px;margin:0 auto;padding:64px 24px 96px;display:flex;flex-direction:column;gap:24px}
    .filters{display:grid;grid-template-columns:auto auto 1fr auto;gap:12px;align-items:end}
    .clear{margin-bottom:0}
    .event-card{overflow:hidden;display:flex;flex-direction:column}
    .pad{padding:12px 16px 16px}
    .cover-sk{aspect-ratio:1;border-radius:0}
    .empty-card{padding:48px 32px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;max-width:480px;margin:24px auto}
    .pager{display:flex;align-items:center;justify-content:center;gap:16px;padding-top:8px}
    .showing{color:var(--ink-2);font-variant-numeric:tabular-nums}
    @media (max-width:999px){ .filters{grid-template-columns:1fr 1fr;gap:12px} .clear{grid-column:1 / -1;justify-self:start} }
    @media (max-width:649px){ .filters{grid-template-columns:1fr} }
  `],
})
export class DiscoverComponent implements OnInit {
  api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  events = signal<EventRecord[]>([]);
  total = signal(0);
  loading = signal(true);
  category = signal(''); city = signal(''); q = signal(''); offset = signal(0);
  categoryList = CATEGORIES;
  labelOf = (c: string) => CATEGORY_LABELS[c] || c;
  monthOf = monthOf; dayOf = dayOf;

  private debounce: any = null;
  private first = true;

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') || '');
      this.city.set(params.get('city') || '');
      this.q.set(params.get('q') || '');
      const off = parseInt(params.get('offset') || '0', 10);
      this.offset.set(isNaN(off) || off < 0 ? 0 : off);
      this.load();
    });
  }

  hasFilters() { return !!(this.category() || this.city() || this.q()); }

  setParam(key: string, value: string, debounceMs = 0) {
    if (debounceMs) {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.applyParam(key, value), debounceMs);
    } else {
      this.applyParam(key, value);
    }
  }

  private applyParam(key: string, value: string) {
    const params: Record<string, string | null> = { ...this.route.snapshot.queryParams };
    if (value) params[key] = value; else delete params[key];
    if (key !== 'offset') params['offset'] = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true });
  }

  clear() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  page(delta: number) {
    const next = Math.max(0, this.offset() + delta * 20);
    this.applyParam('offset', String(next));
  }

  async load() {
    this.loading.set(true);
    const p = new URLSearchParams();
    if (this.category()) p.set('category', this.category());
    if (this.city()) p.set('city', this.city());
    if (this.q().trim()) p.set('q', this.q().trim());
    p.set('offset', String(this.offset()));
    try {
      const raw = await this.api.get<Response>('/events?' + p.toString(), { raw: true });
      this.events.set(await (raw as unknown as Response).json());
      this.total.set(parseInt((raw as unknown as Response).headers.get('X-Total-Count') || '0', 10));
    } catch {
      this.events.set([]); this.total.set(0);
    }
    this.loading.set(false);
  }
}

import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, BehaviorSubject, combineLatest } from 'rxjs';
import { Api, CATEGORIES, EventItem } from '../api';
import { PublicBarComponent } from '../chrome';
import { IconDirective } from '../icons';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PublicBarComponent, IconDirective],
  template: `
    <app-public-bar />
    <main class="page">
      <h1 class="screen-title">Discover Events</h1>
      <form class="filters" (submit)="$event.preventDefault()" role="search">
        <div class="field f-cat">
          <label for="cat">Category</label>
          <select id="cat" [ngModel]="category" (ngModelChange)="set('category', $event)" name="category">
            <option value="">All categories</option>
            @for (c of cats; track c.slug) { <option [value]="c.slug">{{ c.label }}</option> }
          </select>
        </div>
        <div class="field f-city">
          <label for="city">City</label>
          <input id="city" type="text" [ngModel]="city" (ngModelChange)="setDebounced('city', $event)" name="city" placeholder="Any city" />
        </div>
        <div class="field f-q">
          <label for="q">Search</label>
          <input id="q" type="search" [ngModel]="q" (ngModelChange)="setDebounced('q', $event)" name="q" placeholder="Search events" />
        </div>
        @if (hasFilters) {
          <button type="button" class="btn btn-ghost clear" (click)="clear()">Clear Filters</button>
        }
      </form>

      @if (loading) {
        <ul class="results">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li class="card event-card"><div class="skeleton cover-sk"></div>
              <div class="card-body"><div class="skeleton" style="height:21px;width:70%"></div>
              <div class="skeleton" style="height:16px;width:40%;margin-top:8px"></div></div></li>
          }
        </ul>
      } @else if (items.length === 0) {
        <div class="empty card card-24">
          <h2 class="empty-title">No Events Found</h2>
          <p class="empty-body">Try a wider date range or a different category.</p>
          <button type="button" class="btn btn-secondary" (click)="clear()">Clear Filters</button>
        </div>
      } @else {
        <ul class="results">
          @for (e of items; track e.id) {
            <li>
              <a [routerLink]="'/' + e.slug" class="card event-card" [style.--tc]="e.theme_hex">
                <div class="cover" [style.background]="coverBackground(e)"><span class="cover-title">{{ e.title }}</span></div>
                <div class="card-body">
                  <span class="card-title">{{ e.title }}</span>
                  <span class="meta">
                    <span class="datechip"><b>{{ e.starts_at | date:'MMM' }}</b><i>{{ e.starts_at | date:'d' }}</i></span>
                    <span class="city">{{ e.city }}</span>
                  </span>
                  @if (e.state === 'registration_closed') {
                    <span class="pill pill-status-registration_closed">Registration Closed</span>
                  } @else {
                    <span class="caption seats">{{ seatCaption(e) }}</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>
        <nav class="pager" aria-label="Results pages">
          <button type="button" class="btn btn-secondary btn-small" (click)="page(-1)" [disabled]="offset === 0">Previous</button>
          <span class="pager-text">Showing {{ items.length }} of {{ total }}</span>
          <button type="button" class="btn btn-secondary btn-small" (click)="page(1)" [disabled]="offset + items.length >= total">Next</button>
        </nav>
      }
    </main>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 96px 24px 64px; }
    .filters { display: grid; grid-template-columns: 200px 1fr 1fr auto; gap: 16px; align-items: end; margin: 24px 0; }
    .clear { margin-bottom: 2px; }
    .results { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 24px 0; }
    .event-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
    .cover { aspect-ratio: 1; border-radius: 12px; position: relative; overflow: hidden; display:flex; align-items:flex-end; padding: 12px; }
    .cover-title { color: #fff; font-size: 13px; font-weight: 700; text-shadow: rgba(0,0,0,.2) 0 0 5px; opacity: 0; }
    .card-body { display: flex; flex-direction: column; gap: 8px; padding: 4px 4px 8px; }
    .card-title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .meta { display: flex; align-items: center; gap: 8px; }
    .datechip { display: inline-flex; flex-direction: column; align-items: center; border: 1px solid var(--ink-08); border-radius: 6px; padding: 2px 8px; }
    .datechip b { font-size: 11px; line-height: 14px; font-weight: 600; text-transform: uppercase; }
    .datechip i { font-size: 13px; line-height: 16px; font-style: normal; font-weight: 600; }
    .city { font-size: 13px; line-height: 16px; color: var(--muted); }
    .seats { }
    .pager { display: flex; align-items: center; gap: 16px; justify-content: center; margin-top: 16px; }
    .pager-text { font-size: 14px; line-height: 22px; color: var(--ink-64); }
    .empty { padding: 48px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty-title { font-family: var(--serif); font-size: 22px; font-weight: 400; }
    .empty-body { color: var(--muted); }
    .cover-sk { aspect-ratio: 1; }
    @media (max-width: 999px) { .filters { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 649px) { .filters { grid-template-columns: 1fr; } .results { grid-template-columns: 1fr; } }
    @media (max-width: 483px) { .results { grid-template-columns: 1fr; } }
  `],
})
export class DiscoverComponent implements OnInit, OnDestroy {
  cats = CATEGORIES;
  items: EventItem[] = [];
  total = 0;
  offset = 0;
  loading = true;
  category = ''; city = ''; q = '';
  hasFilters = false;
  private pageSize = 20;
  private sub?: Subscription;
  private debounce: any;

  constructor(private api: Api, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.sub = this.route.queryParams.subscribe(p => {
      this.category = p['category'] ?? '';
      this.city = p['city'] ?? '';
      this.q = p['q'] ?? '';
      const off = Number(p['offset'] ?? 0);
      this.offset = Number.isFinite(off) && off > 0 ? Math.trunc(off) : 0;
      this.hasFilters = !!(this.category || this.city || this.q);
      this.load();
    });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  private load() {
    this.loading = true;
    const f: any = { limit: this.pageSize, offset: this.offset };
    if (this.category) f.category = this.category;
    if (this.city.trim()) f.city = this.city.trim();
    if (this.q.trim()) f.q = this.q.trim();
    this.api.listEvents(f).subscribe(r => {
      this.items = r.items; this.total = r.total; this.loading = false;
    }, () => { this.items = []; this.total = 0; this.loading = false; });
  }

  set(key: string, value: string) {
    this.router.navigate([], { queryParams: { ...this.currentParams(), [key]: value || null, offset: null }, replaceUrl: true });
  }
  setDebounced(key: string, value: string) {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.set(key, value), 300);
  }
  clear() {
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }
  page(dir: number) {
    const next = Math.max(0, this.offset + dir * this.pageSize);
    this.router.navigate([], { queryParams: { ...this.currentParams(), offset: next || null }, replaceUrl: false });
  }
  private currentParams() {
    const p: any = {};
    if (this.category) p.category = this.category;
    if (this.city) p.city = this.city;
    if (this.q) p.q = this.q;
    return p;
  }
  seatCaption(e: EventItem) {
    return e.remaining === 0 ? 'Waiting list only' : `${e.remaining} of ${e.capacity} seats left`;
  }
  coverBackground(e: EventItem) {
    const hue = CATEGORIES.find(c => c.slug === e.category)?.hue ?? e.theme_hex;
    return `linear-gradient(135deg, ${hue}, ${e.theme_hex})`;
  }
}

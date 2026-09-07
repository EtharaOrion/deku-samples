import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { EventItem } from '../../core/auth.service';
import { CoverService, coverFor } from '../../core/cover.service';
import { dateChip, cardDate } from '../../core/time';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <h1 class="screen-title">Discover Events</h1>
      <p class="caption intro">Published gatherings, soonest first. Filters live in the address, so a link shows anyone the same list.</p>

      <form class="filters" role="search" (submit)="$event.preventDefault()">
        <div class="field grow">
          <label for="category">Category</label>
          <select id="category" [value]="category()" (change)="setParam('category', $any($event.target).value)">
            <option value="">All categories</option>
            @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
          </select>
        </div>
        <div class="field grow">
          <label for="city">City</label>
          <input id="city" type="text" [value]="city()" (input)="setParamDebounced('city', $any($event.target).value)" placeholder="Any city" />
        </div>
        <div class="field grow">
          <label for="q">Search</label>
          <input id="q" type="search" [value]="q()" (input)="setParamDebounced('q', $any($event.target).value)" placeholder="Search events" />
        </div>
        @if (hasFilters()) {
          <button type="button" class="btn-text clear" (click)="clearFilters()">Clear Filters</button>
        }
      </form>

      @if (loading()) {
        <ul class="grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <li><div class="card"><div class="skeleton cover-skel"></div><div class="sk pad"><div class="skeleton" style="height:14px;width:80%"></div><div class="skeleton" style="height:12px;width:50%"></div></div></div></li>
          }
        </ul>
      } @else if (events().length === 0) {
        <div class="empty-state">
          <h2>No Events Found</h2>
          <p>Try a wider date range or a different category.</p>
          @if (hasFilters()) { <button class="btn btn-secondary" (click)="clearFilters()">Clear Filters</button> }
        </div>
      } @else {
        <ul class="grid">
          @for (ev of events(); track ev.id) {
            <li>
              <a class="card lift ev-card" [routerLink]="['/', ev.slug]">
                <div class="cover-wrap cover-saturate" [style.--cover-from]="spec(ev).from" [style.--cover-to]="spec(ev).to">
                  <img class="cover-img" [src]="cover(ev)" [alt]="'Cover for ' + ev.title" />
                  <div class="cover-glow"></div>
                  <div class="cover-sheen"></div>
                </div>
                <div class="body">
                  <span class="title">{{ ev.title }}</span>
                  <span class="meta">
                    <span class="date-chip"><span class="month">{{ chip(ev).month }}</span><span class="day">{{ chip(ev).day }}</span></span>
                    {{ ev.city }} · {{ when(ev) }}
                  </span>
                  @if (ev.state === 'registration_closed') {
                    <span class="pill">Registration closed</span>
                  } @else {
                    <span class="caption seats">{{ seatsLine(ev) }}</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>

        <nav class="pager" aria-label="Pages">
          <button class="btn btn-secondary btn-sm" (click)="goPage(page() - 1)" [disabled]="page() === 1">Previous</button>
          <span class="caption showing">Showing {{ events().length }} of {{ total() }}</span>
          <button class="btn btn-secondary btn-sm" (click)="goPage(page() + 1)" [disabled]="page() >= pages()">Next</button>
        </nav>
      }
    </div>
  `,
  styles: [`
    .intro { color: var(--muted); margin: 8px 0 24px; }
    .filters { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px; align-items: end; }
    .clear { justify-self: start; color: var(--ink-64); }
    .grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
    .ev-card { display: flex; flex-direction: column; height: 100%; }
    .ev-card .cover-wrap { aspect-ratio: 1.6; }
    .body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
    .title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .meta { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 16px; color: var(--muted); }
    .seats { color: var(--muted); }
    .date-chip {
      display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
      min-width: 40px; padding: 3px 6px; border-radius: var(--r-nav);
      background: var(--ink-04); color: var(--ink-64);
    }
    .date-chip .month { font-size: 11px; line-height: 14px; font-weight: 600; }
    .date-chip .day { font-size: 13px; line-height: 16px; font-weight: 600; }
    .sk { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .cover-skel { aspect-ratio: 1.6; border-radius: 0; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 24px; }
    .showing { color: var(--muted); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 650px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1000px) { .filters { grid-template-columns: repeat(3, minmax(0, 1fr)) auto; } }
    @media (min-width: 1580px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .page { max-width: 1580px; } }
  `],
})
export class DiscoverComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private covers = inject(CoverService);

  categories = ['family','books','games','tech','food-and-drink','ai','running','arts-and-culture','climate','fitness','wellness','crypto'];
  private catLabels: Record<string, string> = {
    family: 'Family', books: 'Books', games: 'Games', tech: 'Tech', 'food-and-drink': 'Food and Drink',
    ai: 'AI', running: 'Running', 'arts-and-culture': 'Arts and Culture', climate: 'Climate',
    fitness: 'Fitness', wellness: 'Wellness', crypto: 'Crypto',
  };

  events = signal<EventItem[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(true);

  category = signal('');
  city = signal('');
  q = signal('');

  pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  hasFilters = computed(() => !!(this.category() || this.city() || this.q()));

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private first = true;

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.city.set(params.get('city') ?? '');
      this.q.set(params.get('q') ?? '');
      const p = Number(params.get('page') ?? '1');
      this.page.set(Number.isFinite(p) && p > 0 ? p : 1);
      this.load();
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const offset = (this.page() - 1) * PAGE_SIZE;
    const { items, total } = await this.api.listEvents({
      category: this.category() || undefined,
      city: this.city() || undefined,
      q: this.q() || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    this.events.set(items);
    this.total.set(total);
    this.loading.set(false);
    if (!this.first) return;
    this.first = false;
  }

  setParam(name: string, value: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { [name]: value || null, page: null }, queryParamsHandling: 'merge' });
  }

  setParamDebounced(name: string, value: string): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.setParam(name, value), 350);
  }

  clearFilters(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  goPage(p: number): void {
    if (p < 1 || p > this.pages()) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { page: p > 1 ? p : null }, queryParamsHandling: 'merge' });
  }

  cover(ev: EventItem): string { return this.covers.dataUri(ev.cover_seed, ev.title); }
  spec(ev: EventItem) { return coverFor(ev.cover_seed); }
  chip(ev: EventItem) { return dateChip(ev.starts_at, ev.time_zone); }
  when(ev: EventItem) { return cardDate(ev.starts_at, ev.time_zone); }
  seatsLine(ev: EventItem): string {
    const left = ev.remaining;
    return left === 0 ? 'Full · waiting list open' : left === 1 ? '1 seat left' : `${left} seats left`;
  }
  label(c: string): string { return this.catLabels[c] ?? c; }
}

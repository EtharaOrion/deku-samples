import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Api, EventCard } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, parseInstant, inZone } from '../core/tokens';
import { CoverComponent } from '../ui/cover';
import { SkeletonComponent } from '../ui/skeleton';
import { PublicShellComponent } from '../shells/public-shell';

const PAGE = 20;

@Component({
  selector: 'app-discover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, CoverComponent, SkeletonComponent, RouterLink],
  template: `
    <app-public-shell>
      <div class="page">
        <h1>Discover Events</h1>

        <div class="filters" role="search">
          <label class="ctl">
            <span class="visually-hidden">Category</span>
            <select class="input" [value]="q().category ?? ''" (change)="setParam('category', $any($event.target).value)">
              <option value="">All categories</option>
              @for (c of cats; track c) { <option [value]="c">{{ label(c) }}</option> }
            </select>
          </label>
          <label class="ctl">
            <span class="visually-hidden">City</span>
            <input class="input" type="text" placeholder="City" [value]="q().city ?? ''"
                   (input)="setParamDebounced('city', $any($event.target).value)" />
          </label>
          <label class="ctl grow">
            <span class="visually-hidden">Search events</span>
            <input class="input" type="search" placeholder="Search events" [value]="q().q ?? ''"
                   (input)="setParamDebounced('q', $any($event.target).value)" />
          </label>
          @if (anyFilter()) {
            <button type="button" class="btn btn-quiet" (click)="clear()">Clear Filters</button>
          }
        </div>

        @if (loading()) {
          <app-skeleton [count]="4" [height]="112" [art]="96" />
        } @else if (!events().length) {
          <div class="empty">
            <h2>No Events Found</h2>
            <p>Try a wider date range or a different category.</p>
            <button type="button" class="btn btn-primary" (click)="clear()">Clear Filters</button>
          </div>
        } @else {
          <ul class="grid">
            @for (e of events(); track e.slug) {
              <li>
                <a class="card" [routerLink]="['/' + e.slug]">
                  <div class="art"><app-cover [seed]="e.cover_seed || e.slug" /></div>
                  <div class="body">
                    <h2 class="title">{{ e.title }}</h2>
                    <div class="chip">
                      <span class="month">{{ month(e) }}</span>
                      <span class="day">{{ day(e) }}</span>
                    </div>
                    <p class="meta">{{ e.city }} · {{ zone(e) }}</p>
                    @if (e.state === 'registration_closed') {
                      <span class="pill" data-status="registration_closed">Registration closed</span>
                    } @else if (e.remaining <= 0) {
                      <p class="caption">Waiting list only</p>
                    } @else {
                      <p class="caption">{{ e.remaining }} of {{ e.capacity }} seats left</p>
                    }
                  </div>
                </a>
              </li>
            }
          </ul>

          <nav class="pager" aria-label="Pages">
            <button type="button" class="btn btn-quiet" (click)="page(-1)" [disabled]="offset() === 0">Previous</button>
            <p class="meta" aria-live="polite">Showing {{ events().length }} of {{ total() }}</p>
            <button type="button" class="btn btn-quiet" (click)="page(1)"
                    [disabled]="offset() + PAGE >= total()">Next</button>
          </nav>
        }
      </div>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }
    h1 { font: 700 22px/26px var(--sans); margin-bottom: 20px; }
    .filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 24px; }
    .ctl { flex: 1 1 180px; min-width: 0; }
    .ctl.grow { flex: 2 1 240px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 24px; grid-template-columns: repeat(3, 1fr); }
    .card {
      display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit;
      background: var(--paper); border-radius: var(--r-card); padding: 12px;
      box-shadow: var(--shadow-card), var(--ring-onboard); transition: box-shadow var(--dur) var(--ease);
    }
    @media (hover: hover) { .card:hover { box-shadow: var(--shadow-primary-fine), var(--ring-onboard); } }
    .art { border-radius: var(--r-media); overflow: hidden; }
    .title { font: 500 14px/21px var(--sans); margin: 0 0 8px; }
    .chip {
      display: inline-flex; flex-direction: column; align-items: center; padding: 4px 10px;
      border-radius: var(--r-input); background: var(--panel); margin-bottom: 8px;
    }
    .month { font: 600 11px/14px var(--sans); text-transform: uppercase; color: var(--muted); }
    .day { font: 600 16px/20px var(--sans); }
    .meta { margin: 0 0 4px; }
    .caption { margin: 0; }
    .empty { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .empty h2 { font: 700 20px/26px var(--sans); }
    .empty p { color: var(--muted); margin-bottom: 8px; }
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 32px; }
    @media (max-width: 1579px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 999px) { .filters { flex-wrap: wrap; } }
    @media (max-width: 649px) { .filters { display: grid; grid-template-columns: 1fr 1fr; } .page { padding: 24px 16px 48px; } }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } .filters { grid-template-columns: 1fr; } }
  `],
})
export class DiscoverComponent {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly PAGE = PAGE;
  cats = CATEGORIES;
  events = signal<EventCard[]>([]);
  total = signal(0);
  loading = signal(true);
  offset = signal(0);

  params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  q = computed(() => {
    const p = this.params();
    return {
      category: p.get('category') ?? '',
      city: p.get('city') ?? '',
      q: p.get('q') ?? '',
      page: Number(p.get('page') ?? '1'),
    };
  });

  anyFilter = computed(() => Boolean(this.q().category || this.q().city || this.q().q));

  constructor() {
    effect(() => {
      const { category, city, q, page } = this.q();
      void category; void city; void q;
      this.offset.set((page - 1) * PAGE);
      this.load();
    });
  }

  load() {
    this.loading.set(true);
    const { category, city, q } = this.q();
    const params: Record<string, string> = { limit: String(PAGE), offset: String(this.offset()) };
    if (category) params['category'] = category;
    if (city) params['city'] = city;
    if (q.trim()) params['q'] = q.trim();
    this.api.events(params).subscribe({
      next: (res) => {
        this.events.set(res.body ?? []);
        this.total.set(Number(res.headers.get('X-Total-Count') ?? '0'));
        this.loading.set(false);
      },
      error: () => { this.events.set([]); this.total.set(0); this.loading.set(false); },
    });
  }

  /** Every control writes into the query string; the address is the state. */
  setParam(key: string, value: string) {
    const p: Record<string, string | number> = { ...this.trimmed(), page: 1 };
    if (value) p[key] = value; else delete p[key];
    this.router.navigate([], { queryParams: p, replaceUrl: false });
  }

  private timer: any = null;
  setParamDebounced(key: string, value: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.setParam(key, value), 260);
  }

  private trimmed(): Record<string, string> {
    const out: Record<string, string> = {};
    const { category, city, q } = this.q();
    if (category) out['category'] = category;
    if (city) out['city'] = city;
    if (q.trim()) out['q'] = q.trim();
    return out;
  }

  clear() { this.router.navigate([], { queryParams: {} }); }

  page(delta: number) {
    const next = Math.max(1, this.q().page + delta);
    this.router.navigate([], { queryParams: { ...this.trimmed(), page: next } });
  }

  label(c: string) { return CATEGORY_LABELS[c]; }
  month(e: EventCard) { return inZone(parseInstant(e.starts_at), e.time_zone, { month: 'short' }); }
  day(e: EventCard) { return inZone(parseInstant(e.starts_at), e.time_zone, { day: 'numeric' }); }
  zone(e: EventCard) {
    const d = parseInstant(e.starts_at);
    return inZone(d, e.time_zone, { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false });
  }
}

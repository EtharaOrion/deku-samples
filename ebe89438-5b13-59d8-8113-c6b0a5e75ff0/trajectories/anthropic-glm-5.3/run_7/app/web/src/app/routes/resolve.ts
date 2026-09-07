import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_HUES } from '../core/tokens';
import { CategoryIconComponent } from '../ui/category-icon';
import { PublicShellComponent } from '../shells/public-shell';
import { EventPageComponent } from './event';
import { NotFoundComponent } from './not-found';

type CalendarRow = { slug: string; name: string; city: string; category: string; is_public?: boolean };
type AccountRow = { handle: string; display_name: string; role: string };

@Component({
  selector: 'app-category-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, CategoryIconComponent, RouterLink],
  template: `
    <app-public-shell>
      <div class="page">
        <header class="mast">
          <div class="head">
            <span class="glyph" [style.color]="hue()"><app-category-icon [name]="slug()" [size]="48" /></span>
            <div class="words">
              <h1>{{ label() }}</h1>
              <p class="counts">{{ total() }} events · {{ calendars().length }} calendars</p>
              <p class="desc">{{ description() }}</p>
            </div>
          </div>
          <form class="side" (submit)="subscribe($event)">
            <label class="field">
              <span class="fl">Stay posted about {{ label() }}</span>
              <input class="input" type="email" placeholder="you@example.com" aria-label="Your email address" />
            </label>
            <button class="btn btn-primary" type="submit">Subscribe</button>
          </form>
        </header>

        @if (calendars().length) {
          <section>
            <h2 class="overline">Calendars in {{ label() }}</h2>
            <ul class="cals">
              @for (c of calendars(); track c.slug) {
                <li><a class="card" [routerLink]="['/' + c.slug]">
                  <span class="name">{{ c.name }}</span>
                  <span class="meta">{{ c.city }}</span>
                </a></li>
              }
            </ul>
          </section>
        }

        <section>
          <h2 class="overline">Upcoming</h2>
          @if (events().length) {
            <ul class="events">
              @for (e of events(); track e.slug) {
                <li><a class="card" [routerLink]="['/' + e.slug]">
                  <span class="name">{{ e.title }}</span>
                  <span class="meta">{{ e.city }}</span>
                </a></li>
              }
            </ul>
          } @else {
            <div class="empty">
              <h2>There are currently no relevant events near you.</h2>
              <a routerLink="/discover" class="btn btn-primary">Explore Events</a>
            </div>
          }
        </section>
      </div>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }
    .mast { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: start; margin-bottom: 32px; }
    .head { display: flex; gap: 20px; align-items: flex-start; }
    .glyph { display: inline-flex; }
    h1 { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 42px; margin: 0; }
    .counts { font: 600 13px/18px var(--sans); color: var(--muted); margin: 8px 0; }
    .desc { font-size: 15px; line-height: 22px; color: var(--ink-64); max-width: 48ch; }
    .side { display: flex; flex-direction: column; gap: 8px; min-width: 260px; }
    .fl { font-size: 14px; font-weight: 500; display: block; margin-bottom: 6px; }
    .overline { margin: 32px 0 16px; }
    .cals, .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 16px; text-decoration: none; color: inherit;
      background: var(--paper); border-radius: var(--r-card); box-shadow: var(--shadow-card), var(--ring-onboard); }
    .name { font: 500 14px/21px var(--sans); }
    .meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .empty { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty h2 { font: 700 18px/24px var(--sans); }
    @media (max-width: 999px) { .mast { grid-template-columns: 1fr; } .side { max-width: 360px; } }
    @media (max-width: 649px) { .cals, .events { grid-template-columns: repeat(2, 1fr); } .page { padding: 24px 16px 48px; } }
    @media (max-width: 483px) { .cals, .events { grid-template-columns: 1fr; } }
  `],
})
export class CategoryPageComponent {
  slug = input.required<string>();
  private api = inject(Api);
  events = signal<any[]>([]);
  calendars = signal<CalendarRow[]>([]);
  total = signal(0);

  label() { return CATEGORY_LABELS[this.slug()] ?? this.slug(); }
  description() { return CATEGORY_DESCRIPTIONS[this.slug()] ?? ''; }
  hue() { return CATEGORY_HUES[this.slug()] ?? 'currentColor'; }

  ngOnInit() {
    this.api.events({ category: this.slug(), limit: 100 }).subscribe({
      next: (res) => {
        const list = (res.body ?? []) as any[];
        this.events.set(list);
        this.total.set(Number(res.headers.get('X-Total-Count') ?? list.length));
        const seen = new Map<string, CalendarRow>();
        for (const e of list) {
          const k = e.calendar_slug ?? e.slug;
          if (!seen.has(k)) seen.set(k, { slug: k, name: e.calendar_name ?? e.title, city: e.city, category: this.slug() });
        }
        this.calendars.set(Array.from(seen.values()));
      },
      error: () => { this.events.set([]); this.calendars.set([]); },
    });
  }

  subscribe(e: Event) { e.preventDefault(); this.api.notify('You are on the list for this category.', 'success'); }
}

@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, CategoryIconComponent, RouterLink, NotFoundComponent],
  template: `
    <app-public-shell>
      <div class="page">
        @if (loading()) {
          <div class="skeleton" style="height:120px"></div>
        } @else if (!cal()) {
          <app-not-found />
        } @else {
          <header class="mast">
            <span class="glyph" [style.color]="hue"><app-category-icon [name]="cal()!.category" [size]="40" /></span>
            <div class="words">
              <h1>{{ cal()!.name }}</h1>
              <p class="meta">{{ cal()!.city }} · {{ label }}</p>
            </div>
            @if (!cal()!.is_public) { <span class="pill private">Private</span> }
          </header>
          <h2 class="overline">Upcoming</h2>
          @if (events().length) {
            <ul class="grid">
              @for (e of events(); track e.slug) {
                <li><a class="card" [routerLink]="['/' + e.slug]">
                  <span class="name">{{ e.title }}</span>
                  <span class="meta">{{ e.city }}</span>
                </a></li>
              }
            </ul>
          } @else {
            <div class="empty">
              <h2>Nothing published yet</h2>
              <p>This calendar has no events open to discovery.</p>
              <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
            </div>
          }
        }
      </div>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }
    .mast { display: flex; gap: 16px; align-items: center; margin-bottom: 32px; flex-wrap: wrap; }
    h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0; }
    .glyph { display: inline-flex; }
    .meta { font-size: 13px; color: var(--muted); }
    .private { color: var(--pink); border-color: rgba(243, 26, 124, 0.4); margin-left: auto; }
    .overline { margin: 24px 0 16px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 16px; text-decoration: none; color: inherit;
      background: var(--paper); border-radius: var(--r-card); box-shadow: var(--shadow-card), var(--ring-onboard); }
    .name { font: 500 14px/21px var(--sans); }
    .empty { text-align: center; padding: 48px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty h2 { font: 700 18px/24px var(--sans); }
    @media (max-width: 649px) { .grid { grid-template-columns: repeat(2, 1fr); } .page { padding: 24px 16px 48px; } }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class CalendarPageComponent {
  slug = input.required<string>();
  private api = inject(Api);
  private http = inject(HttpClient);
  cal = signal<CalendarRow | null>(null);
  events = signal<any[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.http.get<CalendarRow>(`/api/calendars/${this.slug()}`).subscribe({
      next: (c) => { this.cal.set(c); this.loading.set(false); this.loadEvents(); },
      error: () => this.loading.set(false),
    });
  }

  private loadEvents() {
    this.api.events({ limit: 100 }).subscribe({
      next: (res) => this.events.set(((res.body ?? []) as any[]).filter((e) => e.calendar_slug === this.slug())),
      error: () => this.events.set([]),
    });
  }

  get label() { return CATEGORY_LABELS[this.cal()?.category ?? ''] ?? ''; }
  get hue() { return CATEGORY_HUES[this.cal()?.category ?? ''] ?? 'currentColor'; }
}

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, RouterLink, NotFoundComponent],
  template: `
    <app-public-shell>
      <div class="page">
        @if (loading()) {
          <div class="skeleton" style="height:120px"></div>
        } @else if (!who()) {
          <app-not-found />
        } @else {
          <header class="mast">
            <h1>{{ who()!.display_name }}</h1>
            <p class="meta">@{{ who()!.handle }} · {{ who()!.role === 'host' ? 'Host' : 'Guest' }}</p>
          </header>
          @if (who()!.role === 'host') {
            <h2 class="overline">Calendars</h2>
            @if (calendars().length) {
              <ul class="grid">
                @for (c of calendars(); track c.slug) {
                  <li><a class="card" [routerLink]="['/' + c.slug]">
                    <span class="name">{{ c.name }}</span>
                    <span class="meta">{{ c.city }}</span>
                  </a></li>
                }
              </ul>
            } @else {
              <p class="quiet">This host has not published a calendar yet.</p>
            }
          } @else {
            <p class="quiet">This member browses and registers for events.</p>
          }
        }
      </div>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 40px 24px 64px; }
    h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0; }
    .meta { font-size: 13px; color: var(--muted); }
    .overline { margin: 24px 0 16px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 16px; text-decoration: none; color: inherit;
      background: var(--paper); border-radius: var(--r-card); box-shadow: var(--shadow-card), var(--ring-onboard); }
    .name { font: 500 14px/21px var(--sans); }
    .quiet { color: var(--muted); }
    @media (max-width: 649px) { .grid { grid-template-columns: repeat(2, 1fr); } .page { padding: 24px 16px 48px; } }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ProfilePageComponent {
  slug = input.required<string>();
  private http = inject(HttpClient);
  who = signal<AccountRow | null>(null);
  calendars = signal<CalendarRow[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.http.get<AccountRow>(`/api/accounts/${this.slug()}`).subscribe({
      next: (a) => {
        this.who.set(a);
        this.loading.set(false);
        if (a.role === 'host') {
          this.http.get<CalendarRow[]>(`/api/accounts/${this.slug()}/calendars`).subscribe({
            next: (c) => this.calendars.set(c),
            error: () => this.calendars.set([]),
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }
}

/**
 * Root-namespace resolution: reserved paths, then the twelve category names,
 * then the event slug, then the calendar slug, then the account handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-resolve',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EventPageComponent, CategoryPageComponent, CalendarPageComponent, ProfilePageComponent, NotFoundComponent],
  template: `
    @switch (kind()) {
      @case ('loading') {
        <div class="load" aria-busy="true">
          <div class="skeleton" style="height:180px;max-width:640px"></div>
        </div>
      }
      @case ('event') { <app-event-page [slug]="slug()" /> }
      @case ('category') { <app-category-page [slug]="slug()" /> }
      @case ('calendar') { <app-calendar-page [slug]="slug()" /> }
      @case ('account') { <app-profile-page [slug]="slug()" /> }
      @default { <app-not-found /> }
    }
  `,
  styles: [':host{display:block;min-height:100vh}', '.load{max-width:948px;margin:0 auto;padding:96px 24px}'],
})
export class ResolveComponent {
  private api = inject(Api);
  slug = input.required<string>();
  kind = signal<string>('loading');

  ngOnInit() {
    if ((CATEGORIES as readonly string[]).includes(this.slug())) { this.kind.set('category'); return; }
    this.api.resolve(this.slug()).subscribe({
      next: (r) => this.kind.set(r.kind === 'system' ? 'not_found' : r.kind),
      error: () => this.kind.set('not_found'),
    });
  }
}

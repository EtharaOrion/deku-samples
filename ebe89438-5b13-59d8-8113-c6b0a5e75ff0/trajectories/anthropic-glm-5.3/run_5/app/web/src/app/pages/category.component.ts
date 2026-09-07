import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { CATEGORIES, CATEGORY_BLURBS, categoryHue, categoryLabel } from '../categories';
import { CatGlyphComponent } from '../ui/cat-glyph.component';
import { TopbarComponent } from '../ui/topbar.component';
import { CoverComponent } from '../ui/cover.component';
import type { CommunityEvent } from '../types';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [RouterLink, CatGlyphComponent, TopbarComponent, CoverComponent],
  template: `
    <div class="page">
      <app-topbar></app-topbar>
      <main class="content" role="main">
        @if (loading()) {
          <div class="skeleton title"></div>
          <div class="skeleton line" style="width:40%"></div>
        } @else if (slug()) {
          <section class="masthead">
            <div class="masthead-text">
              <app-cat-glyph [slug]="cat" [hue]="hue(cat)" [size]="48"></app-cat-glyph>
              <h1 class="serif masthead-title">{{ label(cat) }}</h1>
              <p class="counts">{{ events().length }} events · {{ calendars().length }} calendars</p>
              <p class="blurb body-copy">{{ blurb(cat) }}</p>
              <form class="subscribe" (submit)="$event.preventDefault(); subscribed = true">
                <label class="caption" for="subscribe-email">Hear about new {{ label(cat) }} events</label>
                <div class="subscribe-row">
                  <input id="subscribe-email" type="email" placeholder="you@example.com" name="email" required />
                  <button class="btn secondary" type="submit">Subscribe</button>
                </div>
                @if (subscribed) {
                  <p class="caption" role="status">Thanks — we will write when something new lands.</p>
                }
              </form>
            </div>
            <div class="masthead-art" aria-hidden="true">
              <app-cover [seed]="'category-' + cat" [showTitle]="false" [rounded]="true"></app-cover>
            </div>
          </section>

          <section class="section">
            <h2 class="overline">Events</h2>
            @if (events().length === 0) {
              <div class="empty card big">
                <p class="body-copy">There are currently no relevant events near you.</p>
                <a class="btn secondary" routerLink="/discover">Explore Events</a>
              </div>
            } @else {
              <ul class="grid three list">
                @for (ev of events(); track ev.slug) {
                  <li>
                    <a class="card event-card lift-hover" [routerLink]="['/', ev.slug]">
                      <app-cover [seed]="ev.cover_seed" [showTitle]="false" [rounded]="true"></app-cover>
                      <div class="card-body">
                        <p class="title">{{ ev.title }}</p>
                        <p class="caption">{{ ev.city }}</p>
                      </div>
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </main>
    </div>
  `,
  styles: [
    `
    .page { min-height: 100vh; padding-top: 64px; }
    .content { max-width: 1080px; margin: 0 auto; padding: 32px 24px 80px; }
    .masthead { display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
    .masthead-title { font-size: 34px; line-height: 40px; margin: 8px 0; }
    .counts { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--muted); margin: 0 0 12px; }
    .blurb { max-width: 520px; margin: 0; }
    .masthead-art app-cover { width: 100%; aspect-ratio: 1; border-radius: 24px; }
    .subscribe { margin-top: 24px; max-width: 420px; display: flex; flex-direction: column; gap: 8px; }
    .subscribe-row { display: flex; gap: 8px; }
    .subscribe-row input { flex: 1; min-height: 44px; padding: 10px 12px; border-radius: 4px; border: 1px solid var(--ink-4); background: var(--paper); }
    .section { margin-top: 48px; }
    .list { list-style: none; margin: 16px 0 0; padding: 0; }
    .event-card { padding: 12px; display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; }
    .event-card app-cover { width: 100%; aspect-ratio: 16/9; }
    .title { margin: 0; font-size: 14px; line-height: 21px; font-weight: 500; }
    .empty { padding: 32px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    @media (max-width: 999px) { .masthead { grid-template-columns: 1fr; } }
    @media (max-width: 649px) { .masthead-art { display: none; } }
    @media (max-width: 483px) { .content { padding: 24px 16px 80px; } }
  `],
})
export class CategoryComponent {
  slug = signal<string | null>(null);
  events = signal<CommunityEvent[]>([]);
  calendars = signal<Array<{ slug: string; name: string }>>([]);
  loading = signal(true);
  subscribed = false;

  constructor(private route: ActivatedRoute, private api: ApiService) {
    this.route.paramMap.subscribe((params) => {
      const slug = (this.route.snapshot.data as { category?: string })['category'] ?? params.get('slug') ?? '';
      this.slug.set(slug);
      this.loading.set(true);
      this.api
        .events({ category: slug, limit: 100 })
        .then((events) => {
          this.events.set(events.rows);
          const seen = new Map<string, { slug: string; name: string }>();
          for (const e of events.rows) {
            if (e.calendar_slug) seen.set(e.calendar_slug, { slug: e.calendar_slug, name: e.calendar_name ?? e.calendar_slug });
          }
          this.calendars.set([...seen.values()]);
          this.loading.set(false);
        })
        .catch(() => this.loading.set(false));
    });
  }

  get cat(): string {
    return this.slug() ?? '';
  }

  label(slug: string): string {
    return categoryLabel(slug);
  }

  hue(slug: string): string {
    return categoryHue(slug);
  }

  blurb(slug: string): string {
    return CATEGORY_BLURBS[slug] ?? '';
  }

  get isCategory(): boolean {
    return CATEGORIES.some((c) => c.slug === this.slug());
  }
}

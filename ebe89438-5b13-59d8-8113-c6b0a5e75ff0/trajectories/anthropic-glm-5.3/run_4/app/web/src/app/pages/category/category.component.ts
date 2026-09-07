import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CATEGORY_GLYPHS, CATEGORY_DESCRIPTIONS } from '../../core/visuals';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="masthead">
        <div class="head">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" [attr.stroke]="glyph().hue" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path [attr.d]="glyph().path" />
          </svg>
          <h1 class="serif title">{{ glyph().label }}</h1>
          <p class="caption counts">{{ eventCount() }} events · {{ calendarCount() }} calendars</p>
          <p class="desc">{{ description() }}</p>
          <form class="subscribe" (submit)="subscribe($event)">
            <label class="sr-only" for="sub-email">Email</label>
            <input id="sub-email" type="email" [(ngModel)]="email" placeholder="you@example.com" required />
            <button class="btn btn-secondary" type="submit">Subscribe</button>
          </form>
        </div>
        <div class="deco card" aria-hidden="true">
          <div class="deco-art"></div>
        </div>
      </div>

      @if (loading()) {
        <ul class="grid">@for (i of [1,2,3]; track i) { <li><div class="skeleton" style="height:120px"></div></li> }</ul>
      } @else if (calendars().length === 0) {
        <div class="empty-state">
          <h2>There are currently no relevant events near you.</h2>
          <a class="btn btn-primary" routerLink="/discover">Explore Events</a>
        </div>
      } @else {
        <h2 class="overline sec">Calendars</h2>
        <ul class="grid">
          @for (cal of calendars(); track cal.slug) {
            <li><a class="card cal" [routerLink]="['/', cal.slug]">
              <span class="name">{{ cal.name }}</span>
              <span class="caption">{{ cal.city }}</span>
            </a></li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .masthead { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 32px; }
    .head { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
    .title { font-size: 44px; line-height: 48px; }
    .counts { color: var(--muted); font-weight: 600; }
    .desc { max-width: 520px; color: var(--ink-64); }
    .subscribe { display: flex; gap: 8px; margin-top: 8px; width: min(420px, 100%); }
    .subscribe input { flex: 1; min-height: 44px; padding: 10px 14px; border-radius: var(--r-input); border: 1px solid var(--ink-08); }
    .deco { min-height: 180px; background: linear-gradient(135deg, rgba(243,26,124,0.08), rgba(214,151,18,0.10)); }
    .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .cal { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
    .name { font-weight: 500; }
    .sec { color: var(--muted); margin-bottom: 12px; }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 650px) { .masthead { grid-template-columns: 1fr 220px; } }
    @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `],
})
export class CategoryComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  slug = '';
  calendars = signal<Array<{ slug: string; name: string; city: string }>>([]);
  eventCount = signal(0);
  calendarCount = signal(0);
  loading = signal(true);
  email = signal('');

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.load();
  }

  async load(): Promise<void> {
    const { total } = await this.api.listEvents({ category: this.slug, limit: 24 });
    this.eventCount.set(total);
    const { items } = await this.api.listEvents({ category: this.slug, limit: 24 });
    const cals: Array<{ slug: string; name: string; city: string }> = [];
    const seen = new Set<string>();
    for (const ev of items) {
      if (ev.calendar && !seen.has(ev.calendar.slug)) {
        seen.add(ev.calendar.slug);
        cals.push({ slug: ev.calendar.slug, name: ev.calendar.name, city: ev.city });
      }
    }
    this.calendars.set(cals);
    this.calendarCount.set(cals.length);
    this.loading.set(false);
  }

  subscribe(e: Event): void { e.preventDefault(); this.email.set(''); }

  glyph() { return CATEGORY_GLYPHS[this.slug] ?? { hue: '#146aeb', label: this.slug, path: '' }; }
  description(): string { return CATEGORY_DESCRIPTIONS[this.slug] ?? 'Gatherings in this category.'; }
}

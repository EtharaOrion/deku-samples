import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, CATEGORIES, EventItem } from '../api';
import { PublicBarComponent } from '../chrome';
import { IconDirective } from '../icons';

/** One of the twelve categories. */
@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicBarComponent, IconDirective],
  template: `
    <app-public-bar />
    <main class="page">
      @if (cat; as c) {
        <div class="masthead">
          <div class="masthead-main">
            <svg [appIcon]="c.slug" [size]="48" [hue]="c.hue"></svg>
            <h1 class="cat-title">{{ c.label }}</h1>
            <p class="counts">{{ eventCount }} events · {{ calCount }} calendars</p>
            <p class="blurb">{{ c.blurb }}</p>
            <form class="subscribe" (submit)="$event.preventDefault()">
              <label class="sr-only" for="sub">Email for updates</label>
              <input id="sub" type="email" placeholder="Your email" />
              <button class="btn btn-secondary" type="submit">Subscribe</button>
            </form>
          </div>
          <div class="deco card" aria-hidden="true"></div>
        </div>
        @if (loading) {
          <ul class="grid"><li class="skeleton" style="height:200px"></li><li class="skeleton" style="height:200px"></li><li class="skeleton" style="height:200px"></li></ul>
        } @else if (events.length === 0) {
          <div class="empty card card-24">
            <h2 class="empty-title">There are currently no relevant events near you.</h2>
            <a routerLink="/discover" class="btn btn-primary">Explore Events</a>
          </div>
        } @else {
          <ul class="grid">
            @for (e of events; track e.id) {
              <li><a [routerLink]="'/' + e.slug" class="card ev">
                <span class="ev-title">{{ e.title }}</span>
                <span class="caption">{{ e.city }} · {{ e.starts_at | date:'d MMM' }}</span>
              </a></li>
            }
          </ul>
        }
      }
    </main>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 96px 24px 64px; }
    .masthead { display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; margin-bottom: 48px; }
    .masthead-main { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
    .cat-title { font-family: var(--serif); font-size: 44px; line-height: 50px; font-weight: 400; }
    .counts { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ink-64); }
    .blurb { font-size: 16px; line-height: 24px; color: var(--ink-64); max-width: 480px; }
    .subscribe { display: flex; gap: 8px; }
    .subscribe input { border-radius: 4px; border: 1px solid var(--ink-08); padding: 10px 12px; min-width: 220px; min-height: 44px; }
    .deco { height: 180px; background: var(--panel); }
    .grid { list-style: none; display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
    .ev { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .ev-title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .empty { padding: 48px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
    .empty-title { font-family: var(--serif); font-weight: 400; font-size: 22px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 999px) { .masthead { grid-template-columns: 1fr; } .grid { grid-template-columns: repeat(2,1fr); } }
    @media (max-width: 649px) { .grid { grid-template-columns: 1fr; } .deco { display: none; } }
  `],
})
export class CategoryComponent implements OnInit {
  events: EventItem[] = [];
  loading = true;
  calCount = 0;
  eventCount = 0;
  cat: (typeof CATEGORIES)[number] | null = null;
  private api = inject(Api);
  private route = inject(ActivatedRoute);

  ngOnInit() {
    // The category slug is the last segment of the address.
    const slug = this.route.snapshot.url.map(s => s.path).pop() ?? '';
    const c = CATEGORIES.find(x => x.slug === slug) ?? null;
    this.cat = c;
    if (!c) return;
    this.api.listEvents({ category: c.slug, limit: 60 }).subscribe((r: { items: EventItem[]; total: number }) => {
      this.events = r.items; this.eventCount = r.total; this.loading = false;
      const s = new Set(r.items.map(e => e.calendar?.slug).filter(Boolean));
      this.calCount = s.size;
    }, () => (this.loading = false));
  }
}

/** /app — get the app, with a scan code drawn from geometry. */
@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicBarComponent],
  template: `
    <app-public-bar />
    <main class="page">
      <h1 class="screen-title">Get the App</h1>
      <div class="split">
        <div class="copy">
          <p class="lede">Take your ticket with you. Scan the code with your camera and the app installs to your home screen.</p>
          <a routerLink="/signup" class="btn btn-primary">Create Your First Event</a>
        </div>
        <div class="code-card card card-24">
          <svg viewBox="0 0 230 230" width="230" height="230" role="img" aria-label="Scan code to get the app">
            <rect x="0" y="0" width="230" height="230" fill="var(--paper)" />
            @for (m of modules; track m.k) { <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="var(--ink)" /> }
            @for (f of finders; track f.k) {
              <rect [attr.x]="f.x" [attr.y]="f.y" width="55.2" height="55.2" rx="15.456" fill="none" stroke="var(--ink)" stroke-width="9.2" />
            }
          </svg>
          <p class="caption">Point your camera here.</p>
        </div>
      </div>
    </main>
  `,
  styles: [`
    .page { max-width: 1080px; margin: 0 auto; padding: 96px 24px 64px; }
    .split { display: grid; grid-template-columns: 1fr auto; gap: 48px; align-items: center; margin-top: 24px; }
    .copy { display: flex; flex-direction: column; gap: 24px; align-items: flex-start; }
    .lede { font-size: 16px; line-height: 25.6px; color: var(--ink-64); max-width: 420px; }
    .code-card { padding: 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    @media (max-width: 999px) { .split { grid-template-columns: 1fr; } }
  `],
})
export class GetAppComponent {
  finders = [
    { k: 'a', x: 36.8, y: 36.8 },
    { k: 'b', x: 138, y: 36.8 },
    { k: 'c', x: 36.8, y: 138 },
  ];
  modules: { k: string; x: number; y: number }[] = [];
  constructor() {
    // Deterministic pattern from geometry: 25x25 modules at 9.2 each.
    let seed = 8675309;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let r = 0; r < 25; r++) {
      for (let c = 0; c < 25; c++) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > 16) || (r > 16 && c < 8);
        if (inFinder) continue;
        if (rnd() > 0.52) this.modules.push({ k: `${r}-${c}`, x: 36.8 + c * 6.3, y: 36.8 + r * 6.3 });
      }
    }
  }
}

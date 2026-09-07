import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PublicBarComponent } from '../public-bar';
import { CoverComponent } from '../cover';
import { IconComponent } from '../icon';
import { Api, ApiEvent } from '../api';
import { Auth } from '../auth';
import { CATEGORY_LABEL } from '../categories';
import { EventPageComponent } from './event/event-page';
import { CategoryComponent } from './category';

/**
 * Root-namespace resolver: reserved paths, then categories, then event slug,
 * then calendar slug, then account handle, otherwise the not-found page.
 */
@Component({
  selector: 'app-resolver',
  standalone: true,
  imports: [PublicBarComponent, CoverComponent, IconComponent, RouterLink, CommonModule, EventPageComponent, CategoryComponent],
  template: `
    <app-public-bar></app-public-bar>
    @if (kind() === 'event') {
      <app-event-page [slugInput]="slug()" [embedded]="true"></app-event-page>
    } @else if (kind() === 'calendar' && calendar(); as cal) {
      <main class="wrap">
        <div class="cal-head">
          <app-icon [name]="cal.category" [size]="24"></app-icon>
          <h1 class="h1">{{ cal.name }}</h1>
          <span class="badge-ts">{{ cal.city }} · Calendar</span>
        </div>
        @if (events().length === 0) {
          <div class="empty">
            <h2>No Events Found</h2>
            <p>Try a wider date range or a different category.</p>
            <a class="btn btn-primary" routerLink="/discover">Clear Filters</a>
          </div>
        } @else {
          <ul class="grid">
            @for (ev of events(); track ev.slug) {
              <li><a class="card ev-card" [routerLink]="['/' + ev.slug]">
                <app-cover [seed]="ev.cover_seed" [size]="'100%'" [radius]="'12px'"></app-cover>
                <div class="ev-body">
                  <span class="ev-title">{{ ev.title }}</span>
                  <span class="ev-meta">{{ ev.city }} · {{ fmt(ev.starts_at, ev.time_zone) }}</span>
                  @if (ev.state === 'registration_closed') { <span class="pill pill-muted">Registration closed</span> }
                </div>
              </a></li>
            }
          </ul>
        }
      </main>
    } @else if (kind() === 'account' && profile(); as p) {
      <main class="wrap">
        <div class="cal-head">
          <h1 class="h1">{{ p.display_name }}</h1>
          <span class="badge-ts">@{{ p.handle }} · {{ p.role === 'host' ? 'Host' : 'Guest' }}</span>
        </div>
        @if (p.calendars?.length) {
          <ul class="grid">
            @for (cal of p.calendars; track cal.slug) {
              <li><a class="card ev-card" [routerLink]="['/' + cal.slug]">
                <app-icon [name]="cal.category" [size]="24"></app-icon>
                <div class="ev-body"><span class="ev-title">{{ cal.name }}</span><span class="ev-meta">{{ cal.city }}</span></div>
              </a></li>
            }
          </ul>
        }
      </main>
    } @else if (kind() === 'category') {
      <app-category [slugInput]="slug()"></app-category>
    } @else {
      <main class="wrap nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </main>
    }
  `,
  styles: [`
    :host { display: block; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 96px; }
    .cal-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0; }
    .desc { font-size: 16px; line-height: 25.6px; color: var(--ink-64); max-width: 640px; margin: 0 0 24px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .ev-card { display: flex; flex-direction: column; gap: 12px; padding: 12px; text-decoration: none; color: var(--ink); }
    .ev-body { display: flex; flex-direction: column; gap: 6px; padding: 4px 8px 8px; }
    .ev-title { font-size: 14px; line-height: 21px; font-weight: 500; }
    .ev-meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .empty { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .empty h2 { font-family: var(--serif); font-weight: 400; font-size: 24px; margin: 0; }
    .nf { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; padding-top: 96px; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
    @media (min-width: 1580px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 484px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ResolverComponent implements OnInit {
  kind = signal<string | null>(null);
  slug = signal('');
  label = signal('');
  event = signal<ApiEvent | null>(null);
  calendar = signal<any | null>(null);
  profile = signal<any | null>(null);
  events = signal<ApiEvent[]>([]);

  constructor(public api: Api, private route: ActivatedRoute, private router: Router, public auth: Auth) {}

  ngOnInit() {
    this.route.paramMap.subscribe((pm) => {
      const slug = pm.get('slug') || '';
      this.slug.set(slug);
      this.api.get<any>(`/resolve/${slug}`).then(({ status, body }) => {
        if (status !== 200) { this.kind.set('notfound'); return; }
        const kind = (body as any).kind;
        this.kind.set(kind);
        if (kind === 'event') this.loadEvent(slug);
        else if (kind === 'calendar') this.loadCalendar(slug);
        else if (kind === 'account') this.loadProfile(slug);
        else if (kind === 'category') this.label.set(CATEGORY_LABEL[slug] || slug);
      });
    });
  }

  async loadEvent(slug: string) {
    const { status, body } = await this.api.get<ApiEvent>(`/events/${slug}`);
    if (status !== 200) { this.kind.set('notfound'); return; }
    this.event.set(body);
  }

  async loadCalendar(slug: string) {
    const { status, body } = await this.api.get<any>(`/calendars/${slug}`);
    if (status !== 200) { this.kind.set('notfound'); return; }
    this.calendar.set(body);
    this.events.set((body as any).events || []);
  }

  async loadProfile(slug: string) {
    const { status, body } = await this.api.get<any>(`/accounts/${slug}`);
    if (status !== 200) { this.kind.set('notfound'); return; }
    this.profile.set(body);
  }

  fmt(iso: string, zone: string) { return Api.inZone(iso, zone); }
  vz() { return Api.visitorZone(); }
  zd(iso: string, zone: string) { return Api.zonesDiffer(iso, zone); }
}
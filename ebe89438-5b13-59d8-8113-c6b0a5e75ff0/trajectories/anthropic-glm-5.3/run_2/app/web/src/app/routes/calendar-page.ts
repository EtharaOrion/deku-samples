import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Cover } from '../ui/cover';
import { NotFoundEmbed } from './not-found-embed';
import { TimeFmt } from '../core/time';

/** A calendar at its own short address. */
@Component({
  selector: 'cc-calendar-page',
  standalone: true,
  imports: [PublicBar, RouterLink, Cover, NotFoundEmbed],
  template: `
  <cc-public-bar></cc-public-bar>
  @if (loading) {
    <main class="container page"><div class="skeleton skeleton-text" style="width:40%"></div></main>
  } @else if (!cal) {
    <main class="container page"><cc-not-found-embed></cc-not-found-embed></main>
  } @else {
    <main class="container page">
      <header class="mast">
        <cc-cover [seed]="slug" [size]="96"></cc-cover>
        <div class="grow">
          <h1 class="h1-display title">{{ cal.name }}</h1>
          <p class="caption">{{ cal.category }} · {{ cal.city }} · {{ events.length }} coming up</p>
          <button class="btn btn-sm btn-secondary" type="button" (click)="follow()">{{ followed ? 'Following' : 'Follow' }}</button>
        </div>
      </header>
      @if (!events.length) {
        <div class="empty">
          <h2>No Upcoming Events</h2>
          <p>Events this calendar publishes will appear here.</p>
          <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <ul class="grid">
          @for (e of events; track e.slug) {
            <li><a class="card card-lift ev" [routerLink]="['/', e.slug]">
              <cc-cover [seed]="e.cover_seed || e.slug" [size]="140"></cc-cover>
              <div>
                <p class="card-title">{{ e.title }}</p>
                <p class="caption">{{ when(e) }} · {{ e.city }}</p>
                @if (e.state === 'registration_closed') {
                  <span class="pill pill-neutral"><span class="pill-dot"></span>Registration Closed</span>
                } @else {
                  <p class="caption">{{ seats(e) }}</p>
                }
              </div>
            </a></li>
          }
        </ul>
      }
    </main>
  }`,
  styles: [`
    .page { padding-top: 104px; min-height: 100vh; }
    .mast { display: flex; gap: 20px; align-items: center; margin-bottom: 40px; }
    .title { font-size: 36px; line-height: 42px; margin: 0 0 6px; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid;
      grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .ev { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
    @media (max-width: 1000px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 484px) { .grid { grid-template-columns: 1fr; } .mast { flex-direction: column; align-items: flex-start; } }
  `],
})
export class CalendarPage implements OnInit {
  slug = '';
  loading = true;
  cal: any = null;
  events: any[] = [];
  followed = false;

  constructor(private route: ActivatedRoute, private fmt: TimeFmt) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = (m.get('slug') ?? '').toLowerCase();
      // A calendar page shows the events its own calendar holds.
      this.cal = await fetch(`/api/calendars/by-slug/${this.slug}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
      if (this.cal && this.cal.is_public) {
        this.events = await fetch(`/api/events?calendar=${this.slug}&limit=100`)
          .then(r => r.json()).catch(() => []);
      } else {
        this.cal = this.cal && !this.cal.is_public ? null : this.cal;
      }
      this.loading = false;
    });
  }

  when(e: any): string { return this.fmt.inZone(e.starts_at, e.time_zone); }
  seats(e: any): string {
    return e.remaining === 0 ? 'Waiting list only' : `${e.remaining} of ${e.capacity} seats left`;
  }
  follow(): void { this.followed = !this.followed; }
}

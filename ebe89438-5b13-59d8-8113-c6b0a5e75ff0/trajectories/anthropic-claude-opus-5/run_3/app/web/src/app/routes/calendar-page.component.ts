import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import { CATEGORY_LABELS, type Calendar, type EventSummary } from '../core/models';
import { PublicBarComponent } from '../layout/public-bar.component';
import { EventCardComponent } from '../shared/event-card.component';
import { AvatarComponent } from '../shared/ui';
import { CategoryIconComponent } from '../shared/icons.component';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [PublicBarComponent, EventCardComponent, AvatarComponent, CategoryIconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main class="calendar">
      <div class="page">
        @if (loading()) {
          <div class="skeleton" style="height: 44px; width: 50%"></div>
          <div class="skeleton" style="height: 24px; width: 30%; margin-top: 16px"></div>
        } @else if (calendar()) {
          @let cal = calendar()!;
          <header class="masthead">
            <app-avatar [name]="cal.name" [size]="56" />
            <div>
              <h1 class="t-serif">{{ cal.name }}</h1>
              <p class="meta t-caption">
                <app-category-icon [category]="cal.category" [size]="16" [label]="labelFor(cal.category)" />
                {{ labelFor(cal.category) }} &middot; {{ cal.city }}
                @if (!cal.is_public) {
                  <span class="private">Private</span>
                }
              </p>
              <p class="owner t-caption">Kept by {{ cal.owner_name }}</p>
            </div>
          </header>

          @if (events().length === 0) {
            <div class="empty-state">
              <h2>Nothing published yet</h2>
              <p>When this calendar publishes an event, it will appear here.</p>
              <a routerLink="/discover" class="btn btn-primary btn-pill">Discover Events</a>
            </div>
          } @else {
            <ul class="results">
              @for (event of events(); track event.slug) {
                <li><app-event-card [event]="event" /></li>
              }
            </ul>
          }
        }
      </div>
    </main>
  `,
  styles: [
    `
      .calendar { padding: 96px 0; min-height: 100vh; }

      .masthead {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 40px;
      }

      h1 { font-size: 36px; line-height: 44px; }

      .meta {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--muted);
        margin-top: 6px;
      }

      .private {
        color: var(--pink);
        font-weight: 600;
      }

      .owner { color: var(--muted); margin-top: 2px; }

      .results {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      @media (min-width: 484px) { .results { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1000px) { .results { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    `,
  ],
})
export class CalendarPageComponent implements OnInit {
  @Input({ required: true }) slug = '';

  private api = inject(ApiService);
  private router = inject(Router);

  readonly calendar = signal<(Calendar & { owner_name: string }) | null>(null);
  readonly events = signal<EventSummary[]>([]);
  readonly loading = signal(true);

  ngOnInit() {
    this.api.calendar(this.slug).subscribe({
      next: (cal) => {
        this.calendar.set(cal as any);
        this.events.set(cal.events ?? []);
        this.loading.set(false);
      },
      error: (err: ApiRefusal) => {
        this.loading.set(false);
        if (err.isNotFound) this.router.navigateByUrl('/not-found', { replaceUrl: true });
      },
    });
  }

  labelFor(category: string) {
    return CATEGORY_LABELS[category] ?? category;
  }
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [PublicBarComponent, AvatarComponent, RouterLink, CategoryIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />

    <main class="profile">
      <div class="page">
        @if (loading()) {
          <div class="skeleton" style="height: 44px; width: 40%"></div>
        } @else if (profile()) {
          @let p = profile()!;
          <header class="masthead">
            <app-avatar [name]="p.display_name" [size]="64" />
            <div>
              <h1 class="t-serif">{{ p.display_name }}</h1>
              <p class="handle t-caption">&#64;{{ p.handle }}</p>
            </div>
          </header>

          @if (p.calendars.length) {
            <h2 class="t-overline section">Calendars</h2>
            <ul class="cal-list">
              @for (cal of p.calendars; track cal.slug) {
                <li>
                  <a [routerLink]="'/' + cal.slug" class="cal-card lift">
                    <app-category-icon [category]="cal.category" [size]="20" [label]="cal.category" />
                    <span class="cal-name t-card-title">{{ cal.name }}</span>
                    <span class="t-caption">{{ cal.city }}</span>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <div class="empty-state">
              <h2>No public calendars</h2>
              <p>This account keeps nothing public at the moment.</p>
              <a routerLink="/discover" class="btn btn-primary btn-pill">Discover Events</a>
            </div>
          }
        }
      </div>
    </main>
  `,
  styles: [
    `
      .profile { padding: 96px 0; min-height: 100vh; }

      .masthead { display: flex; align-items: center; gap: 16px; margin-bottom: 40px; }
      h1 { font-size: 36px; line-height: 44px; }
      .handle { color: var(--muted); margin-top: 4px; }
      .section { color: var(--ink-36); margin-bottom: 12px; }

      .cal-list {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      .cal-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--elev-card);
      }

      .cal-card .t-caption { color: var(--muted); }

      @media (min-width: 484px) { .cal-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 1000px) { .cal-list { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    `,
  ],
})
export class ProfilePageComponent implements OnInit {
  @Input({ required: true }) handle = '';

  private api = inject(ApiService);
  private router = inject(Router);

  readonly profile = signal<{ display_name: string; handle: string; calendars: Calendar[] } | null>(null);
  readonly loading = signal(true);

  ngOnInit() {
    this.api.profile(this.handle).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: (err: ApiRefusal) => {
        this.loading.set(false);
        if (err.isNotFound) this.router.navigateByUrl('/not-found', { replaceUrl: true });
      },
    });
  }
}

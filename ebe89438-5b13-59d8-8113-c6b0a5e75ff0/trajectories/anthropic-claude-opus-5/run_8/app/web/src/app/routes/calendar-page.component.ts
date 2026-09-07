import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import type { CalendarPage } from '../core/models';
import { CATEGORY_LABELS } from '../core/models';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { AvatarComponent, CategoryIconComponent } from '../ui/icons.component';
import { NotFoundComponent } from './not-found.component';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, EventCardComponent, AvatarComponent, CategoryIconComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <div class="public-shell">
        <main id="main" class="page">
          @if (loading()) {
            <div class="skeleton" style="height: 48px; width: 320px"></div>
            <div class="skeleton" style="height: 240px; margin-top: 32px; border-radius: 12px"></div>
          } @else if (data(); as cal) {
            <header class="masthead">
              <app-avatar [name]="cal.name" [size]="56" />
              <div>
                <h1 class="serif">{{ cal.name }}</h1>
                <p class="meta t-caption">
                  <app-category-icon [name]="cal.category" [size]="16" />
                  {{ label(cal.category) }} · {{ cal.city }} · kept by
                  <a class="link" [routerLink]="['/', cal.owner_handle]">{{ cal.owner_name }}</a>
                </p>
                @if (!cal.is_public) {
                  <span class="pill pill-private">Private</span>
                }
              </div>
            </header>

            <h2 class="t-section-heading section">What’s coming up</h2>
            @if (cal.events.length === 0) {
              <div class="empty-state">
                <h2>No Events Yet</h2>
                <p>This calendar has nothing published right now. Try discovery for what else is on.</p>
                <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
              </div>
            } @else {
              <ul class="grid">
                @for (e of cal.events; track e.slug) {
                  <li><app-event-card [event]="e" /></li>
                }
              </ul>
            }
          }
        </main>
      </div>
    }
  `,
  styles: [
    `
      .masthead {
        display: flex;
        gap: var(--s4);
        align-items: center;
        padding: var(--s7) 0 var(--s5);
      }
      h1 {
        font-size: 36px;
        line-height: 44px;
        font-weight: 400;
      }
      .meta {
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: var(--s1);
        margin-top: var(--s2);
        flex-wrap: wrap;
      }
      .link {
        color: var(--blue);
      }
      .section {
        margin: var(--s5) 0 var(--s4);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s4);
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `,
  ],
})
export class CalendarPageComponent implements OnDestroy {
  private api = inject(ApiService);
  readonly slug = input.required<string>();
  readonly data = signal<CalendarPage | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  private last = '';

  constructor() {
    clearTheme();
    effect(() => {
      const s = this.slug();
      if (s && s !== this.last) {
        this.last = s;
        void this.load(s);
      }
    });
  }

  ngOnDestroy(): void {
    clearTheme();
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  private async load(slug: string) {
    this.loading.set(true);
    this.missing.set(false);
    try {
      this.data.set(await this.api.getCalendar(slug));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

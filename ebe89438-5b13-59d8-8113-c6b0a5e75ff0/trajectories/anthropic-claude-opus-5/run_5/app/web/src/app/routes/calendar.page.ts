import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { PublicBarComponent } from '../ui/public-bar.component';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { DateChipComponent, EmptyStateComponent } from '../ui/bits';
import { CoverComponent } from '../ui/cover.component';
import { NotFoundPage } from './not-found.page';
import { dayLine, timeLine, zoneAbbrev } from '../core/time';
import {
  CATEGORY_LABELS,
  EVENT_STATE_TONES,
  EVENT_STATE_WORDS,
  type CalendarPage,
} from '../core/models';

/** A calendar at its own short address, with the events anyone may see. */
@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    AvatarComponent,
    IconComponent,
    PillComponent,
    DateChipComponent,
    EmptyStateComponent,
    CoverComponent,
    NotFoundPage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <main id="main" class="page wrap">
        @if (loading()) {
          <div class="skeleton head-skeleton" aria-busy="true"></div>
          <div class="skeleton list-skeleton"></div>
        } @else if (cal(); as c) {
          <header class="head">
            <app-avatar [name]="c.name" [size]="56" />
            <div class="head__lines">
              <h1 class="head__title">{{ c.name }}</h1>
              <p class="head__meta t-overline">
                <app-icon [name]="anyIcon(c.category)" [size]="16" />
                {{ label(c.category) }} · {{ c.city }}
              </p>
              <p class="t-caption head__owner">
                Kept by
                <a [routerLink]="'/' + c.owner_handle">{{ c.owner_name }}</a>
              </p>
            </div>
            @if (!c.is_public) {
              <app-pill word="Private" tone="pink" />
            }
          </header>

          <section aria-labelledby="cal-events" class="section">
            <h2 class="t-screen-title section__head" id="cal-events">Events</h2>
            @if (c.events.length === 0) {
              <app-empty-state
                title="No Events Yet"
                body="Nothing is on this calendar just now. Try browsing what else is published."
                actionLabel="Discover Events"
                actionLink="/discover"
              />
            } @else {
              <ul class="rows">
                @for (e of c.events; track e.slug) {
                  <li class="row">
                    <a class="row__link" [routerLink]="'/' + e.slug">
                      <span class="row__cover">
                        <app-cover
                          [seed]="e.cover_seed"
                          [showTitle]="false"
                          [radius]="'8px'"
                          [pixelSize]="44"
                        />
                      </span>
                      <app-date-chip [instant]="e.starts_at" [zone]="e.time_zone" />
                      <span class="row__lines">
                        <span class="t-row row__title">{{ e.title }}</span>
                        <span class="t-caption row__when">{{ when(e) }}</span>
                      </span>
                      <span class="spacer"></span>
                      <app-pill [word]="stateWord(e.state)" [tone]="stateTone(e.state)" />
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </main>
    }
  `,
  styles: [
    `
      .wrap {
        padding-top: 96px;
        padding-bottom: var(--s8);
        display: flex;
        flex-direction: column;
        gap: var(--s6);
      }
      .head-skeleton { height: 84px; }
      .list-skeleton { height: 300px; border-radius: var(--r-card); }
      .head { display: flex; align-items: center; gap: var(--s4); flex-wrap: wrap; }
      .head__lines { display: flex; flex-direction: column; gap: var(--s1); min-width: 0; }
      .head__title { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 42px; }
      .head__meta { color: var(--ink-64); display: inline-flex; align-items: center; gap: var(--s1); }
      .head__owner { color: var(--muted); }

      .section { display: flex; flex-direction: column; gap: var(--s3); }
      .section__head { font-family: var(--serif); font-weight: 400; }
      .rows { display: flex; flex-direction: column; }
      .row { border-bottom: 1px solid var(--divider); }
      .row__link {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        color: inherit;
        min-height: 64px;
      }
      .row__cover { width: 44px; flex: none; }
      .row__lines { display: flex; flex-direction: column; min-width: 0; }
      .row__title { font-weight: 500; }
      .row__when { color: var(--muted); }
    `,
  ],
})
export class CalendarPageComponent implements OnDestroy {
  readonly slug = input.required<string>();

  private api = inject(ApiService);
  private themeService = inject(ThemeService);

  readonly cal = signal<CalendarPage | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);

  private loadedSlug = '';

  constructor() {
    this.themeService.clear();
    effect(() => {
      const slug = this.slug();
      if (!slug || slug === this.loadedSlug) return;
      this.loadedSlug = slug;
      this.load(slug);
    });
  }

  ngOnDestroy(): void {
    this.themeService.clear();
  }

  private load(slug: string): void {
    this.loading.set(true);
    this.missing.set(false);
    this.api.calendarPage(slug).subscribe({
      next: (c) => {
        this.cal.set(c);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.missing.set(true);
      },
    });
  }

  when(e: { starts_at: string | null; time_zone: string }): string {
    if (!e.starts_at) return 'Date to be announced';
    return `${dayLine(e.starts_at, e.time_zone)}, ${timeLine(e.starts_at, e.time_zone)} ${zoneAbbrev(
      e.starts_at,
      e.time_zone,
    )}`;
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  anyIcon(name: string): any {
    return name;
  }

  stateWord(state: any): string {
    return EVENT_STATE_WORDS[state as keyof typeof EVENT_STATE_WORDS] ?? state;
  }

  stateTone(state: any): any {
    return EVENT_STATE_TONES[state as keyof typeof EVENT_STATE_TONES] ?? 'neutral';
  }
}

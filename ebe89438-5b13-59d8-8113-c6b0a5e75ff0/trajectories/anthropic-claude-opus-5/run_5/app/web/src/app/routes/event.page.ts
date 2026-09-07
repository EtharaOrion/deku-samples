import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CoverComponent } from '../ui/cover.component';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { DateChipComponent } from '../ui/bits';
import { NotFoundPage } from './not-found.page';
import { RegistrationPanelComponent } from './registration-panel.component';
import { dayLine, timeRange, visitorZone, zoneAbbrev, zonesDiffer } from '../core/time';
import { withAlpha } from '../core/art';
import {
  EVENT_STATE_TONES,
  EVENT_STATE_WORDS,
  type EventDetail,
  type MyRegistration,
} from '../core/models';

/**
 * Two columns at 1000px and above: a left rail of 332px and a content column of
 * 568px with a 48px gap, the pair centred. Below 1000px the rail moves above the
 * content and the cover becomes full width. The theme fades in once over 2000ms
 * and, because the server already wrote the key colour into the first document,
 * the page arrives wearing it rather than repainting.
 */
@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    AvatarComponent,
    IconComponent,
    PillComponent,
    DateChipComponent,
    NotFoundPage,
    RegistrationPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <div class="ground" aria-hidden="true">
        <span class="ground__field" [style.background]="gradientGround()"></span>
      </div>
      <app-public-bar />

      <main id="main" class="shell">
        @if (loading()) {
          <div class="rail" aria-busy="true">
            <div class="skeleton skeleton--media rail__cover-skeleton"></div>
            <div class="skeleton rail__line"></div>
          </div>
          <div class="content" aria-busy="true">
            <div class="skeleton content__title-skeleton"></div>
            <div class="skeleton content__line"></div>
            <div class="skeleton content__panel-skeleton"></div>
          </div>
        } @else if (event(); as e) {
          <aside class="rail">
            <div class="rail__cover">
              <app-cover
                [seed]="e.cover_seed"
                [title]="e.title"
                [radius]="'11px'"
                [pixelSize]="332"
              />
            </div>

            <div class="presented">
              <app-avatar [name]="e.calendar_name" [size]="24" />
              <span class="presented__lines">
                <span class="presented__overline t-badge">Presented by</span>
                <a class="presented__name" [routerLink]="'/' + e.calendar_slug">
                  {{ e.calendar_name }}
                  <app-icon name="chevron-right" [size]="16" colour="currentColor" />
                </a>
              </span>
              @if (!e.calendar_is_public) {
                <app-pill word="Private" tone="pink" />
              }
              <span class="spacer"></span>
              <button type="button" class="btn btn--pill btn--sm follow" (click)="follow()">
                {{ following() ? 'Following' : 'Follow' }}
              </button>
            </div>

            @if (e.is_owner) {
              <a class="btn btn--sm rail__manage" [routerLink]="'/event/' + e.slug + '/manage/overview'"
                >Manage This Event</a
              >
            }
          </aside>

          <div class="content">
            <div class="content__head">
              <h1 class="title">{{ e.title }}</h1>
              @if (e.state !== 'published') {
                <app-pill [word]="stateWord(e)" [tone]="stateTone(e)" />
              }
            </div>

            <div class="facts">
              <div class="fact">
                <app-date-chip [instant]="e.starts_at" [zone]="e.time_zone" />
                <div class="fact__lines">
                  <p class="fact__strong">{{ dayText(e) }}</p>
                  <p class="fact__weak t-caption">{{ timeText(e) }}</p>
                  @if (showVisitorZone(e)) {
                    <p class="fact__weak t-caption">{{ visitorText(e) }}</p>
                  }
                </div>
              </div>

              <div class="fact">
                <span class="fact__glyph">
                  <app-icon name="pin" [size]="20" [colour]="'var(--event-ink)'" />
                </span>
                <div class="fact__lines">
                  <p class="fact__strong">{{ e.city || 'Location to be announced' }}</p>
                  <p class="fact__weak t-caption">
                    {{ e.category ? categoryText(e) : 'A public gathering' }}
                  </p>
                </div>
              </div>
            </div>

            @if (e.state === 'cancelled') {
              <section class="notice-block" role="status">
                <h2 class="t-prose-h">This event has been cancelled</h2>
                <p class="t-prose">{{ e.cancel_reason }}</p>
              </section>
            } @else {
              <app-registration-panel [event]="e" (changed)="onRegistrationChanged($event)" />
            }

            @if (e.description) {
              <section class="about">
                <h2 class="t-prose-h">About this event</h2>
                <p class="t-prose about__body">{{ e.description }}</p>
              </section>
            }

            @if (e.is_owner || mySeat()) {
              <p class="t-caption address">
                Address: <span class="address__value">{{ fullAddress(e) }}</span>
              </p>
            }
          </div>
        }
      </main>
    }
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; }
      /* Four radial gradients behind the themed page, faded in once over 2000ms
         and holding forwards. The blurs here are painted once and left alone. */
      .ground { position: fixed; inset: 0; z-index: var(--z-decor); pointer-events: none; }
      .ground__field {
        position: absolute;
        inset: 0;
        animation: event-theme-fade-in 2000ms linear forwards;
      }

      .shell {
        display: grid;
        gap: var(--s7);
        max-width: 948px;
        margin: 0 auto;
        padding: 104px var(--s5) var(--s8);
        grid-template-columns: 1fr;
      }
      @media (min-width: 1000px) {
        .shell { grid-template-columns: 332px 568px; align-items: start; }
      }

      .rail { display: flex; flex-direction: column; gap: var(--s4); }
      .rail__cover { position: relative; width: 100%; }
      .rail__cover-skeleton { aspect-ratio: 1 / 1; width: 100%; }
      .rail__line { height: 24px; width: 70%; }
      .rail__manage { align-self: flex-start; }

      .presented { display: flex; align-items: center; gap: var(--s2); }
      .presented__lines { display: flex; flex-direction: column; min-width: 0; }
      .presented__overline {
        color: var(--event-ink-secondary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .presented__name {
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--event-ink);
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .follow {
        background: var(--event-panel);
        color: var(--event-ink);
        border-color: var(--event-hairline);
      }

      .content { display: flex; flex-direction: column; gap: var(--s5); }
      .content__head { display: flex; flex-direction: column; gap: var(--s3); align-items: flex-start; }
      .content__title-skeleton { height: 56px; width: 80%; }
      .content__line { height: 44px; width: 60%; }
      .content__panel-skeleton { height: 240px; border-radius: var(--r-card-lg); }

      .title {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 44px;
        line-height: 50px;
        color: var(--event-ink);
      }
      @media (max-width: 649px) {
        .title { font-size: 34px; line-height: 40px; }
      }

      .facts { display: flex; flex-direction: column; gap: var(--s4); }
      .fact { display: flex; gap: var(--s3); align-items: flex-start; }
      .fact__glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--r-menu);
        border: 1px solid var(--event-hairline);
        flex: none;
      }
      .fact__lines { display: flex; flex-direction: column; gap: 2px; }
      .fact__strong { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--event-ink); }
      .fact__weak { color: var(--event-ink-secondary); }

      .notice-block {
        border: 1px solid var(--danger);
        border-left-width: 4px;
        border-radius: var(--r-card);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        background: var(--event-panel);
        color: var(--event-ink);
      }

      .about { display: flex; flex-direction: column; gap: var(--s2); color: var(--event-ink); }
      .about__body { white-space: pre-wrap; }
      .address { color: var(--event-ink-secondary); }
      .address__value { font-family: var(--mono); word-break: break-all; }

      @media (max-width: 483px) {
        .shell { padding-bottom: 96px; }
      }
    `,
  ],
})
export class EventPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private themeService = inject(ThemeService);

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly following = signal(false);

  private loadedSlug = '';

  readonly mySeat = computed(() => {
    const reg = this.event()?.my_registration;
    return reg?.status === 'confirmed' || reg?.status === 'checked_in';
  });

  readonly gradientGround = computed(() => {
    const theme = this.event()?.theme ?? this.themeService.bootstrapTheme();
    if (!theme) return 'transparent';
    const key = theme.key;
    return [
      `radial-gradient(circle at 3% -50%, ${withAlpha(key, 0.22)} 0%, ${withAlpha(key, 0)} 60%)`,
      `radial-gradient(circle at 140% -50%, ${withAlpha(key, 0.18)} 0%, ${withAlpha(key, 0)} 55%)`,
      `radial-gradient(circle at -50% 120%, ${withAlpha(key, 0.16)} 0%, ${withAlpha(key, 0)} 55%)`,
      `radial-gradient(circle at 62% 100%, ${withAlpha(key, 0.2)} 0%, ${withAlpha(key, 0)} 60%)`,
    ].join(', ');
  });

  constructor() {
    // The server already painted the key colour; adopting it here changes no
    // pixel, so the page never repaints from grey.
    const boot = this.themeService.bootstrapTheme();
    if (boot) this.themeService.apply(boot);

    effect(() => {
      const slug = this.slug();
      if (!slug || slug === this.loadedSlug) return;
      this.loadedSlug = slug;
      this.load(slug);
    });
  }

  ngOnInit(): void {
    /* the effect above drives loading */
  }

  ngOnDestroy(): void {
    this.themeService.clear();
  }

  private load(slug: string): void {
    this.loading.set(true);
    this.missing.set(false);
    this.api.event(slug).subscribe({
      next: (e) => {
        this.event.set(e);
        this.themeService.apply(e.theme);
        this.loading.set(false);
        document.title = `${e.title} · Deku`;
      },
      error: () => {
        this.loading.set(false);
        this.missing.set(true);
        this.themeService.clear();
      },
    });
  }

  onRegistrationChanged(reg: MyRegistration | null): void {
    // The row moves to its new status in place rather than the page reloading.
    const current = this.event();
    if (!current) return;
    this.api.event(current.slug).subscribe({
      next: (fresh) => this.event.set(fresh),
      error: () => this.event.set({ ...current, my_registration: reg }),
    });
  }

  follow(): void {
    this.following.update((v) => !v);
  }

  dayText(e: EventDetail): string {
    return dayLine(e.starts_at, e.time_zone);
  }

  /** Times are shown in the event's own zone. */
  timeText(e: EventDetail): string {
    return `${timeRange(e.starts_at, e.ends_at, e.time_zone)} ${zoneAbbrev(e.starts_at, e.time_zone)}`;
  }

  /** The visitor's own zone is added underneath whenever the two differ. */
  showVisitorZone(e: EventDetail): boolean {
    return zonesDiffer(e.starts_at, e.time_zone);
  }

  visitorText(e: EventDetail): string {
    const own = visitorZone();
    return `${timeRange(e.starts_at, e.ends_at, own)} ${zoneAbbrev(e.starts_at, own)} your time`;
  }

  categoryText(e: EventDetail): string {
    return (e.category ?? '').replace(/-/g, ' ');
  }

  stateWord(e: EventDetail): string {
    return EVENT_STATE_WORDS[e.state];
  }

  stateTone(e: EventDetail): any {
    return EVENT_STATE_TONES[e.state];
  }

  fullAddress(e: EventDetail): string {
    return `${location.origin}/${e.slug}`;
  }
}

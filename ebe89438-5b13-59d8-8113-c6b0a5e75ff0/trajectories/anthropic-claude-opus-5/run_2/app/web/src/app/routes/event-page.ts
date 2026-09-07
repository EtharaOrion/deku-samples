import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import {
  EventDetail,
  MyRegistrationBrief,
  STATUS_TONES,
  STATUS_WORDS,
} from '../core/models';
import { ThemeService } from '../core/theme';
import {
  dateInZone,
  rangeInZone,
  timeInZone,
  visitorZone,
  zoneAbbreviation,
  zonesDiffer,
} from '../core/time';
import { PublicBarComponent } from '../shell/public-bar';
import { CoverComponent } from '../ui/cover';
import { IconComponent } from '../ui/icons';
import {
  AvatarComponent,
  PillComponent,
  SkeletonComponent,
} from '../ui/kit';

type PanelState =
  | 'register'
  | 'request'
  | 'received'
  | 'going'
  | 'waiting'
  | 'closed'
  | 'cancelled'
  | 'ended';

/**
 * The event page is the whole product: a poster, a date, a place, and one panel
 * that either registers you, says the host is deciding, gives you a
 * waiting-list place, or says registration is closed.
 */
@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    IconComponent,
    PillComponent,
    AvatarComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar></app-public-bar>

    <!-- four radial gradients faded in once over 2000ms, holding forwards -->
    <div class="theme-ground theme-fade" aria-hidden="true"></div>

    <main class="page themed-page" id="main">
      @if (loading()) {
        <div class="layout">
          <div class="rail">
            <app-skeleton height="332px" radius="11px"></app-skeleton>
            <app-skeleton height="24px" width="60%"></app-skeleton>
          </div>
          <div class="content">
            <app-skeleton height="42px" width="80%"></app-skeleton>
            <app-skeleton height="20px" width="50%"></app-skeleton>
            <app-skeleton height="180px" radius="12px"></app-skeleton>
          </div>
        </div>
      } @else if (event(); as e) {
        <div class="layout">
          <!-- left rail: the square cover tile with its glow, sheen and blur -->
          <div class="rail">
            <div class="cover-wrap">
              <div class="cover-blur" aria-hidden="true">
                <app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover>
              </div>
              <div class="cover-sat">
                <div class="cover-tile">
                  <app-cover [seed]="e.cover_seed" [title]="e.title"></app-cover>
                  <span class="glow" aria-hidden="true"></span>
                  <span class="sheen" aria-hidden="true"></span>
                </div>
              </div>
            </div>

            <div class="presented">
              <app-avatar [name]="e.calendar_name || 'Calendar'" [size]="24"></app-avatar>
              <span class="presented-copy">
                <span class="overline presented-by">Presented by</span>
                <a class="calendar-name" [routerLink]="'/' + e.calendar_slug">
                  {{ e.calendar_name }}
                  <app-icon name="chevron" [size]="14" hue="currentColor"></app-icon>
                </a>
              </span>
              <button type="button" class="follow btn btn-sm btn-pill" (click)="follow()">
                Follow
              </button>
            </div>

            @if (e.calendar_is_public === false) {
              <p class="private-note">
                <app-pill word="Private" tone="danger"></app-pill>
                <span>This calendar is unlisted.</span>
              </p>
            }
          </div>

          <!-- content column -->
          <div class="content">
            <h1 class="event-title display">{{ e.title }}</h1>

            <div class="when">
              <span class="date-tile" aria-hidden="true">
                <span class="dt-month">{{ monthOf(e) }}</span>
                <span class="dt-day">{{ dayOf(e) }}</span>
              </span>
              <span class="when-copy">
                <span class="when-main">{{ whenInEventZone(e) }}</span>
                <span class="when-zone">{{ eventZoneLabel(e) }}</span>
                @if (showVisitorZone(e)) {
                  <span class="when-yours">
                    Your time: {{ whenInVisitorZone(e) }} ({{ visitorZoneLabel(e) }})
                  </span>
                }
              </span>
            </div>

            <p class="where">
              <app-icon name="location" [size]="18" hue="currentColor"></app-icon>
              <span>{{ e.city }}</span>
            </p>

            @if (e.state === 'cancelled') {
              <!-- the page keeps its address and shows the notice, not the panel -->
              <section class="panel cancelled-notice" aria-labelledby="cancel-heading">
                <h2 id="cancel-heading" class="panel-title">This event has been cancelled</h2>
                <p class="panel-body">{{ e.cancel_reason }}</p>
              </section>
            } @else {
              <section class="panel" aria-labelledby="reg-heading">
                <h2 id="reg-heading" class="panel-title">{{ panelHeading() }}</h2>
                <p class="panel-body">{{ panelBody() }}</p>

                @if (myTicket()) {
                  <p class="ticket-line">
                    <span class="ticket-code code">{{ myTicket() }}</span>
                    <a class="btn btn-sm" [routerLink]="'/t/' + myTicket()">View Ticket</a>
                  </p>
                }

                @if (canRegister()) {
                  <button
                    type="button"
                    class="btn btn-primary panel-action"
                    (click)="register()"
                    [disabled]="working()"
                  >
                    {{ working() ? 'Working…' : actionLabel() }}
                  </button>
                }

                @if (mine(); as m) {
                  @if (m.status === 'confirmed' || m.status === 'waitlisted' || m.status === 'pending_approval') {
                    <button
                      type="button"
                      class="btn btn-sm leave"
                      (click)="cancelMine()"
                      [disabled]="working()"
                    >
                      {{ m.status === 'waitlisted' ? 'Leave Waiting List' : 'Cancel Registration' }}
                    </button>
                  }
                }

                <!-- Its answer to a submission is an assertive live region. -->
                <p class="answer" role="status" aria-live="assertive">{{ answer() }}</p>
              </section>
            }

            @if (e.description) {
              <section class="about longform" aria-labelledby="about-heading">
                <h2 id="about-heading">About this event</h2>
                <p>{{ e.description }}</p>
              </section>
            }

            @if (e.is_owner) {
              <p class="host-controls">
                <a class="btn btn-sm" [routerLink]="'/event/' + e.slug + '/manage/overview'"
                  >Manage this event</a
                >
              </p>
            }
          </div>
        </div>

        <!-- Below 484px the panel leaves the flow and sticks to the foot. -->
        @if (canRegister() && e.state !== 'cancelled') {
          <div class="foot-bar">
            <button
              type="button"
              class="btn btn-primary"
              (click)="register()"
              [disabled]="working()"
            >
              {{ working() ? 'Working…' : actionLabel() }}
            </button>
          </div>
        }
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--event-ground);
        color: var(--event-ink);
        min-height: 100vh;
      }

      /* four radial gradients whose stops are custom properties */
      .theme-ground {
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(circle at 3% -50%, var(--event-sunk), transparent 60%),
          radial-gradient(circle at 140% -50%, var(--event-panel), transparent 60%),
          radial-gradient(circle at -50% 120%, var(--event-sunk), transparent 60%),
          radial-gradient(circle at 62% 100%, var(--event-panel), transparent 60%);
        animation: event-theme-fade-in 2000ms linear forwards;
      }

      .page { padding: 96px 24px 120px; }

      .layout {
        display: flex;
        flex-direction: column;
        gap: 32px;
        max-width: 948px;
        margin: 0 auto;
      }

      .rail { width: 100%; }

      .cover-wrap { position: relative; }
      /* a blurred copy beneath the cover */
      .cover-blur {
        position: absolute;
        inset: 0;
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
        border-radius: var(--r-media);
        overflow: hidden;
        z-index: 0;
      }
      /* so the glow reads as coloured light rather than a grey halo */
      .cover-sat { filter: saturate(2); position: relative; z-index: 1; }
      .cover-tile {
        position: relative;
        border-radius: var(--r-media);
        overflow: hidden;
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
        animation: nudge 1000ms linear infinite;
      }
      .glow,
      .sheen {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(var(--event-key), var(--event-key));
      }
      .glow {
        -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.5;
      }
      .sheen {
        -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
        opacity: 0.25;
      }

      .presented {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 24px;
      }
      .presented-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .presented-by {
        font-size: 11px;
        line-height: 16px;
        color: var(--event-ink-secondary);
      }
      .calendar-name {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--event-ink);
      }
      .follow { flex: none; background: var(--event-panel); color: var(--event-ink); }
      .private-note {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        font-size: 13px;
        line-height: 16px;
        color: var(--event-ink-secondary);
      }

      .content { min-width: 0; }
      .event-title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.02em;
        color: var(--event-ink);
        margin-bottom: 24px;
      }

      .when { display: flex; gap: 12px; margin-bottom: 16px; }
      .date-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--r-nav);
        background: var(--event-panel);
        box-shadow: inset 0 0 0 1px var(--event-hairline);
        flex: none;
      }
      .dt-month {
        font-size: 11px;
        line-height: 14px;
        font-weight: 600;
        color: var(--event-ink-secondary);
      }
      .dt-day { font-size: 17px; line-height: 20px; font-weight: 600; }
      .when-copy { display: flex; flex-direction: column; }
      .when-main { font-size: 16px; line-height: 24px; font-weight: 500; }
      .when-zone, .when-yours {
        font-size: 13px;
        line-height: 18px;
        color: var(--event-ink-secondary);
      }

      .where {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        line-height: 24px;
        margin-bottom: 32px;
        color: var(--event-ink);
      }

      /* The registration panel is a bordered box and is the point of the screen. */
      .panel {
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        border-radius: var(--r-card-lg);
        padding: 24px;
        margin-bottom: 32px;
      }
      .panel-title {
        font-size: 22px;
        line-height: 26px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .panel-body {
        font-size: 16px;
        line-height: 25.6px;
        color: var(--event-ink);
        opacity: 0.75;
        margin-bottom: 16px;
      }
      .panel-action { width: 100%; }
      .leave { margin-top: 12px; background: transparent; box-shadow: none; }
      .ticket-line {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .ticket-code {
        font-size: 17px;
        line-height: 22px;
        font-weight: 600;
        padding: 6px 10px;
        background: var(--event-sunk);
        border-radius: var(--r-input);
      }
      .answer {
        font-size: 13px;
        line-height: 18px;
        margin-top: 12px;
        color: var(--event-ink);
      }
      .answer:empty { margin: 0; }
      .cancelled-notice { border-color: rgba(255, 59, 48, 0.4); }

      .about h2 { margin-bottom: 8px; }
      .about p { color: var(--event-ink); opacity: 0.8; white-space: pre-wrap; }
      .host-controls { margin-top: 32px; }

      .foot-bar { display: none; }

      /* Two columns at 1000px and above: 332px rail, 568px content, 48px gap. */
      @media (min-width: 1000px) {
        .layout {
          flex-direction: row;
          gap: 48px;
          align-items: flex-start;
        }
        .rail { width: 332px; flex: none; position: sticky; top: 96px; }
        .content { width: 568px; flex: none; }
      }

      @media (max-width: 483px) {
        .page { padding: 88px 16px 104px; }
        .event-title { font-size: 32px; line-height: 38px; }
        .panel { display: none; }
        .panel.cancelled-notice { display: block; }
        /* a 72px bar carrying the one primary action */
        .foot-bar {
          display: flex;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 72px;
          align-items: center;
          padding: 0 16px;
          background: var(--event-ground);
          border-top: 1px solid var(--event-hairline);
          z-index: var(--z-bar);
        }
        .foot-bar .btn { width: 100%; }
      }
    `,
  ],
})
export class EventPageComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private themes = inject(ThemeService);

  readonly slug = input.required<string>();

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly answer = signal('');

  private controller = new AbortController();
  private loadedSlug: string | null = null;

  readonly mine = computed<MyRegistrationBrief | null>(
    () => this.event()?.my_registration ?? null,
  );

  readonly myTicket = computed(() => {
    const m = this.mine();
    return m && (m.status === 'confirmed' || m.status === 'checked_in')
      ? m.ticket_code
      : null;
  });

  constructor() {
    // The palette the server already wrote into the document is used as is.
    const preloaded = this.themes.preloaded;
    if (preloaded) this.themes.apply(preloaded);
  }

  ngOnInit() {
    this.load();
  }

  private load() {
    const slug = this.slug();
    if (this.loadedSlug === slug) return;
    this.loadedSlug = slug;
    this.loading.set(true);
    this.api
      .getEvent(slug, this.controller.signal)
      .then((detail) => {
        this.event.set(detail);
        this.themes.applyFromHex(detail.theme_hex);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.loading.set(false);
        // A draft or a missing slug meet the same not-found page.
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  /** Exactly one of six states. */
  readonly panelState = computed<PanelState>(() => {
    const e = this.event();
    if (!e) return 'register';
    if (e.state === 'cancelled') return 'cancelled';
    const m = this.mine();
    if (m) {
      if (m.status === 'confirmed' || m.status === 'checked_in') return 'going';
      if (m.status === 'waitlisted') return 'waiting';
      if (m.status === 'pending_approval') return 'received';
    }
    if (e.state === 'registration_closed') return 'closed';
    if (e.has_ended) return 'ended';
    if (e.approval_required) return 'request';
    return 'register';
  });

  readonly panelHeading = computed(() => {
    switch (this.panelState()) {
      case 'going':
        return "You're going";
      case 'waiting':
        return `You are number ${this.mine()?.waitlist_position} on the waiting list`;
      case 'received':
        return 'Request received';
      case 'request':
        return 'Request to join';
      case 'closed':
        return 'Registration Is Closed';
      case 'ended':
        return 'This event has ended';
      case 'cancelled':
        return 'This event has been cancelled';
      default:
        return 'Register';
    }
  });

  readonly panelBody = computed(() => {
    const e = this.event();
    switch (this.panelState()) {
      case 'going':
        return 'Your seat is held. Bring the ticket code below to the door.';
      case 'waiting':
        return 'If a seat is freed you will be confirmed automatically and sent a ticket.';
      case 'received':
        return 'The host reviews every request. We will write to you once they have decided.';
      case 'request':
        return 'The host approves each guest before a seat is held.';
      case 'closed':
        return 'The host has stopped taking registrations for this event.';
      case 'ended':
        return 'This one is over. There are others coming up.';
      default:
        return e && e.remaining !== null && e.remaining > 0
          ? `${e.remaining} of ${e.capacity} ${e.remaining === 1 ? 'seat is' : 'seats are'} still free.`
          : 'This event is full, so a registration takes a waiting-list place.';
    }
  });

  readonly actionLabel = computed(() => {
    const e = this.event();
    if (this.panelState() === 'request') return 'Request to Join';
    if (e && e.remaining === 0 && e.waitlist_enabled) return 'Join the Waiting List';
    return 'Register';
  });

  readonly canRegister = computed(() => {
    const state = this.panelState();
    return state === 'register' || state === 'request';
  });

  async register() {
    const e = this.event();
    if (!e) return;
    if (!this.api.isSignedIn) {
      this.router.navigate(['/login'], { queryParams: { next: `/${e.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    try {
      const reg = await this.api.register(e.slug);
      this.event.update((cur) =>
        cur
          ? {
              ...cur,
              my_registration: {
                id: reg.id,
                status: reg.status,
                waitlist_position: reg.waitlist_position,
                ticket_code: reg.ticket_code,
              },
            }
          : cur,
      );
      if (reg.status === 'confirmed') {
        this.answer.set(
          `You have a seat. Your ticket code is ${reg.ticket_code}, and a confirmation is on its way to your inbox.`,
        );
      } else if (reg.status === 'waitlisted') {
        this.answer.set(
          `This event just filled up. You are on the waiting list at position ${reg.waitlist_position}.`,
        );
      } else if (reg.status === 'pending_approval') {
        this.answer.set('Your request has reached the host, who will decide shortly.');
      }
      // the seat count is read back from the server, never assumed
      await this.reload();
    } catch (err) {
      this.answer.set(
        err instanceof ApiError
          ? err.message
          : 'That did not go through. Try again in a moment.',
      );
    } finally {
      this.working.set(false);
    }
  }

  async cancelMine() {
    const m = this.mine();
    if (!m) return;
    this.working.set(true);
    try {
      await this.api.cancelRegistration(m.id);
      this.answer.set('Your registration has been cancelled and the seat is free again.');
      await this.reload();
    } catch (err) {
      this.answer.set(
        err instanceof ApiError ? err.message : 'That did not go through.',
      );
    } finally {
      this.working.set(false);
    }
  }

  private async reload() {
    const fresh = await this.api.getEvent(this.slug());
    this.event.set(fresh);
  }

  follow() {
    this.answer.set('Following a calendar is not part of this build.');
  }

  /* ------------------------------------------------------------ formatting */

  whenInEventZone(e: EventDetail) {
    return rangeInZone(e.starts_at, e.ends_at, e.time_zone);
  }

  eventZoneLabel(e: EventDetail) {
    return `${e.time_zone} (${zoneAbbreviation(e.starts_at, e.time_zone)})`;
  }

  showVisitorZone(e: EventDetail) {
    return zonesDiffer(e.starts_at, e.time_zone);
  }

  whenInVisitorZone(e: EventDetail) {
    return rangeInZone(e.starts_at, e.ends_at, visitorZone());
  }

  visitorZoneLabel(e: EventDetail) {
    return zoneAbbreviation(e.starts_at, visitorZone());
  }

  monthOf(e: EventDetail) {
    return e.starts_at
      ? new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: e.time_zone })
          .format(new Date(e.starts_at))
          .toUpperCase()
      : '—';
  }

  dayOf(e: EventDetail) {
    return e.starts_at
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: e.time_zone }).format(
          new Date(e.starts_at),
        )
      : '–';
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

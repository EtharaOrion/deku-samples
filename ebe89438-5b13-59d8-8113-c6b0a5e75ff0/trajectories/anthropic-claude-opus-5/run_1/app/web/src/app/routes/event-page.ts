import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notices } from '../core/notices';
import { ThemeLayer } from '../core/theme';
import { longDate, timeOfDay, visitorLine, whenLine, monthLabel, dayNumber } from '../core/timefmt';
import type { EventDetail, Refusal } from '../core/models';
import { PublicBar } from '../ui/chrome';
import { CoverArt } from '../ui/cover-art';
import { Avatar, Icon } from '../ui/icons';
import { StatusPill } from '../ui/shared';

type PanelState =
  | 'register'
  | 'request'
  | 'requested'
  | 'going'
  | 'waiting'
  | 'closed'
  | 'cancelled'
  | 'ended';

/**
 * The event page is the whole product: a poster, a date, a place, and one panel.
 * It arrives already wearing its key colour, injected into the first document.
 */
@Component({
  selector: 'app-event-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBar, CoverArt, Avatar, Icon, StatusPill],
  template: `
    <app-public-bar />
    <div class="themed-ground" aria-hidden="true"></div>
    <main id="main" class="event-wrap">
      @if (loading()) {
        <div class="cols">
          <div class="rail">
            <div class="sk sk-cover"></div>
            <div class="sk sk-text" style="width: 60%; margin-top: 16px"></div>
          </div>
          <div class="content">
            <div class="sk sk-title" style="width: 80%; height: 44px"></div>
            <div class="sk sk-text" style="width: 50%"></div>
            <div class="sk sk-card" style="height: 200px; margin-top: 24px"></div>
          </div>
        </div>
      } @else if (event(); as e) {
        <div class="cols">
          <aside class="rail">
            <div class="cover-stack">
              <span class="cover-under" aria-hidden="true">
                <app-cover [seed]="e.cover_seed" [title]="e.title" [showTitle]="false" radius="var(--r-media)" />
              </span>
              <span class="cover-top cover-nudge">
                <app-cover [seed]="e.cover_seed" [title]="e.title" [glow]="true" radius="var(--r-media)" />
              </span>
            </div>

            <div class="presented">
              <app-avatar [name]="e.calendar.name" [size]="24" />
              <span class="presented-text">
                <span class="t-badge overline">Presented by</span>
                <a class="presented-name" [routerLink]="['/', e.calendar.slug]">
                  {{ e.calendar.name }}<app-icon name="chevron-right" [size]="16" />
                </a>
              </span>
              <a class="btn btn-sm btn-pill follow" [routerLink]="['/', e.calendar.slug]">Follow</a>
            </div>

            @if (!e.calendar.is_public) {
              <p class="private t-caption"><span class="pill pill-pink">Private Calendar</span></p>
            }
          </aside>

          <div class="content">
            <h1 class="event-title t-serif">{{ e.title }}</h1>

            <div class="when">
              <span class="date-tile" aria-hidden="true">
                <span class="t-month">{{ month() }}</span>
                <span class="date-day">{{ day() }}</span>
              </span>
              <span class="when-text">
                <span class="when-line t-body">{{ whenText() }}</span>
                @if (visitorText(); as v) {
                  <span class="when-visitor t-caption">{{ v }}</span>
                }
              </span>
            </div>

            <p class="where t-body">
              <app-icon name="pin" [size]="18" />
              <span>{{ e.city }}</span>
            </p>

            @if (e.state === 'cancelled') {
              <!-- the page keeps its address and shows the notice, not the panel -->
              <section class="panel-box cancelled-box" aria-labelledby="cancel-h">
                <h2 id="cancel-h" class="panel-title">This event has been cancelled</h2>
                <p class="t-prose">{{ e.cancel_reason }}</p>
                <a class="btn btn-block" routerLink="/discover">Discover Events</a>
              </section>
            } @else {
              <section class="panel-box" aria-labelledby="panel-h">
                <h2 id="panel-h" class="panel-title">{{ panelTitle() }}</h2>
                <p class="panel-body t-prose">{{ panelBody() }}</p>

                @if (mine(); as m) {
                  <p class="panel-status"><app-status-pill [status]="m.status" /></p>
                }

                @if (panel() === 'going' && mine()?.ticket_code) {
                  <p class="ticket-code">{{ mine()!.ticket_code }}</p>
                  <a class="btn btn-block" [routerLink]="['/t', mine()!.ticket_code]">View Ticket</a>
                } @else if (panel() === 'waiting') {
                  <p class="waiting-pos">You are number {{ mine()!.waitlist_position }} on the waiting list.</p>
                } @else if (panel() === 'register' || panel() === 'request') {
                  <button
                    type="button"
                    class="btn btn-primary btn-block panel-action"
                    (click)="register()"
                    [disabled]="busy()"
                  >
                    @if (busy()) {
                      <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" fill="none" stroke-width="6" /></svg>
                    }
                    {{ panel() === 'request' ? 'Request To Join' : 'Register' }}
                  </button>
                  <p class="seats t-caption">{{ seatLine() }}</p>
                }

                <!-- the panel's answer to a submission is assertive -->
                <p class="answer t-caption" role="alert" aria-live="assertive">{{ answer() }}</p>
              </section>
            }

            @if (e.description) {
              <section class="about" aria-labelledby="about-h">
                <h2 id="about-h" class="t-section">About this event</h2>
                <p class="t-prose">{{ e.description }}</p>
              </section>
            }

            @if (e.is_owner) {
              <p class="host-links">
                <a class="btn btn-sm" [routerLink]="['/event', e.slug, 'manage', 'overview']">Manage This Event</a>
                <a class="btn btn-sm" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guest List</a>
              </p>
            }
          </div>
        </div>

        @if (e.state !== 'cancelled') {
          <!-- below 484px the panel leaves the flow and sticks to the foot -->
          <div class="footbar" role="group" aria-label="Registration">
            @if (panel() === 'going') {
              <a class="btn btn-primary btn-block" [routerLink]="['/t', mine()!.ticket_code]">View Ticket</a>
            } @else if (panel() === 'register' || panel() === 'request') {
              <button type="button" class="btn btn-primary btn-block" (click)="register()" [disabled]="busy()">
                {{ panel() === 'request' ? 'Request To Join' : 'Register' }}
              </button>
            } @else {
              <span class="footbar-word t-body">{{ panelTitle() }}</span>
            }
          </div>
        }
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
      }
      /* four radial gradients faded in once over 2000ms, holding forwards */
      .themed-ground {
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(circle at 3% -50%, var(--event-key), transparent 45%),
          radial-gradient(circle at 140% -50%, var(--event-key), transparent 45%),
          radial-gradient(circle at -50% 120%, var(--event-key), transparent 45%),
          radial-gradient(circle at 62% 100%, var(--event-key), transparent 45%);
        opacity: 0.14;
        animation: event-theme-fade-in 2000ms linear forwards;
      }
      .event-wrap {
        padding: calc(64px + var(--s7)) var(--s5) var(--s8);
      }
      .cols {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
        max-width: 948px;
        margin: 0 auto;
      }
      @media (min-width: 1000px) {
        .cols {
          grid-template-columns: 332px 568px;
          gap: 48px;
          justify-content: center;
        }
      }
      .rail {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      .cover-stack {
        position: relative;
      }
      /* a blurred copy beneath the cover, blended multiply at 0.2 */
      .cover-under {
        position: absolute;
        inset: 0;
        display: block;
        filter: brightness(0.8) blur(24px) saturate(1.2);
        mix-blend-mode: multiply;
        opacity: 0.2;
      }
      .cover-top {
        position: relative;
        display: block;
        transform: matrix(1.005, 0, 0, 1.005, 0, 0);
      }
      .cover-nudge {
        animation: nudge 1000ms linear infinite;
      }
      .presented {
        display: flex;
        align-items: center;
        gap: var(--s2);
      }
      .presented-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .overline {
        color: var(--event-ink-secondary);
      }
      .presented-name {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--event-ink);
      }
      .follow {
        background: var(--event-panel);
        color: var(--event-ink);
        border-color: var(--event-hairline);
      }
      .private {
        margin-top: var(--s1);
      }
      .event-title {
        font-size: 44px;
        line-height: 52px;
        letter-spacing: -0.02em;
        color: var(--event-ink);
        margin-bottom: var(--s5);
      }
      @media (max-width: 649px) {
        .event-title {
          font-size: 32px;
          line-height: 40px;
        }
      }
      .when {
        display: flex;
        align-items: center;
        gap: var(--s3);
        margin-bottom: var(--s3);
      }
      .date-tile {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--r-menu);
        background: var(--event-panel);
        border: 1px solid var(--event-hairline);
        flex: 0 0 auto;
      }
      .date-tile .t-month {
        color: var(--event-ink-secondary);
      }
      .date-day {
        font-size: 18px;
        line-height: 20px;
        font-weight: 600;
      }
      .when-text {
        display: flex;
        flex-direction: column;
      }
      .when-visitor {
        color: var(--event-ink-secondary);
      }
      .where {
        display: flex;
        align-items: center;
        gap: var(--s2);
        color: var(--event-ink);
        margin-bottom: var(--s5);
      }
      .panel-box {
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .panel-title {
        font-size: 17px;
        line-height: 22px;
        font-weight: 600;
      }
      .panel-body {
        color: var(--event-ink-secondary);
      }
      .panel-action {
        margin-top: var(--s2);
      }
      .ticket-code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.04em;
        padding: var(--s3);
        background: var(--event-sunk);
        border-radius: var(--r-input);
        text-align: center;
      }
      .waiting-pos {
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
      }
      .seats {
        color: var(--event-ink-secondary);
        text-align: center;
      }
      .answer:empty {
        display: none;
      }
      .answer {
        color: var(--event-ink);
        font-weight: 500;
      }
      .cancelled-box {
        border-left: 4px solid var(--danger);
      }
      .about {
        margin-top: var(--s6);
      }
      .about h2 {
        margin-bottom: var(--s2);
        color: var(--event-ink-secondary);
      }
      .about p {
        color: var(--event-ink);
      }
      .host-links {
        display: flex;
        gap: var(--s2);
        margin-top: var(--s6);
        flex-wrap: wrap;
      }
      .footbar {
        display: none;
      }
      @media (max-width: 483px) {
        .panel-box {
          margin-bottom: 80px;
        }
        .footbar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 72px;
          display: flex;
          align-items: center;
          padding: 0 var(--s4);
          background: var(--event-ground);
          border-top: 1px solid var(--event-hairline);
          z-index: 4;
        }
        .footbar-word {
          width: 100%;
          text-align: center;
          font-weight: 600;
        }
      }
    `,
  ],
})
export class EventPageRoute {
  readonly slug = input.required<string>();

  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);
  private notices = inject(Notices);
  private themeLayer = inject(ThemeLayer);

  readonly loading = signal(true);
  readonly event = signal<EventDetail | null>(null);
  readonly busy = signal(false);
  readonly answer = signal('');

  readonly mine = computed(() => this.event()?.my_registration ?? null);

  readonly month = computed(() => monthLabel(this.event()?.starts_at ?? null, this.event()?.time_zone ?? 'UTC'));
  readonly day = computed(() => dayNumber(this.event()?.starts_at ?? null, this.event()?.time_zone ?? 'UTC'));

  readonly whenText = computed(() => {
    const e = this.event();
    return e ? whenLine(e.starts_at, e.ends_at, e.time_zone) : '';
  });

  readonly visitorText = computed(() => {
    const e = this.event();
    return e ? visitorLine(e.starts_at, e.time_zone) : null;
  });

  /** Exactly one of six states. */
  readonly panel = computed<PanelState>(() => {
    const e = this.event();
    if (!e) return 'register';
    if (e.state === 'cancelled') return 'cancelled';
    const m = e.my_registration;
    if (m) {
      if (m.status === 'confirmed' || m.status === 'checked_in') return 'going';
      if (m.status === 'waitlisted') return 'waiting';
      if (m.status === 'pending_approval') return 'requested';
    }
    if (e.state === 'registration_closed') return 'closed';
    if (e.has_ended) return 'ended';
    return e.approval_required ? 'request' : 'register';
  });

  readonly panelTitle = computed(() => {
    switch (this.panel()) {
      case 'going':
        return this.mine()?.status === 'checked_in' ? 'You Are Checked In' : 'You Are Going';
      case 'waiting':
        return 'You Are On The Waiting List';
      case 'requested':
        return 'Request Received';
      case 'request':
        return 'Request To Join';
      case 'closed':
        return 'Registration Is Closed';
      case 'ended':
        return 'This Event Has Ended';
      default:
        return 'Register';
    }
  });

  readonly panelBody = computed(() => {
    const e = this.event();
    switch (this.panel()) {
      case 'going':
        return 'Your seat is held. Show the ticket code at the door.';
      case 'waiting':
        return 'If a seat opens up we will write to you and move you across at once.';
      case 'requested':
        return 'The host is deciding. We will write as soon as there is an answer.';
      case 'request':
        return 'The host reads every request before the day. Ask for a place and you will hear back.';
      case 'closed':
        return 'The host has stopped taking registrations for this event.';
      case 'ended':
        return 'This one is behind us. There are others coming up.';
      default:
        return e?.remaining === 0
          ? 'This event is full, so registering puts you on the waiting list.'
          : 'Take a seat at this one. Registration is free and takes a moment.';
    }
  });

  readonly seatLine = computed(() => {
    const e = this.event();
    if (!e || e.remaining === null) return '';
    if (e.remaining === 0) return 'No seats left — the waiting list is open.';
    return e.remaining === 1
      ? '1 seat left of ' + e.capacity
      : `${e.remaining} seats left of ${e.capacity}`;
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load() {
    this.loading.set(true);
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        this.themeLayer.apply(e.theme_hex);
        this.event.set(e);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      },
    });
  }

  register() {
    if (!this.auth.signedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${this.slug()}` } });
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    this.answer.set('');
    this.api.register(this.slug()).subscribe({
      next: (reg) => {
        this.busy.set(false);
        const e = this.event();
        if (e) this.event.set({ ...e, my_registration: reg });
        if (reg.status === 'confirmed') {
          this.answer.set(`You have a seat. Your ticket code is ${reg.ticket_code}.`);
        } else if (reg.status === 'waitlisted') {
          this.answer.set(
            `This event just filled up. You are on the waiting list at number ${reg.waitlist_position}.`
          );
        } else if (reg.status === 'pending_approval') {
          this.answer.set('Your request has reached the host.');
        }
        this.load();
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        this.answer.set(e.message);
        this.notices.refuse(e.message);
      },
    });
  }
}

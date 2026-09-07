import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, ApiError } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import type { EventDetail } from '../core/models';
import { formatRange, shortDate, visitorZone, zonesDiffer } from '../core/format';
import { applyTheme, bootTheme, clearTheme, deriveTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CoverComponent } from '../ui/cover.component';
import { AvatarComponent, IconComponent, SpinnerComponent } from '../ui/icons.component';
import { NotFoundComponent } from './not-found.component';

type PanelState = 'register' | 'request' | 'received' | 'going' | 'waiting' | 'closed' | 'cancelled' | 'ended';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, CoverComponent, AvatarComponent, IconComponent, SpinnerComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <!-- Four radial grounds fade in once over 2000ms and hold forwards. -->
      <div class="ground theme-fade" aria-hidden="true"></div>
      <div class="public-shell">
        <main id="main" class="layout">
          <div class="rail">
            @if (loading()) {
              <div class="skeleton skeleton-media" style="aspect-ratio:1/1"></div>
              <div class="skeleton" style="height: 44px; margin-top: 24px"></div>
            } @else if (event(); as ev) {
              <app-cover [seed]="ev.cover_seed || ev.slug" [title]="ev.title" radius="11px" [nudge]="true" />
              <div class="presented">
                <app-avatar [name]="ev.calendar_name ?? 'Calendar'" [size]="24" />
                <span class="who">
                  <span class="overline t-badge">Presented by</span>
                  <a class="cal-name" [routerLink]="['/', ev.calendar_slug]">
                    {{ ev.calendar_name }}
                    <app-icon name="chevron" [size]="14" />
                  </a>
                </span>
                <button type="button" class="btn btn-sm btn-pill follow" (click)="follow()">Follow</button>
              </div>
              @if (!ev.calendar_is_public) {
                <p class="private pill pill-private">Private Calendar</p>
              }
            }
          </div>

          <div class="content">
            @if (loading()) {
              <div class="skeleton" style="height: 52px; width: 80%"></div>
              <div class="skeleton" style="height: 24px; width: 50%; margin-top: 16px"></div>
              <div class="skeleton" style="height: 220px; margin-top: 32px; border-radius: 24px"></div>
            } @else if (event(); as ev) {
              <h1 class="title serif">{{ ev.title }}</h1>

              <div class="when">
                <span class="date-tile" aria-hidden="true">
                  <span class="m">{{ date().month }}</span>
                  <span class="d">{{ date().day }}</span>
                </span>
                <span class="when-copy">
                  <span class="t-row">{{ inEventZone() }}</span>
                  <span class="t-caption zone">{{ ev.time_zone }}</span>
                  @if (showVisitorZone()) {
                    <span class="t-caption zone">{{ inVisitorZone() }} · your time ({{ visitorZoneName }})</span>
                  }
                </span>
              </div>

              <p class="where t-row">
                <app-icon name="compass" [size]="18" />
                {{ ev.city }}
              </p>

              @if (ev.state === 'cancelled') {
                <section class="notice-panel" role="status">
                  <h2 class="t-section-heading">This event has been cancelled</h2>
                  <p class="t-longform reason">{{ ev.cancel_reason }}</p>
                </section>
              } @else {
                <section class="reg-panel" [class.foot-bar]="false" aria-labelledby="reg-heading">
                  <div class="reg-inner">
                    <h2 id="reg-heading" class="t-section-heading">{{ panelHeading() }}</h2>
                    <p class="t-longform panel-copy">{{ panelCopy() }}</p>

                    @if (myTicket()) {
                      <p class="ticket-code">{{ myTicket() }}</p>
                      <a class="btn btn-sm" [routerLink]="['/t', myTicket()]">View Ticket</a>
                    }

                    @if (canRegister()) {
                      <button type="button" class="btn btn-primary btn-block reg-action" (click)="register()" [disabled]="working()">
                        @if (working()) {
                          <app-spinner [size]="18" />
                        }
                        {{ panelAction() }}
                      </button>
                    }

                    <p class="seats t-caption">{{ seatLine() }}</p>
                    <!-- The panel's own answer is assertive. -->
                    <p class="answer t-caption" role="alert" aria-live="assertive">{{ answer() }}</p>
                  </div>
                </section>
              }

              @if (ev.description) {
                <section class="about">
                  <h2 class="t-section-heading">About this event</h2>
                  <p class="t-longform">{{ ev.description }}</p>
                </section>
              }

              @if (ev.is_owner) {
                <section class="host-controls">
                  <h2 class="t-section-heading">You host this event</h2>
                  <div class="host-links">
                    <a class="btn btn-sm" [routerLink]="['/event', ev.slug, 'manage', 'overview']">Dashboard</a>
                    <a class="btn btn-sm" [routerLink]="['/event', ev.slug, 'manage', 'guests']">Guests</a>
                    <a class="btn btn-sm" [routerLink]="['/event', ev.slug, 'manage', 'registration']">Registration</a>
                  </div>
                </section>
              }
            }
          </div>
        </main>
      </div>

      @if (!loading() && event() && event()!.state !== 'cancelled') {
        <div class="phone-bar" role="region" aria-label="Registration">
          <span class="t-caption">{{ panelHeading() }}</span>
          @if (canRegister()) {
            <button type="button" class="btn btn-primary btn-sm" (click)="register()" [disabled]="working()">{{ panelAction() }}</button>
          } @else if (myTicket()) {
            <a class="btn btn-sm" [routerLink]="['/t', myTicket()]">View Ticket</a>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        color: var(--event-ink);
      }
      .ground {
        position: fixed;
        inset: 0;
        z-index: -1;
        background-color: var(--event-ground);
        background-image: radial-gradient(circle at 3% -50%, var(--event-key), transparent 55%),
          radial-gradient(circle at 140% -50%, var(--event-key), transparent 55%),
          radial-gradient(circle at -50% 120%, var(--event-key), transparent 55%),
          radial-gradient(circle at 62% 100%, var(--event-key), transparent 55%);
        opacity: 0.14;
        animation: event-theme-fade-in 2000ms linear forwards;
      }
      .layout {
        max-width: 948px;
        margin: 0 auto;
        padding: var(--s7) var(--s5) 120px;
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
      }
      @media (min-width: 1000px) {
        .layout {
          grid-template-columns: 332px 568px;
          gap: 48px;
          justify-content: center;
          align-items: start;
        }
      }
      .presented {
        display: flex;
        align-items: center;
        gap: var(--s3);
        margin-top: var(--s4);
      }
      .who {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .overline {
        color: var(--event-ink-secondary);
      }
      .cal-name {
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .follow {
        margin-left: auto;
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        color: var(--event-ink);
      }
      .private {
        margin-top: var(--s3);
      }
      .title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.02em;
        color: var(--event-ink);
      }
      @media (max-width: 649px) {
        .title {
          font-size: 32px;
          line-height: 40px;
        }
      }
      .when {
        display: flex;
        gap: var(--s3);
        align-items: flex-start;
        margin-top: var(--s5);
      }
      .date-tile {
        width: 48px;
        flex: none;
        border-radius: var(--r-menu);
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--s1) 0;
      }
      .date-tile .m {
        font-size: 11px;
        line-height: 14px;
        font-weight: 600;
        color: var(--event-key);
      }
      .date-tile .d {
        font-size: 18px;
        line-height: 22px;
        font-weight: 600;
      }
      .when-copy {
        display: flex;
        flex-direction: column;
      }
      .zone {
        color: var(--event-ink-secondary);
      }
      .where {
        display: flex;
        align-items: center;
        gap: var(--s2);
        margin-top: var(--s3);
      }
      .reg-panel,
      .notice-panel {
        margin-top: var(--s6);
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
      }
      .panel-copy {
        color: var(--event-ink-secondary);
        margin-top: var(--s2);
      }
      .reg-action {
        margin-top: var(--s4);
      }
      .ticket-code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        margin: var(--s3) 0;
        letter-spacing: 0.04em;
      }
      .seats {
        margin-top: var(--s3);
        color: var(--event-ink-secondary);
      }
      .answer:empty {
        display: none;
      }
      .answer {
        margin-top: var(--s2);
        font-weight: 600;
      }
      .reason {
        margin-top: var(--s2);
      }
      .about,
      .host-controls {
        margin-top: var(--s6);
      }
      .about p {
        margin-top: var(--s2);
        color: var(--event-ink-secondary);
      }
      .host-links {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
        margin-top: var(--s3);
      }
      .host-links .btn {
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        color: var(--event-ink);
      }
      .phone-bar {
        display: none;
      }
      @media (max-width: 483px) {
        .reg-panel {
          display: none;
        }
        .phone-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--s3);
          padding: 0 var(--s4);
          background: var(--event-ground);
          border-top: 1px solid var(--event-hairline);
          z-index: 4;
        }
      }
    `,
  ],
})
export class EventPageComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  readonly slug = input.required<string>();
  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly working = signal(false);
  readonly answer = signal('');
  readonly visitorZoneName = visitorZone();

  private lastSlug = '';

  constructor() {
    // The page arrives already wearing the palette the server injected.
    applyTheme(bootTheme());
    effect(() => {
      const s = this.slug();
      if (s && s !== this.lastSlug) {
        this.lastSlug = s;
        void this.load(s);
      }
    });
  }

  ngOnInit(): void {
    applyTheme(bootTheme());
  }

  ngOnDestroy(): void {
    clearTheme();
  }

  private async load(slug: string) {
    this.loading.set(true);
    this.missing.set(false);
    try {
      const ev = await this.api.getEvent(slug);
      this.event.set(ev);
      applyTheme(ev.theme ?? deriveTheme(ev.theme_hex));
      if (ev.theme?.degraded) {
        this.notices.show('This cover is too pale to theme from, so the page keeps the default paper and ink.', 'info');
      }
    } catch (e) {
      if ((e as ApiError).status === 404) this.missing.set(true);
      else this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  readonly date = computed(() => {
    const ev = this.event();
    return ev ? shortDate(ev.starts_at, ev.time_zone) : { month: '', day: '' };
  });

  readonly inEventZone = computed(() => {
    const ev = this.event();
    return ev ? formatRange(ev.starts_at, ev.ends_at, ev.time_zone) : '';
  });

  readonly inVisitorZone = computed(() => {
    const ev = this.event();
    return ev ? formatRange(ev.starts_at, ev.ends_at, this.visitorZoneName) : '';
  });

  readonly showVisitorZone = computed(() => {
    const ev = this.event();
    return !!ev && zonesDiffer(ev.starts_at, ev.time_zone, this.visitorZoneName);
  });

  readonly myTicket = computed(() => this.event()?.my_registration?.ticket_code ?? null);

  readonly panelState = computed<PanelState>(() => {
    const ev = this.event();
    if (!ev) return 'register';
    if (ev.state === 'cancelled') return 'cancelled';
    if (ev.state === 'registration_closed') return 'closed';
    const mine = ev.my_registration;
    if (mine) {
      if (mine.status === 'confirmed' || mine.status === 'checked_in') return 'going';
      if (mine.status === 'waitlisted') return 'waiting';
      if (mine.status === 'pending_approval') return 'received';
    }
    if (ev.has_ended) return 'ended';
    return ev.approval_required ? 'request' : 'register';
  });

  readonly panelHeading = computed(() => {
    switch (this.panelState()) {
      case 'going':
        return 'You’re Going';
      case 'waiting':
        return `You’re Number ${this.event()?.my_registration?.waitlist_position} on the Waiting List`;
      case 'received':
        return 'Request Received';
      case 'request':
        return 'Request to Join';
      case 'closed':
        return 'Registration Is Closed';
      case 'cancelled':
        return 'This Event Was Cancelled';
      case 'ended':
        return 'This Event Has Finished';
      default:
        return 'Register';
    }
  });

  readonly panelCopy = computed(() => {
    const ev = this.event();
    switch (this.panelState()) {
      case 'going':
        return 'Your seat is held. Bring the ticket code below to the door.';
      case 'waiting':
        return 'If a seat frees up, the head of this list is confirmed at once and we write to you.';
      case 'received':
        return 'The host is deciding. You will hear back by email either way.';
      case 'request':
        return 'This host approves each guest, so your request holds no seat until they say yes.';
      case 'closed':
        return 'The host has stopped taking registrations for this event.';
      case 'cancelled':
        return ev?.cancel_reason ?? 'The host called this event off.';
      case 'ended':
        return 'This gathering has already happened.';
      default:
        return 'One click holds a seat and issues your ticket. No price, no payment.';
    }
  });

  readonly panelAction = computed(() => {
    const ev = this.event();
    if (!ev) return 'Register';
    if (this.panelState() === 'request') return 'Request to Join';
    if (ev.remaining === 0 && ev.waitlist_enabled) return 'Join the Waiting List';
    return 'Register';
  });

  readonly canRegister = computed(() => {
    const s = this.panelState();
    return s === 'register' || s === 'request';
  });

  readonly seatLine = computed(() => {
    const ev = this.event();
    if (!ev || ev.capacity === null) return '';
    if (ev.remaining === 0) return `Full · ${ev.confirmed_count} of ${ev.capacity} seats taken`;
    return `${ev.remaining} of ${ev.capacity} seats left`;
  });

  follow() {
    this.notices.show('Following a calendar is not part of this build; open it to see everything it holds.', 'info');
  }

  async register() {
    const ev = this.event();
    if (!ev || this.working()) return;
    if (!this.api.account()) {
      void this.router.navigate(['/login'], { queryParams: { next: `/${ev.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    try {
      const reg = await this.api.register(ev.slug);
      const fresh = await this.api.getEvent(ev.slug);
      this.event.set(fresh);
      if (reg.status === 'confirmed') {
        this.answer.set(`You have a seat. Your ticket code is ${reg.ticket_code}.`);
        this.notices.show('You’re going. A confirmation is on its way to your inbox.', 'success');
      } else if (reg.status === 'waitlisted') {
        this.answer.set(`This event just filled up. You are on the waiting list at number ${reg.waitlist_position}.`);
        this.notices.show('This event just filled up. You are on the waiting list.', 'warning');
      } else if (reg.status === 'pending_approval') {
        this.answer.set('Your request has been sent to the host.');
        this.notices.show('Your request is with the host. You will hear back by email.', 'info');
      }
    } catch (e) {
      const err = e as ApiError;
      this.answer.set(err.message);
      this.notices.show(err.message, 'danger');
    } finally {
      this.working.set(false);
    }
  }
}

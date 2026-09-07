import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { EventDetail, Registration } from '../core/models';
import { SessionService } from '../core/session.service';
import { ThemeService } from '../core/theme.service';
import { formatRange, visitorZone, zoneAbbrev, zonesDiffer } from '../core/time';
import { AvatarComponent } from '../ui/avatar.component';
import { CoverComponent } from '../ui/cover.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { TopBarComponent } from '../ui/top-bar.component';
import { NotFoundComponent } from './not-found.component';

type PanelState =
  | 'register'
  | 'request'
  | 'requested'
  | 'going'
  | 'waitlisted'
  | 'closed'
  | 'cancelled'
  | 'declined'
  | 'ended';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [
    RouterLink,
    TopBarComponent,
    CoverComponent,
    IconComponent,
    PillComponent,
    AvatarComponent,
    NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <div class="themed">
        <!-- Four radial gradients faded in once over 2000ms, holding forwards. -->
        <div class="ground anim-theme-fade" aria-hidden="true"></div>
        <app-top-bar />

        <main class="page" id="main">
          @if (loading()) {
            <div class="layout">
              <div class="rail">
                <div class="sk" style="aspect-ratio:1;border-radius:11px"></div>
                <div class="sk sk-line" style="margin-top:16px;width:70%"></div>
              </div>
              <div class="content">
                <div class="sk sk-title" style="height:44px"></div>
                <div class="sk sk-line" style="width:50%"></div>
                <div class="sk" style="height:210px;border-radius:24px;margin-top:24px"></div>
              </div>
            </div>
          } @else if (event(); as e) {
            <div class="layout">
              <aside class="rail">
                <app-cover class="cover" [seed]="e.cover_seed" [title]="e.title" [media]="true" />

                <div class="presented">
                  <app-avatar [name]="e.calendar_name ?? ''" [size]="24" />
                  <span class="who">
                    <span class="t-badge overline">Presented by</span>
                    <a class="cal" [routerLink]="['/', e.calendar_slug]">
                      {{ e.calendar_name }}
                      <app-icon name="chevron" [size]="14" />
                    </a>
                  </span>
                  <button type="button" class="btn btn-pill btn-sm follow">Follow</button>
                </div>

                @if (e.calendar_is_public === false) {
                  <span class="private t-badge">Private calendar</span>
                }
              </aside>

              <div class="content">
                <h1 class="t-serif">{{ e.title }}</h1>

                <div class="facts">
                  <div class="fact">
                    <span class="chip" aria-hidden="true">
                      <span class="t-month">{{ chipMonth() }}</span>
                      <span class="chip-day">{{ chipDay() }}</span>
                    </span>
                    <span class="lines">
                      <span class="t-row when">{{ whenEvent() }}</span>
                      <span class="t-caption zone">{{ eventZoneLabel() }}</span>
                      @if (showVisitorZone()) {
                        <span class="t-caption zone">{{ whenVisitor() }} {{ visitorZoneLabel() }} your time</span>
                      }
                    </span>
                  </div>

                  <div class="fact">
                    <span class="chip flat" aria-hidden="true"><app-icon name="location" [size]="18" /></span>
                    <span class="lines">
                      <span class="t-row">{{ e.location || e.city }}</span>
                      @if (e.location) {
                        <span class="t-caption zone">{{ e.city }}</span>
                      }
                    </span>
                  </div>
                </div>

                @if (e.state === 'cancelled') {
                  <section class="panel notice-cancelled" aria-labelledby="cancelled-h">
                    <h2 id="cancelled-h" class="t-section">This event has been cancelled</h2>
                    <p class="t-prose reason">{{ e.cancel_reason }}</p>
                  </section>
                } @else {
                  <section class="panel reg-panel" aria-labelledby="reg-h">
                    <h2 id="reg-h" class="t-section">{{ panelHeading() }}</h2>
                    <p class="t-prose panel-body">{{ panelBody() }}</p>

                    @if (myReg(); as r) {
                      <div class="my-state">
                        <app-pill [status]="r.status" />
                        @if (r.ticket_code) {
                          <a class="code" [routerLink]="['/t', r.ticket_code]">{{ r.ticket_code }}</a>
                        }
                      </div>
                    }

                    <div class="panel-actions">
                      @if (canRegister()) {
                        <button
                          type="button"
                          class="btn btn-primary btn-pill wide"
                          (click)="register()"
                          [disabled]="working()"
                        >
                          @if (working()) {
                            <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true">
                              <circle fill="none" stroke-width="6" stroke-linecap="round" cx="33" cy="33" r="30" />
                            </svg>
                          }
                          <span>{{ actionLabel() }}</span>
                        </button>
                      }
                      @if (panel() === 'going' || panel() === 'waitlisted' || panel() === 'requested') {
                        <button type="button" class="btn btn-pill" (click)="cancelMine()" [disabled]="working()">
                          {{ panel() === 'waitlisted' ? 'Leave Waiting List' : 'Cancel Registration' }}
                        </button>
                      }
                      @if (e.is_owner) {
                        <a class="btn btn-pill" [routerLink]="['/event', e.slug, 'manage', 'overview']">Manage Event</a>
                      }
                    </div>

                    <p class="answer" role="status" aria-live="assertive">{{ answer() }}</p>

                    @if (e.capacity !== null && e.state === 'published') {
                      <p class="t-caption seats">{{ seatsLine() }}</p>
                    }
                  </section>
                }

                @if (e.description) {
                  <section class="about" aria-labelledby="about-h">
                    <h2 id="about-h" class="t-section">About this event</h2>
                    <p class="t-prose">{{ e.description }}</p>
                  </section>
                }

                @if (e.is_owner || myReg()) {
                  <p class="t-caption address">This event lives at {{ publicAddress() }}</p>
                }
              </div>
            </div>
          }
        </main>

        <!-- Below 484px the panel leaves the flow and sticks to the foot as a 72px bar. -->
        @if (event(); as e) {
          @if (e.state !== 'cancelled' && canRegister()) {
            <div class="footbar">
              <button type="button" class="btn btn-primary btn-pill wide" (click)="register()" [disabled]="working()">
                {{ actionLabel() }}
              </button>
            </div>
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .themed {
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
        position: relative;
      }
      .ground {
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background-image: radial-gradient(circle at 3% -50%, var(--event-stop-1), transparent 55%),
          radial-gradient(circle at 140% -50%, var(--event-stop-2), transparent 55%),
          radial-gradient(circle at -50% 120%, var(--event-stop-3), transparent 55%),
          radial-gradient(circle at 62% 100%, var(--event-stop-4), transparent 55%);
        animation: event-theme-fade-in 2000ms linear forwards;
      }
      .page {
        padding: 96px var(--s5) 120px;
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
        max-width: 948px;
        margin: 0 auto;
      }
      @media (min-width: 1000px) {
        .layout {
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
      .cover {
        border-radius: 11px;
      }
      .presented {
        display: flex;
        align-items: center;
        gap: var(--s3);
      }
      .who {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .overline {
        color: var(--event-ink-secondary);
      }
      .cal {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        color: var(--event-ink);
      }
      .follow {
        border: 1px solid var(--event-hairline);
        background: var(--event-panel);
        color: var(--event-ink);
        min-height: 44px;
      }
      .private {
        display: inline-flex;
        align-self: flex-start;
        padding: 3px 10px;
        border-radius: var(--r-round);
        background: rgba(243, 26, 124, 0.12);
        color: #f31a7c;
        font-weight: 600;
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--s5);
        min-width: 0;
      }
      h1 {
        font-size: 40px;
        line-height: 46px;
        color: var(--event-ink);
      }
      @media (max-width: 649px) {
        h1 {
          font-size: 30px;
          line-height: 36px;
        }
        .page {
          padding: 88px var(--s4) 120px;
        }
      }
      .facts {
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }
      .fact {
        display: flex;
        align-items: flex-start;
        gap: var(--s3);
      }
      .chip {
        width: 44px;
        height: 44px;
        border-radius: var(--r-media);
        background: var(--event-panel);
        border: 1px solid var(--event-hairline);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: none;
        color: var(--event-ink);
      }
      .chip-day {
        font-size: 15px;
        line-height: 18px;
        font-weight: 700;
      }
      .lines {
        display: flex;
        flex-direction: column;
      }
      .zone {
        color: var(--event-ink-secondary);
      }
      .panel {
        background: var(--event-panel);
        border: 1px solid var(--event-hairline);
        border-radius: var(--r-card-lg);
        padding: var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }
      .panel-body {
        color: var(--event-ink);
        opacity: 0.72;
      }
      .my-state {
        display: flex;
        align-items: center;
        gap: var(--s3);
        flex-wrap: wrap;
      }
      .code {
        font-family: var(--mono);
        font-size: 15px;
        letter-spacing: 0.04em;
        color: var(--event-ink);
        background: var(--event-panel);
        border: 1px solid var(--event-hairline);
        border-radius: var(--r-input);
        padding: 4px 8px;
      }
      .panel-actions {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
      }
      .panel-actions .btn:not(.btn-primary) {
        border-color: var(--event-hairline);
        background: transparent;
        color: var(--event-ink);
      }
      .wide {
        min-width: 200px;
      }
      .answer:empty {
        display: none;
      }
      .answer {
        font-size: 15px;
        line-height: 22px;
        color: var(--event-ink);
      }
      .seats {
        color: var(--event-ink-secondary);
      }
      .notice-cancelled {
        border-left: 4px solid #ff3b30;
      }
      .reason {
        color: var(--event-ink);
        opacity: 0.8;
      }
      .about h2 {
        margin-bottom: var(--s2);
      }
      .about p {
        color: var(--event-ink);
        opacity: 0.78;
        white-space: pre-wrap;
      }
      .address {
        color: var(--event-ink-secondary);
      }
      .footbar {
        display: none;
      }
      @media (max-width: 483px) {
        .reg-panel .panel-actions .btn-primary {
          display: none;
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
        .footbar .btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class EventPageComponent {
  slug = input.required<string>();

  private api = inject(ApiService);
  private theme = inject(ThemeService);
  private router = inject(Router);
  session = inject(SessionService);

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly working = signal(false);
  readonly answer = signal('');

  private loadedSlug = '';

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const slug = this.slug();
    if (this.loadedSlug === slug) return;
    this.loadedSlug = slug;
    this.loading.set(true);
    try {
      await this.session.restore();
      const e = await this.api.event(slug);
      // The server already wrote this palette into the first document; this
      // keeps the tokens right on an in-app navigation and is a no-op otherwise.
      this.theme.apply(e.theme_hex);
      this.event.set(e);
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  readonly myReg = computed<Registration | null>(() => this.event()?.my_registration ?? null);

  readonly panel = computed<PanelState>(() => {
    const e = this.event();
    if (!e) return 'register';
    if (e.state === 'cancelled') return 'cancelled';
    const r = this.myReg();
    if (r) {
      if (r.status === 'confirmed' || r.status === 'checked_in') return 'going';
      if (r.status === 'waitlisted') return 'waitlisted';
      if (r.status === 'pending_approval') return 'requested';
      if (r.status === 'declined') return 'declined';
    }
    if (e.state === 'registration_closed') return 'closed';
    if (e.has_ended) return 'ended';
    return e.approval_required ? 'request' : 'register';
  });

  readonly panelHeading = computed(() => {
    switch (this.panel()) {
      case 'going':
        return 'You are going';
      case 'waitlisted':
        return `You are number ${this.myReg()?.waitlist_position ?? 1} on the waiting list`;
      case 'requested':
        return 'Request received';
      case 'request':
        return 'Request to join';
      case 'closed':
        return 'Registration Is Closed';
      case 'declined':
        return 'The host could not offer you a place';
      case 'ended':
        return 'This event has finished';
      case 'cancelled':
        return 'This event has been cancelled';
      default:
        return 'Register';
    }
  });

  readonly panelBody = computed(() => {
    const e = this.event();
    switch (this.panel()) {
      case 'going':
        return 'Your seat is held and your ticket is below. Bring the code to the door.';
      case 'waitlisted':
        return 'We will write the moment a seat opens up, and the seat is yours without doing anything.';
      case 'requested':
        return 'The host reviews every request for this event. You will hear back by email.';
      case 'request':
        return 'The host approves each guest for this one, so this sends a request rather than taking a seat.';
      case 'closed':
        return 'The host has stopped taking registrations for this event.';
      case 'declined':
        return 'There was no place for you this time. Other events from this calendar are open.';
      case 'ended':
        return 'The doors are shut on this one. There will be others.';
      default:
        return e && e.remaining === 0
          ? 'Every seat is taken, so registering puts you on the waiting list.'
          : 'One click holds your seat and sends a ticket to your inbox.';
    }
  });

  readonly actionLabel = computed(() => {
    const e = this.event();
    if (!this.session.signedIn()) return 'Sign In To Register';
    if (this.panel() === 'request') return 'Request To Join';
    if (e && e.remaining === 0 && e.waitlist_enabled) return 'Join Waiting List';
    return 'Register';
  });

  readonly canRegister = computed(() => {
    const p = this.panel();
    return p === 'register' || p === 'request';
  });

  readonly seatsLine = computed(() => {
    const e = this.event();
    if (!e || e.capacity === null) return '';
    const left = e.remaining ?? 0;
    if (left === 0) return `Full — ${e.confirmed_count} of ${e.capacity} seats taken`;
    return `${left} of ${e.capacity} seats left`;
  });

  readonly whenEvent = computed(() => {
    const e = this.event();
    return e ? formatRange(e.starts_at, e.ends_at, e.time_zone) : '';
  });

  readonly eventZoneLabel = computed(() => {
    const e = this.event();
    if (!e?.starts_at) return '';
    return `${e.time_zone} (${zoneAbbrev(e.starts_at, e.time_zone)})`;
  });

  readonly showVisitorZone = computed(() => {
    const e = this.event();
    return !!e && zonesDiffer(e.starts_at, e.time_zone);
  });

  readonly whenVisitor = computed(() => {
    const e = this.event();
    return e ? formatRange(e.starts_at, e.ends_at, visitorZone()) : '';
  });

  readonly visitorZoneLabel = computed(() => {
    const e = this.event();
    return e?.starts_at ? `(${zoneAbbrev(e.starts_at, visitorZone())})` : '';
  });

  readonly chipMonth = computed(() => {
    const e = this.event();
    if (!e?.starts_at) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: e.time_zone, month: 'short' })
      .format(new Date(e.starts_at))
      .toUpperCase();
  });

  readonly chipDay = computed(() => {
    const e = this.event();
    if (!e?.starts_at) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: e.time_zone, day: 'numeric' }).format(
      new Date(e.starts_at),
    );
  });

  readonly publicAddress = computed(() => `${location.origin}/${this.event()?.slug ?? ''}`);

  async register() {
    const e = this.event();
    if (!e) return;
    if (!this.session.signedIn()) {
      void this.router.navigate(['/login'], { queryParams: { next: `/${e.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    try {
      const reg = await this.api.register(e.slug);
      this.answer.set(
        reg.status === 'confirmed'
          ? `You have a seat. Your ticket code is ${reg.ticket_code}.`
          : reg.status === 'waitlisted'
            ? `This event just filled up. You are on the waiting list at number ${reg.waitlist_position}.`
            : (reg.message ?? 'Your request has reached the host.'),
      );
      await this.refresh();
    } catch (err) {
      this.answer.set((err as ApiError).message);
    } finally {
      this.working.set(false);
    }
  }

  async cancelMine() {
    const r = this.myReg();
    if (!r) return;
    this.working.set(true);
    try {
      await this.api.cancelRegistration(r.id);
      this.answer.set('Your place has been given up.');
      await this.refresh();
    } catch (err) {
      this.answer.set((err as ApiError).message);
    } finally {
      this.working.set(false);
    }
  }

  private async refresh() {
    this.event.set(await this.api.event(this.slug()));
  }
}

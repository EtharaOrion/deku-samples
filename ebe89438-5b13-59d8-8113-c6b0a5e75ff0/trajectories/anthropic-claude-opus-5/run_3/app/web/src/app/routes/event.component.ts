import { ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { NoticeService } from '../core/notice.service';
import type { EventDetail, Registration } from '../core/models';
import { EVENT_STATE_WORDS } from '../core/models';
import { PublicBarComponent } from '../layout/public-bar.component';
import { CoverComponent } from '../shared/cover.component';
import { AvatarComponent, StatusPillComponent } from '../shared/ui';
import { IconComponent } from '../shared/icons.component';
import { dateLine, rangeLine, visitorLine, zonesDiffer } from '../core/time';

/**
 * The event page is the whole product: a poster, a date, a place, and one panel
 * that either registers you, says the host is deciding, gives you a waiting-list
 * place, or says registration is closed.
 *
 * The theme arrives in the first document the browser paints, written into the
 * shell by the server, so this page never paints grey and then repaints.
 */
@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    CoverComponent,
    AvatarComponent,
    StatusPillComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="themed" [style]="themeStyle()">
      <div class="theme-gradient" aria-hidden="true"></div>
      <app-public-bar />

      <main class="event">
        @if (loading()) {
          <div class="layout">
            <div class="rail">
              <div class="skeleton" style="aspect-ratio: 1; border-radius: 11px"></div>
              <div class="skeleton" style="height: 44px; margin-top: 24px; border-radius: 12px"></div>
            </div>
            <div class="content">
              <div class="skeleton" style="height: 44px; width: 80%"></div>
              <div class="skeleton" style="height: 24px; width: 55%; margin-top: 16px"></div>
              <div class="skeleton" style="height: 180px; margin-top: 32px; border-radius: 12px"></div>
            </div>
          </div>
        } @else if (event()) {
          @let ev = event()!;
          <div class="layout">
            <div class="rail">
              <app-cover [seed]="ev.cover_seed" [title]="ev.title" [size]="332" />

              <div class="presented">
                <app-avatar [name]="ev.calendar?.name || ev.title" [size]="24" />
                <span class="presented-text">
                  <span class="overline t-badge">Presented by</span>
                  @if (ev.calendar) {
                    <a class="cal-name" [routerLink]="'/' + ev.calendar.slug">
                      {{ ev.calendar.name }}<app-icon name="chevron-right" [size]="14" />
                    </a>
                  }
                </span>
                <button type="button" class="btn btn-sm follow">Follow</button>
              </div>

              @if (ev.calendar && !ev.calendar.is_public) {
                <span class="private-badge">Private calendar</span>
              }
            </div>

            <div class="content">
              <h1 class="title">{{ ev.title }}</h1>

              <div class="when">
                <div class="cal-tile" aria-hidden="true">
                  <span class="ct-month">{{ monthOf(ev) }}</span>
                  <span class="ct-day">{{ dayOf(ev) }}</span>
                </div>
                <div class="when-text">
                  <span class="when-date">{{ dateOf(ev) }}</span>
                  <span class="when-time">{{ timeOf(ev) }}</span>
                  <!-- The visitor's own zone underneath, whenever the two differ. -->
                  @if (showVisitorZone(ev)) {
                    <span class="when-visitor t-caption">{{ visitorTimeOf(ev) }} your time</span>
                  }
                </div>
              </div>

              @if (ev.location) {
                <div class="where">
                  <app-icon name="pin" [size]="18" />
                  <span>{{ ev.location }}</span>
                </div>
              }

              <!-- The registration panel: the point of the screen. -->
              <section class="panel" aria-labelledby="panel-title">
                @if (ev.state === 'cancelled') {
                  <h2 id="panel-title" class="panel-title">This event has been cancelled</h2>
                  <p class="panel-body">{{ ev.cancel_reason }}</p>
                } @else if (ev.state === 'registration_closed') {
                  <h2 id="panel-title" class="panel-title">Registration Is Closed</h2>
                  <p class="panel-body">The host has stopped taking registrations for this event.</p>
                } @else if (myStatus() === 'confirmed' || myStatus() === 'checked_in') {
                  <h2 id="panel-title" class="panel-title">You're going</h2>
                  <p class="panel-body">Your seat is held. Show this code at the door.</p>
                  <div class="ticket-row">
                    <code class="ticket-code">{{ registration()!.ticket_code }}</code>
                    <a class="btn btn-sm" [routerLink]="'/t/' + registration()!.ticket_code">View Ticket</a>
                  </div>
                } @else if (myStatus() === 'pending_approval') {
                  <h2 id="panel-title" class="panel-title">Request received</h2>
                  <p class="panel-body">The host is deciding. We will write to you as soon as they have.</p>
                } @else if (myStatus() === 'waitlisted') {
                  <h2 id="panel-title" class="panel-title">
                    You are number {{ registration()!.waitlist_position }} on the waiting list
                  </h2>
                  <p class="panel-body">If a seat frees up, the next place goes to the head of the list.</p>
                } @else if (ev.approval_required) {
                  <h2 id="panel-title" class="panel-title">Request to join</h2>
                  <p class="panel-body">The host approves each request for this event.</p>
                  <button type="button" class="btn btn-primary btn-pill panel-action" (click)="register(ev)" [disabled]="working()">
                    @if (working()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg> }
                    Request to Join
                  </button>
                } @else {
                  <h2 id="panel-title" class="panel-title">{{ seatsLine(ev) }}</h2>
                  <p class="panel-body">{{ ev.remaining === 0 ? 'This event is full, but you can take a place on the waiting list.' : 'Registration is open. A ticket arrives by email.' }}</p>
                  <button type="button" class="btn btn-primary btn-pill panel-action" (click)="register(ev)" [disabled]="working()">
                    @if (working()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg> }
                    {{ ev.remaining === 0 ? 'Join the Waiting List' : 'Register' }}
                  </button>
                }

                <!-- Its answer to a submission is an assertive live region. -->
                <p class="panel-answer" role="alert" aria-live="assertive">{{ answer() }}</p>

                @if (registration(); as reg) {
                  <div class="my-status">
                    <app-status-pill [status]="reg.status" />
                    @if (reg.status === 'confirmed' || reg.status === 'waitlisted' || reg.status === 'pending_approval') {
                      <button type="button" class="btn-text" (click)="cancelMine(reg)">
                        {{ reg.status === 'waitlisted' ? 'Leave Waiting List' : 'Cancel Registration' }}
                      </button>
                    }
                  </div>
                }
              </section>

              @if (ev.description) {
                <section class="about">
                  <h2 class="t-longform-heading">About this event</h2>
                  <p class="t-longform">{{ ev.description }}</p>
                </section>
              }

              @if (ev.is_owner) {
                <div class="host-controls">
                  <span class="pill">{{ stateWord(ev) }}</span>
                  <a class="btn btn-sm" [routerLink]="'/event/' + ev.slug + '/manage/overview'">Manage Event</a>
                </div>
              }
            </div>
          </div>

          <!-- Below 484px the panel leaves the flow and sticks to the foot of
               the screen as a 72px bar carrying the one primary action. -->
          @if (showFootBar(ev)) {
            <div class="foot-bar">
              <button type="button" class="btn btn-primary btn-pill" (click)="register(ev)" [disabled]="working()">
                {{ ev.approval_required ? 'Request to Join' : ev.remaining === 0 ? 'Join the Waiting List' : 'Register' }}
              </button>
            </div>
          }
        }
      </main>
    </div>
  `,
  styles: [
    `
      .themed {
        position: relative;
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
        padding-top: 64px;
      }

      /* Four radial gradients whose stops are custom properties, faded in once
         over 2000ms and holding forwards. */
      .theme-gradient {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background:
          radial-gradient(circle at 3% -50%, var(--event-accent), transparent 55%),
          radial-gradient(circle at 140% -50%, var(--event-accent), transparent 55%),
          radial-gradient(circle at -50% 120%, var(--event-accent), transparent 55%),
          radial-gradient(circle at 62% 100%, var(--event-accent), transparent 55%);
        opacity: 0.14;
        animation: event-theme-fade-in 2000ms linear forwards;
      }

      .event {
        padding: 48px 24px 96px;
      }

      .layout {
        display: flex;
        flex-direction: column;
        gap: 32px;
        max-width: 948px;
        margin: 0 auto;
      }

      .rail {
        width: 100%;
      }

      .presented {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 24px;
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

      .cal-name {
        font-size: 16px;
        line-height: 24px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .follow {
        border-radius: var(--r-pill-btn);
        background: var(--event-panel);
        color: var(--event-ink);
        min-height: 38px;
      }

      .private-badge {
        display: inline-block;
        margin-top: 12px;
        padding: 3px 10px;
        border-radius: var(--r-round);
        background: rgba(243, 26, 124, 0.12);
        color: var(--pink);
        font-size: 11px;
        line-height: 16px;
        font-weight: 600;
      }

      .title {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 40px;
        line-height: 48px;
        color: var(--event-ink);
      }

      .when {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 24px;
      }

      .cal-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        flex: none;
        border-radius: var(--r-menu);
        background: var(--event-panel);
        box-shadow: var(--hairline-inset);
      }

      .ct-month {
        font-size: 11px;
        line-height: 14px;
        font-weight: 600;
        color: var(--event-ink-secondary);
      }

      .ct-day {
        font-size: 17px;
        line-height: 20px;
        font-weight: 600;
      }

      .when-text {
        display: flex;
        flex-direction: column;
      }

      .when-date {
        font-weight: 500;
      }

      .when-time,
      .when-visitor {
        color: var(--event-ink-secondary);
        font-size: 15px;
      }

      .where {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 16px;
        color: var(--event-ink);
      }

      .panel {
        margin-top: 32px;
        border: 1px solid var(--event-hairline);
        border-radius: var(--r-card-lg);
        background: var(--event-panel);
        padding: 24px;
      }

      .panel-title {
        font-family: var(--serif);
        font-weight: 400;
        font-size: 24px;
        line-height: 32px;
      }

      .panel-body {
        margin-top: 8px;
        color: var(--event-ink-secondary);
      }

      .panel-action {
        margin-top: 16px;
        width: 100%;
      }

      .panel-answer:empty {
        display: none;
      }

      .panel-answer {
        margin-top: 12px;
        font-size: 15px;
        line-height: 22px;
      }

      .ticket-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        flex-wrap: wrap;
      }

      .ticket-code {
        font-family: var(--mono);
        font-size: 18px;
        letter-spacing: 0.04em;
        padding: 6px 10px;
        border-radius: var(--r-input);
        background: var(--event-ground-sunk);
      }

      .my-status {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        flex-wrap: wrap;
      }

      .about {
        margin-top: 32px;
      }

      .about p {
        margin-top: 8px;
        color: var(--event-ink);
        white-space: pre-line;
      }

      .host-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid var(--event-hairline);
      }

      .foot-bar {
        display: none;
      }

      /* Two columns at 1000px and above: a left rail of 332px and a content
         column of 568px with a 48px gap, the pair centred. */
      @media (min-width: 1000px) {
        .layout {
          flex-direction: row;
          gap: 48px;
          align-items: flex-start;
        }

        .rail {
          width: 332px;
          flex: none;
          position: sticky;
          top: 88px;
        }

        .content {
          width: 568px;
          flex: none;
        }
      }

      @media (max-width: 483px) {
        .event { padding: 32px 16px 96px; }
        .title { font-size: 32px; line-height: 38px; }

        .foot-bar {
          display: flex;
          align-items: center;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 72px;
          padding: 0 16px;
          background: var(--event-ground);
          border-top: 1px solid var(--event-hairline);
          z-index: 200;
        }

        .foot-bar .btn {
          width: 100%;
        }

        .panel-action {
          display: none;
        }
      }
    `,
  ],
})
export class EventPageComponent implements OnInit {
  @Input({ required: true }) slug = '';

  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);
  session = inject(SessionService);

  readonly event = signal<EventDetail | null>(null);
  readonly registration = signal<Registration | null>(null);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly answer = signal('');

  readonly myStatus = computed(() => this.registration()?.status ?? null);

  readonly themeStyle = computed(() => {
    const theme = this.event()?.theme;
    if (!theme) return '';
    // The server already painted these into the shell; restating them keeps the
    // page correct when the router arrives here from another route.
    return (
      `--event-ground:${theme.ground};--event-ground-sunk:${theme.ground_sunk};` +
      `--event-ink:${theme.ink};--event-ink-secondary:${theme.ink_secondary};` +
      `--event-hairline:${theme.hairline};--event-panel:${theme.panel};--event-accent:${theme.accent};`
    );
  });

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.event(this.slug).subscribe({
      next: (ev) => {
        this.event.set(ev);
        this.registration.set(ev.my_registration);
        this.loading.set(false);
        if (ev.theme.too_pale && ev.is_owner) {
          this.notices.show('This cover is too pale to theme from, so the page uses the default palette.', 'warning');
        }
      },
      error: (err: ApiRefusal) => {
        this.loading.set(false);
        // A draft event answers everyone but its host exactly as a slug that
        // never existed does.
        if (err.isNotFound) this.router.navigateByUrl('/not-found', { replaceUrl: true });
        else this.notices.refuse(err.message);
      },
    });
  }

  register(ev: EventDetail) {
    if (!this.session.isSignedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${ev.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    this.api.register(ev.slug).subscribe({
      next: (reg) => {
        this.registration.set(reg);
        this.working.set(false);
        if (reg.status === 'confirmed') {
          this.answer.set(`You have a seat. Your ticket code is ${reg.ticket_code}.`);
        } else if (reg.status === 'waitlisted') {
          this.answer.set('This event just filled up. You are on the waiting list.');
        } else if (reg.status === 'pending_approval') {
          this.answer.set('Your request has been sent. The host is deciding.');
        }
        this.refreshCounts();
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.answer.set(err.message);
      },
    });
  }

  cancelMine(reg: Registration) {
    this.working.set(true);
    this.api.cancelRegistration(reg.id).subscribe({
      next: (updated) => {
        this.registration.set(updated);
        this.working.set(false);
        this.answer.set('Your registration has been cancelled.');
        this.refreshCounts();
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.answer.set(err.message);
      },
    });
  }

  private refreshCounts() {
    this.api.event(this.slug).subscribe({
      next: (ev) => {
        this.event.set(ev);
        this.registration.set(ev.my_registration);
      },
      error: () => {},
    });
  }

  seatsLine(ev: EventDetail) {
    if (ev.remaining === null) return 'Register';
    if (ev.remaining === 0) return 'This event is full';
    return ev.remaining === 1 ? 'One seat left' : `${ev.remaining} seats left`;
  }

  showFootBar(ev: EventDetail) {
    if (ev.state !== 'published') return false;
    const status = this.myStatus();
    return !status || ['declined', 'cancelled_by_guest', 'cancelled_by_host'].includes(status);
  }

  dateOf(ev: EventDetail) {
    return dateLine(ev.starts_at, ev.time_zone);
  }

  timeOf(ev: EventDetail) {
    return rangeLine(ev.starts_at, ev.ends_at, ev.time_zone);
  }

  visitorTimeOf(ev: EventDetail) {
    return visitorLine(ev.starts_at, ev.ends_at);
  }

  showVisitorZone(ev: EventDetail) {
    return zonesDiffer(ev.starts_at, ev.time_zone);
  }

  dayOf(ev: EventDetail) {
    return ev.starts_at
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: ev.time_zone }).format(new Date(ev.starts_at))
      : '\u2013';
  }

  monthOf(ev: EventDetail) {
    return ev.starts_at
      ? new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: ev.time_zone })
          .format(new Date(ev.starts_at))
          .toUpperCase()
      : 'TBA';
  }

  stateWord(ev: EventDetail) {
    return EVENT_STATE_WORDS[ev.state];
  }
}

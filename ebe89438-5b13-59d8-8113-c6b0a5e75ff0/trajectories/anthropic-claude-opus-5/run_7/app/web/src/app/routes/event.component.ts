import {
  ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { EventDetail, Registration, statusPillClass, statusWord } from '../models';
import { formatInZone, formatRange, visitorZone, zonesDiffer } from '../core/time';
import { TopBarComponent } from '../shared/top-bar.component';
import {
  AvatarComponent, CoverComponent, SkeletonComponent, SpinnerComponent,
} from '../shared/ui.components';
import { IconComponent } from '../shared/icons.component';
import { applyTheme } from '../core/theme';

/**
 * The public event page: a poster for one particular evening.
 *
 * Two columns at 1000px and above, a 332px rail beside a 568px content column
 * with a 48px gap. The palette arrives with the first document — the server
 * writes the theme custom properties into the shell — so the page never paints
 * grey and repaints.
 */
@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [
    NgStyle, RouterLink, TopBarComponent, CoverComponent, AvatarComponent,
    IconComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="themed-root">
      <div class="gradient-ground theme-fade" aria-hidden="true"></div>
      <app-top-bar />

      <main id="main" class="layout" role="main">
        @if (loading()) {
          <div class="rail">
            <app-skeleton w="100%" h="332px" radius="11px" />
            <div style="height: 24px"></div>
            <app-skeleton w="60%" h="20px" />
          </div>
          <div class="content">
            <app-skeleton w="80%" h="44px" radius="8px" />
            <div style="height: 24px"></div>
            <app-skeleton w="50%" h="20px" />
            <div style="height: 32px"></div>
            <app-skeleton w="100%" h="180px" radius="12px" />
          </div>
        } @else if (ev()) {
          @let e = ev()!;
          <!-- left rail: the cover, then who is presenting -->
          <div class="rail">
            <app-cover [seed]="e.cover_seed" [size]="332" [title]="e.title" radius="11px" />

            <div class="presented">
              <app-avatar [name]="e.calendar_name" [size]="24" [decorative]="true" />
              <div class="who">
                <span class="overline presented-label">Presented by</span>
                <a class="cal-name" [routerLink]="['/', e.calendar_slug]">
                  {{ e.calendar_name }}<app-icon name="chevron-right" [size]="14" />
                </a>
              </div>
              <button type="button" class="btn btn-sm btn-pill follow" (click)="follow()">Follow</button>
            </div>

            @if (!e.calendar_is_public) {
              <p class="private-note caption">
                <span class="pill pill-danger">Private</span>
                This calendar is unlisted.
              </p>
            }
          </div>

          <!-- content column -->
          <div class="content">
            <h1 class="title display">{{ e.title }}</h1>

            <div class="when">
              <div class="date-chip" aria-hidden="true">
                <span class="chip-month">{{ chip(e).month }}</span>
                <span class="chip-day">{{ chip(e).day }}</span>
              </div>
              <div class="when-text">
                <div class="when-primary">{{ range(e) }}</div>
                @if (showVisitorZone(e)) {
                  <div class="when-secondary caption">
                    {{ visitorLine(e) }} your time
                  </div>
                }
              </div>
            </div>

            <div class="where">
              <app-icon name="pin" [size]="18" />
              <span>{{ e.city }}</span>
            </div>

            @if (e.state === 'cancelled') {
              <!-- A cancelled event keeps its address and shows the notice,
                   not the panel. -->
              <section class="panel cancelled-notice" aria-labelledby="cancel-h">
                <h2 id="cancel-h" class="panel-title">This event has been cancelled</h2>
                <p class="reason">{{ e.cancel_reason }}</p>
              </section>
            } @else {
              <section class="panel" aria-labelledby="reg-h">
                <h2 id="reg-h" class="panel-title">{{ panelTitle(e) }}</h2>
                <p class="panel-body">{{ panelBody(e) }}</p>

                <!-- The panel's own answer is an assertive live region. -->
                <div aria-live="assertive" class="answer">
                  @if (justRegistered(); as reg) {
                    @if (reg.ticket_code) {
                      <p class="ticket-line">
                        Your ticket code is
                        <a class="code" [routerLink]="['/t', reg.ticket_code]">{{ reg.ticket_code }}</a>
                      </p>
                    }
                  }
                  @if (refusal()) { <p class="refusal">{{ refusal() }}</p> }
                </div>

                @if (canRegister(e)) {
                  <button type="button" class="btn btn-solid btn-block action"
                          (click)="register(e)" [disabled]="working()">
                    @if (working()) { <app-spinner /> }
                    {{ actionLabel(e) }}
                  </button>
                } @else if (myStatus(e) === 'confirmed' || myStatus(e) === 'checked_in') {
                  <a class="btn btn-primary btn-block action"
                     [routerLink]="['/t', e.my_registration!.ticket_code]">View Ticket</a>
                } @else if (myStatus(e) === 'waitlisted') {
                  <button type="button" class="btn btn-secondary btn-block action"
                          (click)="leaveWaitlist(e)" [disabled]="working()">Leave Waiting List</button>
                }

                @if (e.state !== 'registration_closed' && seatsLine(e)) {
                  <p class="seats caption">{{ seatsLine(e) }}</p>
                }
              </section>
            }

            @if (e.description) {
              <section class="about">
                <h2 class="longform-heading">About this event</h2>
                <p class="longform desc">{{ e.description }}</p>
              </section>
            }

            @if (e.is_owner) {
              <a class="btn btn-primary manage" [routerLink]="['/event', e.slug, 'manage', 'overview']">
                Manage this event
              </a>
            }
          </div>
        }
      </main>

      <!-- Below 484px the panel leaves the flow and sticks to the foot as a
           72px bar carrying the one primary action. -->
      @if (ev(); as e) {
        @if (e.state !== 'cancelled' && canRegister(e)) {
          <div class="foot-bar">
            <button type="button" class="btn btn-solid btn-block"
                    (click)="register(e)" [disabled]="working()">{{ actionLabel(e) }}</button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .themed-root {
      min-height: 100vh; position: relative;
      background: var(--event-ground); color: var(--event-ink);
    }
    /* Four radial gradients behind the themed page, faded in once. */
    .gradient-ground {
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background:
        radial-gradient(circle at 3% -50%, var(--event-key), transparent 45%),
        radial-gradient(circle at 140% -50%, var(--event-key), transparent 45%),
        radial-gradient(circle at -50% 120%, var(--event-key), transparent 45%),
        radial-gradient(circle at 62% 100%, var(--event-key), transparent 45%);
      opacity: 0.14;
      animation: event-theme-fade-in 2000ms linear forwards;
    }
    .layout {
      max-width: 948px; margin: 0 auto;
      padding: 112px var(--s5) 120px;
      display: grid; grid-template-columns: 332px 568px; gap: var(--s7);
      justify-content: center; align-items: start;
    }
    @media (max-width: 999px) {
      .layout { grid-template-columns: minmax(0, 568px); justify-content: center; }
      .rail app-cover { width: 100% !important; }
    }
    .rail { position: sticky; top: 96px; }
    @media (max-width: 999px) { .rail { position: static; } }

    .presented {
      display: flex; align-items: center; gap: var(--s3);
      margin-top: var(--s5);
    }
    .who { flex: 1; min-width: 0; }
    .presented-label { display: block; font-size: 11px; line-height: 16px;
      color: var(--event-ink-secondary); font-weight: 600; }
    .cal-name {
      display: inline-flex; align-items: center; gap: 2px;
      font-size: 16px; line-height: 24px; font-weight: 500; color: var(--event-ink);
    }
    .follow { border: 1px solid var(--event-hairline); background: var(--event-panel); color: var(--event-ink); }
    .private-note { margin-top: var(--s3); display: flex; align-items: center; gap: var(--s2);
      color: var(--event-ink-secondary); }

    .title { font-size: 44px; line-height: 52px; letter-spacing: -0.01em; }
    @media (max-width: 649px) { .title { font-size: 34px; line-height: 40px; } }

    .when { display: flex; align-items: center; gap: var(--s3); margin-top: var(--s5); }
    .date-chip {
      width: 48px; height: 48px; flex: none; border-radius: var(--r-menu);
      background: var(--event-panel); border: 1px solid var(--event-hairline);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .chip-month { font-size: 11px; line-height: 14px; font-weight: 600; color: var(--event-ink-secondary); }
    .chip-day { font-size: 17px; line-height: 20px; font-weight: 600; }
    .when-primary { font-size: 16px; line-height: 24px; font-weight: 500; }
    .when-secondary { color: var(--event-ink-secondary); }

    .where { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s3);
      color: var(--event-ink-secondary); }

    .panel {
      margin-top: var(--s5); padding: var(--s5);
      border: 1px solid var(--event-hairline); border-radius: var(--r-card);
      background: var(--event-panel);
    }
    .panel-title { font-size: 22px; line-height: 26px; font-weight: 700; font-family: var(--serif); }
    .panel-body { margin-top: var(--s2); color: var(--event-ink-secondary); }
    .answer:empty { display: none; }
    .ticket-line { margin-top: var(--s3); }
    .code { font-family: var(--mono); font-size: 18px; letter-spacing: 0.04em;
      background: var(--event-panel); padding: 2px 6px; border-radius: var(--r-input);
      color: var(--event-ink); border: 1px solid var(--event-hairline); }
    .refusal { margin-top: var(--s3); color: #b32218; }
    .action { margin-top: var(--s4); }
    .seats { margin-top: var(--s2); color: var(--event-ink-secondary); text-align: center; }
    .cancelled-notice { border-color: rgba(255, 59, 48, 0.4); }
    .reason { margin-top: var(--s2); }

    .about { margin-top: var(--s6); }
    .about h2 { margin-bottom: var(--s2); }
    .desc { color: var(--event-ink-secondary); white-space: pre-line; }
    .manage { margin-top: var(--s5); }

    .foot-bar { display: none; }
    @media (max-width: 483px) {
      .foot-bar {
        position: fixed; left: 0; right: 0; bottom: 0; height: 72px;
        display: flex; align-items: center; padding: 0 var(--s4);
        background: var(--event-ground); border-top: 1px solid var(--event-hairline);
        z-index: var(--z-bar);
      }
      .panel .action { display: none; }
      .layout { padding-bottom: 96px; }
    }
  `],
})
export class EventPageComponent implements OnInit {
  @Input() slug = '';

  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  ev = signal<EventDetail | null>(null);
  loading = signal(true);
  working = signal(false);
  refusal = signal<string | null>(null);
  justRegistered = signal<Registration | null>(null);

  ngOnInit() {
    this.load();
  }

  private load() {
    this.api.getEvent(this.slug).subscribe({
      next: (e) => {
        this.ev.set(e);
        this.loading.set(false);
        // The palette is already in the document from the server; this keeps
        // it correct on an in-app navigation between two events.
        applyTheme(e.theme);
      },
      error: () => this.router.navigate(['/not-found'], { skipLocationChange: true }),
    });
  }

  myStatus(e: EventDetail): string | null { return e.my_registration?.status ?? null; }

  /** The panel shows exactly one of six states. */
  canRegister(e: EventDetail): boolean {
    if (e.state !== 'published') return false;
    const s = this.myStatus(e);
    return s === null || ['declined', 'cancelled_by_guest', 'cancelled_by_host'].includes(s);
  }

  panelTitle(e: EventDetail): string {
    if (e.state === 'registration_closed') return 'Registration Is Closed';
    const s = this.myStatus(e);
    if (s === 'confirmed' || s === 'checked_in') return 'You are going';
    if (s === 'pending_approval') return 'Request received';
    if (s === 'waitlisted') {
      return `You are number ${e.my_registration?.waitlist_position} on the waiting list`;
    }
    return e.approval_required ? 'Request to join' : 'Register';
  }

  panelBody(e: EventDetail): string {
    if (e.state === 'registration_closed') {
      return 'The host has stopped taking registrations for this event.';
    }
    const s = this.myStatus(e);
    if (s === 'checked_in') return 'You have been checked in at the door. Enjoy the event.';
    if (s === 'confirmed') return 'Your seat is held. Bring your ticket code to the door.';
    if (s === 'pending_approval') return 'The host is deciding. We will write to you either way.';
    if (s === 'waitlisted') return 'If a seat frees up it passes to the top of this list first.';
    if (e.approval_required) return 'The host approves each request before a seat is held.';
    return 'Take a seat at this event. Your ticket arrives by email.';
  }

  actionLabel(e: EventDetail): string {
    return e.approval_required ? 'Request to Join' : 'Register';
  }

  seatsLine(e: EventDetail): string {
    if (e.capacity === null) return '';
    const left = e.remaining ?? 0;
    if (left <= 0) {
      return e.waitlist_enabled ? 'This event is full. New registrations join the waiting list.' : 'This event is full.';
    }
    return `${left} of ${e.capacity} ${left === 1 ? 'seat' : 'seats'} left`;
  }

  register(e: EventDetail) {
    if (!this.api.isSignedIn) {
      this.router.navigate(['/login'], { queryParams: { next: `/${e.slug}` } });
      return;
    }
    this.working.set(true);
    this.refusal.set(null);
    this.api.register(e.slug).subscribe({
      next: (reg) => {
        this.working.set(false);
        this.justRegistered.set(reg);
        if (reg.status === 'waitlisted') {
          this.notices.show(`This event just filled up. You are on the waiting list.`, 'warning');
        } else if (reg.status === 'confirmed') {
          this.notices.show('You have a seat. Your confirmation is on its way.', 'success');
        } else if (reg.status === 'pending_approval') {
          this.notices.show('Your request has been sent to the host.', 'info');
        }
        this.load();
      },
      error: (r: Refusal) => {
        this.working.set(false);
        this.refusal.set(r.message);
      },
    });
  }

  leaveWaitlist(e: EventDetail) {
    const reg = e.my_registration;
    if (!reg) return;
    this.working.set(true);
    this.api.cancelRegistration(reg.id).subscribe({
      next: () => {
        this.working.set(false);
        this.justRegistered.set(null);
        this.notices.show('You have left the waiting list.', 'info');
        this.load();
      },
      error: (r: Refusal) => {
        this.working.set(false);
        this.refusal.set(r.message);
      },
    });
  }

  follow() {
    this.notices.show('Following a calendar is not part of this build.', 'info');
  }

  // ---- time, always in the event's own zone, visitor's zone underneath ----
  range(e: EventDetail): string { return formatRange(e.starts_at, e.ends_at, e.time_zone); }
  showVisitorZone(e: EventDetail): boolean { return zonesDiffer(e.starts_at, e.time_zone); }
  visitorLine(e: EventDetail): string { return formatInZone(e.starts_at, visitorZone()); }
  chip(e: EventDetail): { month: string; day: string } {
    const d = new Date(e.starts_at);
    try {
      const f = (opts: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('en-GB', { timeZone: e.time_zone, ...opts }).format(d);
      return { month: f({ month: 'short' }).toUpperCase(), day: f({ day: 'numeric' }) };
    } catch {
      return { month: '', day: '' };
    }
  }

  statusWord = statusWord;
  statusPillClass = statusPillClass;
}

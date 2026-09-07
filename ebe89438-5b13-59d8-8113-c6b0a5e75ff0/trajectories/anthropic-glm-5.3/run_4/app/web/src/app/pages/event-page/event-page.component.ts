import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService, type EventItem, type Registration } from '../../core/auth.service';
import { CoverService, coverFor } from '../../core/cover.service';
import { ToastService } from '../../core/toast.service';
import { applyTheme, themeFor } from '../../core/theme';
import { eventWhen, eventZoneTag, visitorWhen, sameZone, dateChip } from '../../core/time';
import { statusLabel, stateLabel, initials, avatarHue } from '../../core/visuals';
import { NotFoundComponent } from '../not-found/not-found.component';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [CommonModule, RouterLink, NotFoundComponent],
  template: `
    @if (notFound()) {
      <app-not-found />
    } @else {
      @if (event(); as ev) {
      <div class="event-theme page-body" [class.cancelled]="ev.state === 'cancelled'">
        <div class="event-theme-ground" aria-hidden="true"></div>
        <div class="columns">
          <aside class="rail" aria-label="Event details">
            <div class="cover-wrap cover-saturate" [style.--cover-from]="spec(ev).from" [style.--cover-to]="spec(ev).to">
              <img class="cover-img" [src]="cover(ev)" [alt]="'Generated cover for ' + ev.title" />
              <div class="cover-glow"></div>
              <div class="cover-sheen"></div>
            </div>
            <div class="presented">
              <span class="avatar" [style.background]="hue">{{ initials(calName().slice(0, 2)) }}</span>
              <div class="who">
                <span class="overline present-label">Presented by</span>
                <a class="cal-name" [routerLink]="['/', calSlug()]">{{ calName() }} <span aria-hidden="true">›</span></a>
              </div>
              <button class="pill follow" type="button">Follow</button>
            </div>
            <div class="facts">
              <span class="caption fact">{{ ev.city }}</span>
              <span class="caption fact">{{ chip(ev).month }} {{ chip(ev).day }} · {{ zone(ev) }}</span>
              <span class="caption fact">{{ seatsLeft(ev) }}</span>
            </div>
          </aside>

          <section class="content">
            <span class="overline cat">{{ ev.category }}</span>
            <h1 class="title serif">{{ ev.title }}</h1>

            <div class="when">
              <span class="mini-cal" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>
                </svg>
              </span>
              <div>
                <p class="when-main">{{ when(ev) }}</p>
                <p class="when-zone">{{ zone(ev) }}</p>
                @if (!sameZoneAsVisitor(ev)) {
                  <p class="when-visitor">{{ visitorLine(ev) }}</p>
                }
              </div>
            </div>

            <p class="place">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                <path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>
              </svg>
              {{ ev.city }}
            </p>

            @if (ev.state === 'cancelled') {
              <div class="notice cancelled-panel" role="status">
                <h2 class="overline">This event has been cancelled</h2>
                <p class="reason">“{{ ev.cancel_reason }}”</p>
                <p class="caption">The page keeps its address. Nothing further is needed from you.</p>
              </div>
            } @else {
              <div class="panel" [class.closed]="panelState() === 'closed'">
                @switch (panelState()) {
                  @case ('register') {
                    <div class="panel-head">
                      <span class="overline">Registration</span>
                      <span class="pill">{{ seatsLeft(ev) }}</span>
                    </div>
                    <p class="panel-copy">{{ panelCopy() }}</p>
                    <button class="btn btn-theme register-btn" (click)="register()" [disabled]="working()">
                      @if (working()) { <span class="spinner"></span> }
                      {{ ev.approval_required ? 'Request to Join' : 'Register' }}
                    </button>
                    <p class="caption panel-note" aria-live="polite">
                      {{ ev.approval_required ? 'The host reads every request before a place is offered.' : 'A seat is held the moment you register.' }}
                    </p>
                  }
                  @case ('pending') {
                    <span class="overline">Request received</span>
                    <p class="panel-copy big">The host is deciding.</p>
                    <p class="panel-copy">Your request is with the host. You will get an email the moment they decide.</p>
                    <span class="pill tone-warning with-dot">{{ statusLabel('pending_approval') }}</span>
                  }
                  @case ('going') {
                    <span class="overline">You are going</span>
                    <p class="panel-copy big">Your seat is held.</p>
                    <div class="ticket-row">
                      <code class="ticket-code">{{ mine()?.ticket_code }}</code>
                      <a class="btn-text view" [routerLink]="['/t', mine()?.ticket_code]">View Ticket</a>
                    </div>
                    <button class="btn btn-secondary cancel-btn" (click)="cancelSeat()" [disabled]="working()">Cancel my seat</button>
                  }
                  @case ('waitlisted') {
                    <span class="overline">Waiting list</span>
                    <p class="panel-copy big">You are number {{ mine()?.waitlist_position }} on the waiting list.</p>
                    <p class="panel-copy">If a place opens up you are confirmed automatically and emailed straight away.</p>
                    <button class="btn btn-secondary cancel-btn" (click)="cancelSeat()" [disabled]="working()">Leave Waiting List</button>
                  }
                  @case ('closed') {
                    <span class="overline">Registration Is Closed</span>
                    <p class="panel-copy big">The host has stopped taking registrations for this event.</p>
                  }
                  @case ('ended') {
                    <span class="overline">This event has ended</span>
                    <p class="panel-copy">It ran its course. Browse what is coming next.</p>
                    <a class="btn btn-theme" routerLink="/discover">Discover Events</a>
                  }
                }
                <p class="answer caption" role="status" aria-live="assertive">{{ answer() }}</p>
              </div>
            }

            <div class="about">
              <h2 class="overline">About this event</h2>
              <p class="longform">{{ ev.description }}</p>
            </div>
          </section>
        </div>
      </div>
      } @else {
        <div class="page loading-page" aria-busy="true">
          <div class="columns">
            <aside class="rail">
              <div class="skeleton" style="aspect-ratio:1"></div>
              <div class="skeleton" style="height:20px;width:70%"></div>
              <div class="skeleton" style="height:20px;width:50%"></div>
            </aside>
            <section class="content">
              <div class="skeleton" style="height:36px;width:60%"></div>
              <div class="skeleton" style="height:20px;width:40%"></div>
              <div class="skeleton" style="height:160px"></div>
            </section>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .page-body { min-height: calc(100vh - 64px); padding: 96px 24px 120px; }
    .columns { max-width: 948px; margin: 0 auto; display: grid; grid-template-columns: 332px 568px; gap: 48px; justify-content: center; }
    .rail { display: flex; flex-direction: column; gap: 16px; }
    .rail .cover-wrap { aspect-ratio: 1; border-radius: 12.8% / 5.7%; }
    .presented { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 24px; height: 24px; border-radius: 100%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset; }
    .who { display: flex; flex-direction: column; }
    .present-label { color: var(--event-ink-secondary); font-size: 11px; line-height: 16px; }
    .cal-name { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--event-ink); }
    .follow { margin-left: auto; cursor: pointer; }
    .facts { display: flex; flex-direction: column; gap: 4px; color: var(--event-ink-secondary); }

    .content { display: flex; flex-direction: column; gap: 20px; }
    .cat { color: var(--event-ink-secondary); text-transform: capitalize; }
    .title { font-size: 44px; line-height: 50px; color: var(--event-ink); }
    .when { display: flex; gap: 12px; align-items: flex-start; color: var(--event-ink); }
    .mini-cal { color: var(--event-ink-secondary); }
    .when-main { font-size: 18px; line-height: 26px; }
    .when-zone, .when-visitor { color: var(--event-ink-secondary); font-size: 13px; line-height: 18px; }
    .place { display: flex; align-items: center; gap: 8px; color: var(--event-ink); }
    .place svg { color: var(--event-ink-secondary); }

    .panel {
      border: 1px solid var(--event-hairline);
      background: var(--event-panel);
      border-radius: var(--r-card);
      padding: 20px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .panel-head { display: flex; align-items: center; justify-content: space-between; }
    .panel-copy { color: var(--event-ink); font-size: 16px; line-height: 24px; }
    .panel-copy.big { font-size: 18px; line-height: 26px; font-weight: 500; }
    .panel-note { color: var(--event-ink-secondary); }
    .register-btn { align-self: flex-start; min-width: 180px; }
    .ticket-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ticket-code { font-family: ui-monospace, monospace; font-size: 18px; letter-spacing: 0.04em; padding: 8px 12px; border-radius: var(--r-input); background: var(--event-panel); border: 1px solid var(--event-hairline); color: var(--event-ink); }
    .answer { color: var(--event-ink-secondary); min-height: 18px; }
    .about .longform { font-size: 16px; line-height: 25.6px; color: var(--event-ink); white-space: pre-line; }

    .notice.cancelled-panel {
      border: 1px solid var(--event-hairline);
      background: var(--event-panel);
      border-left: 4px solid var(--danger);
      border-radius: var(--r-card);
      padding: 20px; display: flex; flex-direction: column; gap: 8px;
    }
    .reason { font-size: 18px; line-height: 26px; font-style: italic; }
    .loading-page .columns { grid-template-columns: 332px 568px; }

    @media (max-width: 1000px) {
      .columns { grid-template-columns: minmax(0, 568px); }
      .rail .cover-wrap { max-width: 332px; }
    }
    @media (max-width: 484px) {
      .page-body { padding: 88px 16px 96px; }
      .title { font-size: 32px; line-height: 38px; }
      .panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 500; border-radius: var(--r-card-lg) var(--r-card-lg) 0 0; min-height: 72px; padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); box-shadow: var(--elev-card); background: var(--event-sunk); }
      .panel-copy, .panel-note, .panel-head .pill { display: none; }
      .register-btn, .cancel-btn { width: 100%; }
    }
  `],
})
export class EventPageComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private covers = inject(CoverService);
  private toasts = inject(ToastService);

  event = signal<EventItem | null>(null);
  notFound = signal(false);
  working = signal(false);
  answer = signal('');
  hue = avatarHue('Riverside');

  slug = '';

  mine = computed(() => this.event()?.my_registration ?? null);

  panelState = computed<string>(() => {
    const ev = this.event();
    if (!ev) return 'register';
    if (ev.state === 'registration_closed') return 'closed';
    if (ev.has_ended) return 'ended';
    const m = this.mine();
    if (!m) return 'register';
    if (m.status === 'pending_approval') return 'pending';
    if (m.status === 'confirmed' || m.status === 'checked_in') return 'going';
    if (m.status === 'waitlisted') return 'waitlisted';
    if (['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(m.status)) return 'register';
    return 'register';
  });

  panelCopy = computed(() => {
    const ev = this.event();
    if (!ev) return '';
    if (ev.approval_required) return 'The host reads every request before a place is offered.';
    return 'Free to attend. Register to hold a seat.';
  });

  calName = computed(() => this.event()?.calendar?.name ?? 'A calendar');
  calSlug = computed(() => this.event()?.calendar?.slug ?? 'discover');

  async ngOnInit(): Promise<void> {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.auth.restore();
    await this.auth.whenAccount();
    const ev = await this.api.getEvent(this.slug);
    if (!ev) {
      // Root-namespace resolution decides between a category, a calendar, a profile and nothing.
      const resolved = await this.api.resolve(this.slug);
      if (!resolved) { this.notFound.set(true); return; }
      if (resolved.kind === 'category') {
        window.location.href = `/${resolved.slug}`;
        return;
      }
      this.notFound.set(true);
      return;
    }
    this.event.set(ev);
    if (ev.calendar) this.hue = avatarHue(ev.calendar.name);
    this.applyPageTheme(ev);
    // A signed-in viewer may hold a registration the anonymous view cannot know about.
    if (this.auth.account() && !ev.my_registration) {
      const fresh = await this.api.getEvent(this.slug);
      if (fresh) this.event.set(fresh);
    }
  }

  private applyPageTheme(ev: EventItem): void {
    const theme = themeFor(ev.theme_hex);
    const body = document.body;
    applyTheme(body, theme);
    body.classList.add('theme-warm');
    document.documentElement.classList.add('theme-warm');
    document.documentElement.style.setProperty('--bar-ink', theme.ink);
    document.documentElement.style.setProperty('--bar-ink-secondary', theme.inkSecondary);
  }

  async register(): Promise<void> {
    if (!this.auth.account()) {
      this.toasts.show('Sign in to hold a seat.', 'info');
      this.router.navigate(['/login'], { queryParams: { next: `/${this.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    const res = await this.api.register(this.slug);
    this.working.set(false);
    if (!res.ok) {
      this.answer.set(res.error?.message ?? 'That did not go through.');
      return;
    }
    const fresh = await this.api.getEvent(this.slug);
    if (fresh) this.event.set(fresh);
    const status = res.registration?.status;
    if (status === 'confirmed') {
      this.answer.set(`You are going. Your ticket code is ${res.registration?.ticket_code}.`);
      this.toasts.show('Seat held — check your email for the ticket.', 'success');
    } else if (status === 'waitlisted') {
      this.answer.set(`You are number ${res.registration?.waitlist_position} on the waiting list.`);
      this.toasts.show('The event filled up — you are on the waiting list.', 'warning');
    } else if (status === 'pending_approval') {
      this.answer.set('Your request is with the host.');
      this.toasts.show('Request sent — the host will decide.', 'info');
    }
  }

  async cancelSeat(): Promise<void> {
    const m = this.mine();
    if (!m) return;
    this.working.set(true);
    const res = await this.api.cancelRegistration(m.id);
    this.working.set(false);
    if (!res.ok) {
      this.answer.set(res.error?.message ?? 'That did not go through.');
      return;
    }
    const fresh = await this.api.getEvent(this.slug);
    if (fresh) this.event.set(fresh);
    this.answer.set('Your place is released.');
    this.toasts.show('Your place is released.', 'info');
  }

  cover(ev: EventItem): string { return this.covers.dataUri(ev.cover_seed, ev.title); }
  spec(ev: EventItem) { return coverFor(ev.cover_seed); }
  when(ev: EventItem): string { return eventWhen(ev.starts_at, ev.time_zone); }
  zone(ev: EventItem): string { return eventZoneTag(ev.starts_at, ev.time_zone); }
  visitorLine(ev: EventItem): string { return `${visitorWhen(ev.starts_at)} your time`; }
  sameZoneAsVisitor(ev: EventItem): boolean { return sameZone(ev.time_zone); }
  chip(ev: EventItem) { return dateChip(ev.starts_at, ev.time_zone); }
  seatsLeft(ev: EventItem): string {
    const left = ev.remaining;
    if (ev.state === 'registration_closed') return 'Registration closed';
    if (left === 0) return ev.waitlist_enabled ? 'Full · waiting list open' : 'Full';
    return left === 1 ? '1 seat left' : `${left} of ${ev.capacity} seats left`;
  }
  initials = initials;
  statusLabel = statusLabel;
  stateLabel = stateLabel;
}

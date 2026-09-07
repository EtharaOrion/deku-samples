import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { CoverComponent } from '../ui/cover.component';
import { TopbarComponent } from '../ui/topbar.component';
import { TimeService } from '../time.service';
import { avatarColor, avatarInitial } from '../cover';
import { applyThemeVars, clearThemeVars, deriveTheme } from '../theme';
import type { CommunityEvent, Registration } from '../types';

type PanelState =
  | 'loading'
  | 'register'
  | 'request'
  | 'requested'
  | 'going'
  | 'waitlisted'
  | 'closed'
  | 'cancelled'
  | 'full'
  | 'ended';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [RouterLink, CoverComponent, TopbarComponent],
  host: { '[class]': '"event-route themed-" + (theme() !== null)' },
  template: `
    <div class="event-page event-themed theme-fade" [class.ready]="themeReady()">
      <app-topbar></app-topbar>

      @if (loading()) {
        <main class="layout skeleton-layout" role="main">
          <div class="rail"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton line"></div></div>
          <div class="column"><div class="skeleton title"></div><div class="skeleton line" style="width:50%"></div><div class="skeleton block"></div></div>
        </main>
      } @else if (event()) {
        <main class="layout" role="main">
          <aside class="rail">
            <app-cover [seed]="ev.cover_seed" [title]="ev.title" [showTitle]="true" [rounded]="true"></app-cover>
            <div class="presented">
              <span class="avatar" [style.background]="avatarColor(ev.calendar_name ?? 'D')">{{ initial(ev.calendar_name ?? 'D') }}</span>
              <div class="presented-text">
                <span class="overline presented-by">Presented by</span>
                <span class="presented-name">{{ ev.calendar_name }}</span>
              </div>
              <span class="chev" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
              </span>
            </div>
          </aside>

          <div class="column">
            <h1 class="title serif">{{ ev.title }}</h1>

            <div class="when">
              <span class="cal-tile" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>
                </svg>
              </span>
              <div class="when-text">
                <p class="when-main">{{ long(ev.starts_at, ev.time_zone) }}</p>
                <p class="when-sub" [class.differs]="differs(ev.starts_at, ev.time_zone)">
                  {{ zone(ev.starts_at, ev.time_zone) }} · {{ ends(ev) }}
                  @if (differs(ev.starts_at, ev.time_zone)) {
                    <span class="visitor"> · {{ long(ev.starts_at, visitorZone()) }} {{ zone(ev.starts_at, visitorZone()) }} your time</span>
                  }
                </p>
              </div>
            </div>

            <p class="place">{{ ev.city }}</p>

            @if (ev.description) {
              <div class="description long-form"><p>{{ ev.description }}</p></div>
            }

            @if (mine()) {
              <p class="your-place caption">
                @switch (mine()?.status) {
                  @case ('confirmed') { You are going. }
                  @case ('checked_in') { You are checked in. }
                  @case ('pending_approval') { The host is deciding on your request. }
                  @case ('waitlisted') { You are number {{ mine()?.waitlist_position }} on the waiting list. }
                  @case ('declined') { The host could not take your request this time. }
                  @case ('cancelled_by_guest') { You cancelled your place. }
                  @case ('cancelled_by_host') { The host cancelled your place. }
                }
              </p>
            }

            <section class="panel" aria-label="Registration">
              @switch (panel()) {
                @case ('cancelled') {
                  <div class="panel-notice">
                    <h2 class="panel-title">This event has been cancelled</h2>
                    <p class="panel-copy">{{ ev.cancel_reason }}</p>
                    <a class="btn secondary" routerLink="/discover">Find another event</a>
                  </div>
                }
                @case ('closed') {
                  <div class="panel-notice">
                    <h2 class="panel-title">Registration Is Closed</h2>
                    <p class="panel-copy">The host has stopped taking registrations for this event.</p>
                  </div>
                }
                @case ('ended') {
                  <div class="panel-notice">
                    <h2 class="panel-title">This event has finished</h2>
                    <p class="panel-copy">It ran {{ long(ev.starts_at, ev.time_zone) }}.</p>
                  </div>
                }
                @case ('going') {
                  <div class="panel-going">
                    <h2 class="panel-title">You're going</h2>
                    @if (evTicketCode()) {
                      <p class="ticket-line"><span class="code">{{ evTicketCode() }}</span></p>
                      <a class="btn secondary small" [routerLink]="['/t', evTicketCode()]">View Ticket</a>
                      <button class="btn quiet small" type="button" (click)="cancel()">Cancel my place</button>
                    }
                  </div>
                }
                @case ('requested') {
                  <div class="panel-wait">
                    <h2 class="panel-title">Request received</h2>
                    <p class="panel-copy">The host is deciding. You will get an email either way.</p>
                  </div>
                }
                @case ('waitlisted') {
                  <div class="panel-wait">
                    <h2 class="panel-title">You are number {{ mine()?.waitlist_position }} on the waiting list</h2>
                    <p class="panel-copy">If a place opens you move up and are emailed straight away.</p>
                    <button class="btn quiet small" type="button" (click)="cancel()">Leave the waiting list</button>
                  </div>
                }
                @case ('full') {
                  <div class="panel-wait">
                    <h2 class="panel-title">This event just filled up</h2>
                    @if (ev.waitlist_enabled) {
                      <p class="panel-copy">You can still join the waiting list.</p>
                      <button class="btn primary" type="button" (click)="register()" [disabled]="working()">
                        @if (working()) { <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg> Join Waiting List }
                        @else { Join Waiting List }
                      </button>
                    } @else {
                      <p class="panel-copy">There is no waiting list for this one.</p>
                    }
                  </div>
                }
                @case ('register') {
                  <div class="panel-register">
                    <p class="panel-copy">{{ seatsLine(ev) }}</p>
                    <button class="btn primary wide" type="button" (click)="register()" [disabled]="working()">
                      @if (working()) { <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg> Registering }
                      @else { Register }
                    </button>
                    <p class="hint caption">Free · one click · a ticket code lands in your inbox</p>
                  </div>
                }
                @case ('request') {
                  <div class="panel-register">
                    <p class="panel-copy">{{ seatsLine(ev) }}</p>
                    <button class="btn primary wide" type="button" (click)="register()" [disabled]="working()">
                      @if (working()) { <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg> Sending }
                      @else { Request to Join }
                    </button>
                    <p class="hint caption">The host reviews every request</p>
                  </div>
                }
              }
              <p class="panel-answer" role="assertive" aria-live="assertive">{{ answer() }}</p>
            </section>

            @if (isOwner()) {
              <div class="host-links row wrap">
                <a class="btn secondary small" [routerLink]="['/event', ev.slug, 'manage', 'overview']">Dashboard</a>
                <a class="btn secondary small" [routerLink]="['/event', ev.slug, 'manage', 'guests']">Guests</a>
                <a class="btn secondary small" [routerLink]="['/event', ev.slug, 'manage', 'registration']">Registration</a>
              </div>
            }
          </div>
        </main>
      }
    </div>
  `,
  styles: [
    `
    :host { display: block; min-height: 100vh; }
    .event-page { min-height: 100vh; padding-top: 64px; opacity: 0; animation: event-theme-fade-in 2000ms linear forwards; }
    .event-page.ready { opacity: 1; }
    .layout {
      max-width: 948px; margin: 0 auto; padding: 32px 24px 96px;
      display: grid; grid-template-columns: 332px 568px; gap: 48px; justify-content: center;
    }
    .rail { display: flex; flex-direction: column; gap: 20px; }
    .rail app-cover { width: 100%; aspect-ratio: 1; }
    .presented { display: flex; align-items: center; gap: 10px; }
    .presented-text { display: flex; flex-direction: column; line-height: 18px; flex: 1; min-width: 0; }
    .presented-by { color: var(--event-ink-2); font-size: 11px; }
    .presented-name { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--event-ink); }
    .chev { color: var(--event-ink-2); }
    .column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .title { font-size: 38px; line-height: 44px; color: var(--event-ink); }
    .when { display: flex; gap: 12px; align-items: flex-start; }
    .cal-tile { width: 36px; height: 36px; border-radius: 8px; background: var(--event-panel); display: inline-flex; align-items: center; justify-content: center; color: var(--event-ink); }
    .when-main { margin: 0; font-size: 16px; line-height: 24px; color: var(--event-ink); font-weight: 500; }
    .when-sub { margin: 2px 0 0; font-size: 13px; line-height: 18px; color: var(--event-ink-2); }
    .place { margin: 0; font-size: 16px; color: var(--event-ink); }
    .description p { color: var(--event-ink); opacity: 0.86; margin: 0; }
    .your-place { color: var(--event-ink-2); }
    .panel { border: 1px solid var(--event-hairline); background: var(--event-panel); border-radius: 16px; padding: 20px; margin-top: 8px; }
    .panel-title { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--event-ink); margin-bottom: 8px; }
    .panel-copy { font-size: 16px; line-height: 24px; color: var(--event-ink); opacity: 0.86; margin: 0 0 12px; }
    .panel-register { display: flex; flex-direction: column; gap: 8px; }
    .wide { width: 100%; }
    .hint { color: var(--event-ink-2); }
    .ticket-line { margin: 0 0 12px; }
    .panel-answer { min-height: 20px; margin: 12px 0 0; font-size: 14px; line-height: 20px; color: var(--event-ink); }
    .panel-answer:empty { display: none; }
    .host-links { margin-top: 16px; }
    @media (max-width: 999px) {
      .layout { grid-template-columns: 1fr; }
      .rail app-cover { max-width: 332px; }
    }
    @media (max-width: 483px) {
      .layout { padding: 24px 16px 120px; }
      .panel { position: fixed; left: 0; right: 0; bottom: 0; margin: 0; border-radius: 20px 20px 0 0;
               box-shadow: var(--elev-card); min-height: 72px; }
    }
  `],
})
export class EventPageComponent {
  event = signal<CommunityEvent | null>(null);
  mine = signal<Registration | null>(null);
  loading = signal(true);
  working = signal(false);
  themeReady = signal(false);
  answer = signal('');
  theme = signal<string | null>(null);
  isOwner = signal(false);

  private destroyRef = inject(DestroyRef);

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private notice: NoticeService,
    private time: TimeService,
  ) {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (!slug) return;
      this.load(slug);
    });
    this.destroyRef.onDestroy(() => clearThemeVars());
  }

  private load(slug: string) {
    this.loading.set(true);
    this.answer.set('');
    const authed = Boolean(this.api.token());
    this.api
      .event(slug, authed)
      .then(async (ev) => {
        this.event.set(ev);
        // The page wears its theme from the first document; the client derivation matches the server's.
        this.applyTheme(ev.theme_hex);
        this.loading.set(false);
        this.themeReady.set(true);
        const acct = this.api.account();
        this.isOwner.set(Boolean(acct && ev.owner_account_id && acct.id === ev.owner_account_id));
        if (acct) {
          const mine = await this.api.myRegistrations().catch(() => []);
          this.mine.set(mine.find((r) => r.event_slug === slug) ?? null);
        }
      })
      .catch((e: ApiFailure) => {
        if (e.status === 404) {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.loading.set(false);
        this.answer.set(e.message);
      });
  }

  private applyTheme(hex: string) {
    const theme = deriveTheme(hex);
    this.theme.set(hex);
    applyThemeVars(null, theme);
  }

  get ev() {
    return this.event()!;
  }

  evTicketCode(): string | null {
    return this.mine()?.ticket_code ?? null;
  }

  panel(): PanelState {
    const ev = this.event();
    if (!ev) return 'loading';
    if (ev.state === 'cancelled') return 'cancelled';
    if (ev.state === 'registration_closed') return 'closed';
    if (new Date(ev.ends_at).getTime() < Date.now()) return 'ended';
    const mine = this.mine();
    if (mine) {
      if (mine.status === 'confirmed' || mine.status === 'checked_in') return 'going';
      if (mine.status === 'pending_approval') return 'requested';
      if (mine.status === 'waitlisted') return 'waitlisted';
    }
    if (ev.remaining === 0 && !ev.waitlist_enabled) return 'full';
    if (ev.approval_required) return 'request';
    return 'register';
  }

  seatsLine(ev: CommunityEvent): string {
    if (ev.remaining === 0) return 'The last seat just went.';
    if (ev.remaining === 1) return 'One seat left.';
    return `${ev.remaining} of ${ev.capacity} seats left.`;
  }

  async register() {
    const ev = this.event();
    if (!ev || this.working()) return;
    if (!this.api.token()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${ev.slug}` } });
      return;
    }
    this.working.set(true);
    this.answer.set('');
    try {
      const reg = await this.api.register(ev.slug);
      this.mine.set(reg);
      if (reg.status === 'confirmed') this.answer.set(`You're going. Your ticket code is ${reg.ticket_code}.`);
      else if (reg.status === 'pending_approval') this.answer.set('Request sent. The host will decide and you will hear by email.');
      else if (reg.status === 'waitlisted') this.answer.set(`You are number ${reg.waitlist_position} on the waiting list.`);
    } catch (e) {
      const failure = e as ApiFailure;
      this.answer.set(failure.message);
      this.notice.danger(failure.message);
      await this.refreshEvent();
    } finally {
      this.working.set(false);
    }
  }

  async cancel() {
    const reg = this.mine();
    if (!reg) return;
    this.working.set(true);
    try {
      await this.api.cancelRegistration(reg.id);
      this.mine.set(null);
      this.answer.set('Your place is released.');
      await this.refreshEvent();
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  private async refreshEvent() {
    const ev = this.event();
    if (!ev) return;
    const fresh = await this.api.event(ev.slug, Boolean(this.api.token())).catch(() => null);
    if (fresh) this.event.set(fresh);
  }

  long(instant: string, tz: string): string {
    return this.time.long(instant, tz);
  }

  zone(instant: string, tz: string): string {
    return this.time.zoneLabel(instant, tz);
  }

  differs(instant: string, tz: string): boolean {
    return this.time.differsFromVisitor(instant, tz);
  }

  ends(ev: CommunityEvent): string {
    return `ends ${this.time.long(ev.ends_at, ev.time_zone)}`;
  }

  visitorZone(): string {
    return this.time.visitorZone;
  }

  avatarColor(name: string): string {
    return avatarColor(name);
  }

  initial(name: string): string {
    return avatarInitial(name);
  }
}

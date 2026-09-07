import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, EventCard, Registration } from '../core/api';
import { CoverComponent } from '../ui/cover';
import { AvatarComponent } from '../ui/avatar';
import { EventWhenComponent } from '../ui/event-when';
import { statusWord } from '../core/tokens';
import { DialogComponent } from '../ui/dialog';

@Component({
  selector: 'app-event-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoverComponent, AvatarComponent, EventWhenComponent, RouterLink, DialogComponent],
  host: { '[style.--ev-key]': 'themeKey()', '[class.themed]': 'true' },
  template: `
    @if (loading()) {
      <div class="page">
        <div class="rail"><div class="skeleton art"></div><div class="skeleton" style="height:48px"></div></div>
        <div class="content"><div class="skeleton" style="height:120px;margin-bottom:16px"></div>
          <div class="skeleton" style="height:180px"></div></div>
      </div>
    } @else if (!event()) {
      <div class="missing">
        <h1>404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a routerLink="/" class="btn btn-primary">Return Home</a>
      </div>
    } @else {
      <div class="ground ev-theme-in" aria-hidden="true"></div>
      <div class="page">
        <aside class="rail">
          <div class="cover"><app-cover [seed]="ev().cover_seed || ev().slug" /></div>
          <div class="presented">
            <app-avatar [name]="ev().calendar_name || 'Host'" [size]="24" />
            <div class="pwho">
              <span class="pover">Presented by</span>
              <a class="pname" [routerLink]="['/' + (ev().calendar_slug || '')]">
                {{ ev().calendar_name }} <span class="chev" aria-hidden="true">›</span>
              </a>
            </div>
            <button type="button" class="follow btn btn-invert btn-sm" (click)="follow()">Follow</button>
          </div>
        </aside>

        <div class="content">
          <span class="pill" [attr.data-status]="ev().state">{{ statusWord(ev().state) }}</span>
          <h1 class="title">{{ ev().title }}</h1>
          <p class="when-line">
            <span class="cal-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M8 4v4M16 4v4"/></svg>
            </span>
            <app-event-when [startsAt]="ev().starts_at" [endsAt]="ev().ends_at" [timeZone]="ev().time_zone" />
          </p>
          <p class="place">{{ ev().city }}</p>
          @if (ev().description) { <p class="blurb">{{ ev().description }}</p> }

          @if (cancelled()) {
            <section class="panel cancelled">
              <h2>This event has been cancelled</h2>
              <p class="reason">“{{ ev().cancel_reason }}”</p>
              <p class="caption">The host wrote that reason. Nothing is owed and nothing was paid.</p>
            </section>
          } @else {
            <section class="panel" [attr.data-state]="panelState()" aria-live="assertive">
              @switch (panelState()) {
                @case ('closed') {
                  <h2>Registration Is Closed</h2>
                  <p>The host has stopped taking registrations for this event.</p>
                }
                @case ('received') {
                  <h2>Request received</h2>
                  <p>The host is deciding. You hold no seat yet, and we will write to you either way.</p>
                  @if (mine()) { <span class="pill" [attr.data-status]="mine()!.status">{{ statusWord(mine()!.status) }}</span> }
                }
                @case ('going') {
                  <h2>You are going</h2>
                  <p class="ticket">Your ticket code is <code class="code big">{{ mine()?.ticket_code }}</code></p>
                  <div class="row">
                    <a class="btn btn-primary" [routerLink]="['/t/' + mine()?.ticket_code]">View Ticket</a>
                    <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(true)">Cancel my place</button>
                  </div>
                }
                @case ('waiting') {
                  <h2>You are number {{ mine()?.waitlist_position }} on the waiting list</h2>
                  <p>A place opens and you are moved up and written to at once.</p>
                  <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(true)">Leave Waiting List</button>
                }
                @case ('request') {
                  <h2>Request to join</h2>
                  <p>The host approves every request by hand. Yours holds no seat until they do.</p>
                  <button type="button" class="btn btn-primary" (click)="submit()" [disabled]="working()">
                    @if (working()) { Sending } @else { Request to join }
                  </button>
                }
                @default {
                  <h2>Register</h2>
                  <p class="caption">{{ seatsLine() }}</p>
                  <button type="button" class="btn btn-primary" (click)="submit()" [disabled]="working()">
                    @if (working()) { Registering } @else { Register }
                  </button>
                }
              }
              @if (refusal()) { <p class="refusal" role="alert">{{ refusal() }}</p> }
            </section>
          }
        </div>
      </div>
    }

    <app-dialog [open]="cancelOpen()" title="Cancel your place"
                body="This frees your seat for the next person on the waiting list."
                [closed]="closeCancel">
      <div class="dlg-actions">
        <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(false)">Keep my place</button>
        <button type="button" class="btn btn-danger" (click)="confirmCancel()">Yes, cancel my place</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .ground {
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background:
        radial-gradient(1200px 600px at 3% -50%, var(--ev-key-30, color-mix(in srgb, var(--ev-key) 30%, transparent)), transparent 70%),
        radial-gradient(1000px 500px at 140% -50%, color-mix(in srgb, var(--ev-key) 24%, transparent), transparent 70%),
        radial-gradient(900px 600px at -50% 120%, color-mix(in srgb, var(--ev-key) 20%, transparent), transparent 70%),
        radial-gradient(1000px 700px at 62% 100%, color-mix(in srgb, var(--ev-key) 16%, transparent), transparent 70%);
      background-color: var(--ev-ground);
    }
    .page {
      max-width: 948px; margin: 0 auto; padding: 96px 24px 120px;
      display: grid; grid-template-columns: 332px 568px; gap: 48px; justify-content: center;
      position: relative;
    }
    .rail { display: flex; flex-direction: column; gap: 16px; }
    .cover { border-radius: var(--r-media); overflow: hidden; }
    .presented { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
    .pwho { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .pover { font: 600 11px/16px var(--sans); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ev-ink-2); }
    .pname { font: 500 16px/24px var(--sans); color: var(--ev-ink); text-decoration: none; }
    .chev { color: var(--ev-ink-2); }
    .follow { flex: none; }
    .content { display: flex; flex-direction: column; gap: 16px; color: var(--ev-ink); }
    .title { font-family: var(--serif); font-weight: 400; font-size: 40px; line-height: 46px; margin: 0; }
    .when-line { display: flex; align-items: flex-start; gap: 10px; margin: 0; }
    .cal-tile {
      display: inline-flex; padding: 8px; border-radius: var(--r-input); background: var(--ev-panel);
      color: var(--ev-ink);
    }
    .place { font-size: 16px; line-height: 24px; margin: 0; }
    .blurb { font-size: 16px; line-height: 25.6px; color: var(--ev-ink); opacity: 0.86; max-width: 60ch; }
    .panel {
      margin-top: 8px; padding: 24px; border-radius: var(--r-card-lg);
      border: 1px solid var(--ev-hairline); background: color-mix(in srgb, var(--paper) 62%, transparent);
      display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-card);
    }
    .panel h2 { font: 600 18px/24px var(--sans); margin: 0; }
    .panel p { margin: 0; font-size: 15px; line-height: 22px; color: var(--ev-ink); }
    .panel .caption { color: var(--ev-ink-2); }
    .ticket { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .code.big { font-size: 18px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .refusal { color: #a11710; font-size: 14px; }
    .cancelled h2 { color: #a11710; }
    .reason { font-style: italic; }
    .missing { max-width: 480px; margin: 0 auto; padding: 96px 24px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .missing h1 { font: 700 22px/26px var(--sans); }
    .missing p { color: var(--ink-64); }
    .dlg-actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
    .skeleton.art { aspect-ratio: 1; height: auto; border-radius: var(--r-media); }

    @media (max-width: 999px) {
      .page { grid-template-columns: minmax(0, 1fr); padding-top: 80px; }
      .rail { order: -1; }
    }
    @media (max-width: 483px) {
      .page { padding: 72px 16px 108px; }
      .title { font-size: 30px; line-height: 36px; }
      .panel { position: static; margin: 0 16px 16px; border-radius: var(--r-card); }
    }
  `],
})
export class EventPageComponent {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  slug = input.required<string>();
  event = signal<EventCard | null>(null);
  mine = signal<Registration | null>(null);
  loading = signal(true);
  working = signal(false);
  refusal = signal('');
  cancelOpen = signal(false);
  themeKey = signal('var(--blue)');

  ev = computed(() => this.event() as EventCard);
  cancelled = computed(() => this.ev().state === 'cancelled');

  panelState = computed<'register' | 'request' | 'received' | 'going' | 'waiting' | 'closed'>(() => {
    const e = this.event();
    if (!e) return 'register';
    if (e.state === 'registration_closed') return 'closed';
    const m = this.mine();
    if (m) {
      if (m.status === 'confirmed' || m.status === 'checked_in') return 'going';
      if (m.status === 'waitlisted') return 'waiting';
      if (m.status === 'pending_approval') return 'received';
      if (m.status === 'declined' || m.status === 'cancelled_by_guest' || m.status === 'cancelled_by_host') {
        // a guest who cancelled may re-register
        if (e.approval_required) return 'request';
        return 'register';
      }
    }
    return e.approval_required ? 'request' : 'register';
  });

  seatsLine = computed(() => {
    const e = this.event();
    if (!e) return '';
    const left = e.capacity - e.confirmed_count;
    if (left <= 0) return e.waitlist_enabled ? 'Full — the waiting list is open.' : 'Full.';
    return `${left} of ${e.capacity} seats left.`;
  });

  constructor() {
    effect(() => { const s = this.slug(); if (s) this.load(); });
  }

  statusWord = statusWord;

  load() {
    this.loading.set(true);
    this.refusal.set('');
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        this.event.set(e);
        this.themeKey.set(e.theme_hex);
        this.applyServerTheme(e.theme_hex);
        this.loading.set(false);
        this.loadMine();
      },
      error: () => { this.event.set(null); this.loading.set(false); },
    });
  }

  /** The server already injected the palette; this confirms it for the SPA. */
  private applyServerTheme(hex: string) {
    const root = document.documentElement;
    root.style.setProperty('--ev-key', hex);
  }

  private loadMine() {
    // Wait until the session is known, or a holder would be told to register.
    this.api.loadAccount().subscribe(() => {
      if (!this.api.signedIn()) { this.mine.set(null); return; }
      this.api.myRegistrations().subscribe({
        next: (list) => this.mine.set(list.find((r) => r.event_slug === this.slug()) ?? null),
        error: () => this.mine.set(null),
      });
    });
  }

  submit() {
    if (!this.api.signedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${this.slug()}` } });
      return;
    }
    void 0;
    this.working.set(true);
    this.refusal.set('');
    this.api.register(this.slug()).subscribe({
      next: (r) => {
        this.working.set(false);
        this.mine.set(r);
        const verb = r.status === 'confirmed' ? 'Your place is confirmed'
          : r.status === 'waitlisted' ? `You are number ${r.waitlist_position} on the waiting list`
          : 'Your request is with the host';
        this.api.notify(`${verb} — check your email.`, r.status === 'waitlisted' ? 'warning' : 'success');
        this.refreshEvent();
      },
      error: (e) => {
        this.working.set(false);
        this.refusal.set(this.api.messageFor(e));
      },
    });
  }

  private refreshEvent() {
    this.api.event(this.slug()).subscribe((e) => this.event.set(e));
  }

  closeCancel = () => this.cancelOpen.set(false);

  confirmCancel() {
    const m = this.mine();
    if (!m) return;
    this.cancelOpen.set(false);
    this.api.cancelRegistration(m.id).subscribe({
      next: (r) => {
        this.mine.set({ ...m, ...r });
        this.api.notify('Your place is released.', 'info');
        this.refreshEvent();
      },
      error: (e) => this.api.notify(this.api.messageFor(e), 'danger'),
    });
  }

  follow() { this.api.notify('You are following this calendar.', 'success'); }
}

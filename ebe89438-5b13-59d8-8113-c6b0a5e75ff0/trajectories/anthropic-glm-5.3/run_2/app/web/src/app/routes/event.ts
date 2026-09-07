import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Cover } from '../ui/cover';
import { Avatar } from '../ui/avatar';
import { Api, ApiError } from '../core/api';
import { Auth } from '../core/auth';
import { deriveTheme, Theme, ThemeTokens } from '../core/theme';
import { TimeFmt } from '../core/time';
import { NotFoundEmbed } from './not-found-embed';

type PanelState =
  | 'register' | 'request' | 'received' | 'going' | 'waiting' | 'closed';

@Component({
  selector: 'cc-event-page',
  standalone: true,
  imports: [FormsModule, PublicBar, RouterLink, Cover, Avatar, NotFoundEmbed],
  template: `
  @if (theme(); as t) {
    <div class="theme-ground theme-fade" [style.--t-ground]="t.ground" [style.--t-sunk]="t.sunk"
         [style.--t-ink]="t.ink" [style.--t-soft]="t.inkSoft" [style.--t-line]="t.hairline"
         [style.--t-fill]="t.panelFill">
      <div class="grad-ground" aria-hidden="true"></div>
      <cc-public-bar></cc-public-bar>

      @if (loading()) {
        <main class="container page two-col">
          <div><div class="skeleton" [style.height.px]="332"></div></div>
          <div class="stack-16">
            <div class="skeleton skeleton-text" [style.width.%]="70"></div>
            <div class="skeleton skeleton-text" [style.width.%]="45"></div>
            <div class="skeleton" [style.height.px]="180"></div>
          </div>
        </main>
      } @else if (!event()) {
        <cc-not-found-embed></cc-not-found-embed>
      } @else {
        @if (ev; as e) {
        <main class="container page two-col">
          <aside class="rail">
            <cc-cover [seed]="e.cover_seed || e.slug" [size]="332" [title]="''"></cc-cover>
            <div class="presented">
              <cc-avatar [name]="e.calendar?.name || ''" [size]="24"></cc-avatar>
              <div class="grow">
                <p class="overline soft">Presented by</p>
                <a class="presenter" [routerLink]="['/', e.calendar?.slug]">
                  {{ e.calendar?.name }} <span aria-hidden="true">&#8250;</span>
                </a>
              </div>
              <button class="btn btn-sm pill-btn soft-btn" type="button">Follow</button>
            </div>
          </aside>

          <section class="content">
            <h1 class="title h1-display">{{ e.title }}</h1>
            <div class="when row">
              <span class="date-chip" aria-hidden="true">
                <span class="chip-month">{{ chip.month }}</span><span class="chip-day">{{ chip.day }}</span>
              </span>
              <div>
                <p class="when-line">{{ when.primary }}</p>
                @if (when.secondary) { <p class="when-sec">{{ when.secondary }}</p> }
              </div>
            </div>
            <p class="where">{{ e.city }} · {{ zoneLabel(e) }}</p>
            @if (e.description) { <p class="desc">{{ e.description }}</p> }

            @if (e.state === 'cancelled') {
              <div class="panel cancelled">
                <h2 class="panel-title">This event has been cancelled</h2>
                <p class="panel-body">The host called it off: “{{ e.cancel_reason }}”</p>
              </div>
            } @else {
              <section class="panel" aria-labelledby="panel-h">
                <h2 class="sr-only" id="panel-h">Registration</h2>
                @switch (panelState) {
                  @case ('register') {
                    <p class="panel-cap">{{ seatsLine(e) }}</p>
                    <button class="btn btn-primary btn-block" type="button" (click)="register()" [disabled]="busy()">
                      {{ busy() ? 'Registering…' : 'Register' }}
                    </button>
                  }
                  @case ('request') {
                    <p class="panel-cap">{{ seatsLine(e) }}</p>
                    <button class="btn btn-primary btn-block" type="button" (click)="register()" [disabled]="busy()">
                      {{ busy() ? 'Sending…' : 'Request to Join' }}
                    </button>
                  }
                  @case ('received') {
                    <span class="pill pil-warn"><span class="pill-dot"></span>Request received</span>
                    <p class="panel-body">The host is deciding. You hold no seat yet.</p>
                  }
                  @case ('going') {
                    <span class="pill pill-ok"><span class="pill-dot"></span>You are going</span>
                    <p class="panel-body code-line">Ticket <span class="code">{{ my()?.ticket_code }}</span></p>
                    <a class="btn btn-secondary btn-sm" [routerLink]="['/t', my()?.ticket_code]">View Ticket</a>
                    <button class="btn btn-sm btn-ghost cancel" type="button" (click)="cancel()">Cancel my seat</button>
                  }
                  @case ('waiting') {
                    <span class="pill pil-warn"><span class="pill-dot"></span>You are number {{ my()?.waitlist_position }} on the waiting list</span>
                    <p class="panel-body">A seat opening moves you up. We will mail you the moment it does.</p>
                    <button class="btn btn-sm btn-ghost" type="button" (click)="cancel()">Leave Waiting List</button>
                  }
                  @case ('closed') {
                    <h3 class="panel-title">Registration Is Closed</h3>
                    <p class="panel-body">The host has stopped taking registrations for this event.</p>
                  }
                }
                <p class="panel-answer" role="status" aria-live="assertive">{{ answer() }}</p>
              </section>
            }
          </section>
        </main>
        }
      }
    </div>
  }`,
  styles: [`
    :host { display: block; }
    .theme-ground { position: relative; min-height: 100vh;
      background: var(--t-ground); color: var(--t-ink); }
    .theme-fade { animation: event-theme-fade-in 2000ms linear forwards; }
    .grad-ground { position: fixed; inset: 0; z-index: -1;
      background:
        radial-gradient(circle at 3% -50%, var(--t-ground), transparent 60%),
        radial-gradient(circle at 140% -50%, var(--t-sunk), transparent 60%),
        radial-gradient(circle at -50% 120%, var(--t-sunk), transparent 60%),
        radial-gradient(circle at 62% 100%, var(--t-ground), transparent 60%);
      animation: event-theme-fade-in 2000ms linear forwards; }
    .page { padding-top: 104px; padding-bottom: 128px; }
    .rail { display: grid; gap: 16px; align-content: start; }
    .presented { display: flex; align-items: center; gap: 12px; }
    .soft { color: var(--t-soft); }
    .presenter { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--t-ink); }
    .soft-btn { background: var(--t-fill); color: var(--t-ink); border: 1px solid var(--t-line);
      border-radius: 19px; }
    .soft-btn:hover { background: var(--t-ink); color: var(--t-ground); }
    .title { font-size: 44px; line-height: 52px; margin: 0 0 24px; }
    .when { margin-bottom: 12px; }
    .when-line { font-size: 17px; line-height: 24px; }
    .when-sec { font-size: 13px; color: var(--t-soft); }
    .where { color: var(--t-soft); margin: 0 0 24px; }
    .desc { font-size: 16px; line-height: 25.6px; max-width: 568px; }
    .panel { margin-top: 32px; padding: 20px; border: 1px solid var(--t-line);
      border-radius: 12px; background: var(--t-fill); display: grid; gap: 14px;
      justify-items: start; }
    .panel.cancelled { background: rgba(255,59,48,0.06); border-color: rgba(255,59,48,0.3); }
    .panel-title { font-size: 17px; line-height: 22px; margin: 0; }
    .panel-body { font-size: 15px; line-height: 22px; color: var(--t-soft); margin: 0; }
    .panel-cap { font-size: 15px; line-height: 22px; }
    .panel-answer { min-height: 22px; font-size: 14px; line-height: 20px; color: var(--t-soft); }
    .btn-block { width: 100%; }
    .btn-ghost { background: none; border: 1px solid var(--t-line); color: var(--t-ink); border-radius: 15px; }
    .date-chip { display: inline-grid; place-items: center; width: 48px; height: 48px;
      border-radius: 11px; background: var(--t-sunk); border: 1px solid var(--t-line); }
    .chip-month { font-size: 11px; line-height: 14px; font-weight: 600; }
    .chip-day { font-size: 16px; line-height: 18px; font-weight: 700; }
    .code-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .code { font-family: var(--mono); font-size: 16px; }
    @media (max-width: 1000px) {
      .two-col { grid-template-columns: 1fr; gap: 32px; }
      .title { font-size: 36px; line-height: 44px; }
    }
    @media (max-width: 484px) {
      /* The panel leaves the flow and sticks to the foot of the screen. */
      .panel { position: fixed; inset: auto 0 0 0; margin: 0; border-radius: 16px 16px 0 0;
        min-height: 72px; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
        display: flex; align-items: center; gap: 12px; z-index: 500;
        background: var(--t-sunk); }
      .panel-cancelled { position: static; }
      .panel-answer { position: absolute; top: -22px; left: 16px; right: 16px; }
      .btn-block { width: auto; flex: 1; }
      .page { padding-bottom: 160px; }
    }
    @media (prefers-reduced-motion: reduce) { .theme-fade, .grad-ground { animation: none; } }
  `],
})
export class EventPage implements OnInit {
  loading = signal(true);
  event = signal<any>(null);
  theme = signal<ThemeTokens | null>(null);
  answer = signal('');
  busy = signal(false);
  slug = '';

  constructor(private route: ActivatedRoute, private api: Api, public auth: Auth,
              private themeSvc: Theme, private fmt: TimeFmt, private router: Router) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(m => {
      this.slug = m.get('slug') ?? '';
      this.load();
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    // The theme arrives from the first painted document via the cookie.
    const cookieHex = this.themeSvc.fromCookie();
    if (cookieHex) this.theme.set(deriveTheme(cookieHex));
    try {
      const e = await this.api.request<any>(`/events/${this.slug}`);
      this.event.set(e);
      this.theme.set(deriveTheme(e.theme_hex));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
      this.event.set(null);
      this.theme.set(deriveTheme('#151515'));
    } finally {
      this.loading.set(false);
    }
  }

  my() { return this.event()?.my_registration ?? null; }

  get ev(): any { return this.event(); }

  get panelState(): PanelState {
    const e = this.event();
    if (!e) return 'closed';
    if (e.state === 'registration_closed') return 'closed';
    const mine = e.my_registration;
    if (mine) {
      if (mine.status === 'pending_approval') return 'received';
      if (mine.status === 'confirmed' || mine.status === 'checked_in') return 'going';
      if (mine.status === 'waitlisted') return 'waiting';
      // cancelled or declined: the visitor may register again
    }
    if (e.approval_required) return 'request';
    return 'register';
  }

  get when(): { primary: string; secondary: string | null } {
    const e = this.event();
    return e ? this.fmt.both(e.starts_at, e.time_zone) : { primary: '', secondary: null };
  }

  get chip(): { month: string; day: string } {
    const e = this.event();
    return e ? this.fmt.dateChip(e.starts_at) : { month: '', day: '' };
  }

  zoneLabel(e: any): string {
    return e.time_zone?.replace('_', ' ') ?? '';
  }

  seatsLine(e: any): string {
    if (e.approval_required) return `The host approves each request · ${e.capacity} seats`;
    if (e.remaining === 0) return e.waitlist_enabled ? 'Full · waiting list open' : 'Full';
    return `${e.remaining} of ${e.capacity} seats left`;
  }

  async register(): Promise<void> {
    if (!this.auth.token) {
      this.router.navigate(['/login'], { queryParams: { next: `/${this.slug}` } });
      return;
    }
    this.busy.set(true);
    this.answer.set('');
    try {
      const r = await this.api.request<any>('/registrations', {
        method: 'POST', body: JSON.stringify({ event_slug: this.slug }),
      });
      await this.load();
      if (r.status === 'confirmed') this.answer.set(`You are going. Ticket ${r.ticket_code} is yours and a confirmation is on its way to your inbox.`);
      else if (r.status === 'waitlisted') this.answer.set(`This event just filled up. You are on the waiting list at position ${r.waitlist_position}.`);
      else this.answer.set('Your request is with the host. You will get mail when they decide.');
    } catch (err) {
      const e = err as ApiError;
      this.answer.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }

  async cancel(): Promise<void> {
    const mine = this.my();
    if (!mine) return;
    this.busy.set(true);
    try {
      await this.api.request(`/registrations/${mine.id}/cancel`, { method: 'POST', body: '{}' });
      await this.load();
      this.answer.set('Your place is released.');
    } catch (err) {
      this.answer.set((err as ApiError).message);
    } finally {
      this.busy.set(false);
    }
  }
}

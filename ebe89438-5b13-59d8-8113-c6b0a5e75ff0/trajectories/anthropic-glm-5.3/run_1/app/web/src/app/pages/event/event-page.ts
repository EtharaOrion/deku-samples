import { Component, OnInit, signal, Input, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PublicBarComponent } from '../../public-bar';
import { CoverComponent } from '../../cover';
import { AvatarComponent } from '../../avatar';
import { Api, ApiEvent } from '../../api';
import { Auth } from '../../auth';

type PanelState =
  | { kind: 'register' } | { kind: 'request' } | { kind: 'received' }
  | { kind: 'going'; code: string } | { kind: 'waitlist'; position: number }
  | { kind: 'closed' } | { kind: 'cancelled' } | { kind: 'ended' };

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [PublicBarComponent, CoverComponent, AvatarComponent, RouterLink, CommonModule],
  template: `
    @if (loading()) {
      @if (!embedded) { <app-public-bar></app-public-bar> }
      <main class="page skeleton-page">
        <div class="skeleton" style="width:332px;height:332px"></div>
        <div class="col">
          <div class="skeleton skeleton-line" style="width:70%"></div>
          <div class="skeleton skeleton-line" style="width:40%"></div>
          <div class="skeleton" style="height:180px"></div>
        </div>
      </main>
    } @else if (event(); as ev) {
      @if (!embedded) { <app-public-bar></app-public-bar> }
      <main class="page themed theme-fade" [style.--ev-ground]="theme().ground" [style.--ev-sunk]="theme().sunk"
            [style.--ev-ink]="theme().ink" [style.--ev-key]="theme().key">
        <div class="rail">
          <app-cover [seed]="ev.cover_seed" [title]="ev.title" [size]="'100%'"></app-cover>
          <div class="presented">
            <app-avatar [name]="ev.calendar?.name || '?'" [size]="24"></app-avatar>
            <div class="presented-text">
              <span class="overline ev-secondary">Presented by</span>
              <a class="cal-name" [routerLink]="['/' + ev.calendar?.slug]">{{ ev.calendar?.name }} <span aria-hidden="true">›</span></a>
            </div>
            <button class="follow-pill" type="button" (click)="follow($event)" aria-label="Follow this calendar">Follow</button>
          </div>
        </div>
        <div class="col">
          @if (ev.state === 'cancelled') {
            <div class="cancel-notice" role="status">
              <span class="pill pill-danger">Cancelled</span>
              <h1 class="title">{{ ev.title }}</h1>
              <p class="reason">{{ ev.cancel_reason }}</p>
            </div>
          } @else {
            <h1 class="title">{{ ev.title }}</h1>
            <div class="when">
              <span class="date-tile" aria-hidden="true">
                <span class="month">{{ monthLabel(ev.starts_at, ev.time_zone) }}</span>
                <span class="day">{{ dayLabel(ev.starts_at, ev.time_zone) }}</span>
              </span>
              <div class="when-text">
                <p class="when-line">{{ fmt(ev.starts_at, ev.time_zone) }} – {{ fmt(ev.ends_at, ev.time_zone) }}</p>
                <p class="when-sub">{{ ev.time_zone }}</p>
                @if (zd(ev.starts_at, ev.time_zone)) {
                  <p class="when-sub">Your time: {{ fmt(ev.starts_at, vz()) }}</p>
                }
              </div>
            </div>
            <p class="place">{{ ev.city }}</p>
            @if (ev.description) { <p class="description">{{ ev.description }}</p> }

            <section class="panel" [attr.aria-live]="'assertive'" aria-label="Registration">
              @switch (panel().kind) {
                @case ('register') {
                  <div class="panel-head">
                    <span class="panel-title">{{ ev.remaining }} of {{ ev.capacity }} seats left</span>
                    <span class="badge-ts">Free entry</span>
                  </div>
                  <button class="btn btn-primary btn-register" type="button" (click)="register()" [disabled]="working()">
                    @if (working()) { <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"/><path fill="currentColor" d="M25 5 a20 20 0 0 1 20 20"/></svg> Registering… }
                    @else { Register }
                  </button>
                }
                @case ('request') {
                  <div class="panel-head"><span class="panel-title">The host decides who joins</span></div>
                  <button class="btn btn-primary btn-register" type="button" (click)="register()" [disabled]="working()">
                    @if (working()) { Requesting… } @else { Request to Join }
                  </button>
                }
                @case ('received') {
                  <span class="pill pill-warning">Request received</span>
                  <p class="panel-line">The host has your request. You hold no seat until they approve.</p>
                }
                @case ('going') {
                  <span class="pill pill-success">You are going</span>
                  <p class="panel-line">Your ticket is ready. Bring the code to the door.</p>
                  <a class="ticket-code" [routerLink]="['/t', p().code]">{{ p().code }}</a>
                  <a class="btn btn-secondary" [routerLink]="['/t', p().code]">View Ticket</a>
                }
                @case ('waitlist') {
                  <span class="pill pill-warning">Waiting list</span>
                  <p class="panel-line">You are number {{ p().position }} on the waiting list.</p>
                  <button class="btn btn-secondary" type="button" (click)="leaveWaitlist()" [disabled]="working()">Leave Waiting List</button>
                }
                @case ('closed') {
                  <span class="panel-title closed-title">Registration Is Closed</span>
                  <p class="panel-line">The host has stopped taking registrations for this event.</p>
                }
                @case ('ended') {
                  <span class="pill pill-muted">Ended</span>
                  <p class="panel-line">This event has finished.</p>
                }
              }
              @if (answer(); as ans) { <p class="panel-answer" role="status">{{ ans }}</p> }
            </section>
          }
        </div>
      </main>
      <footer class="foot">
        <p>Events, run by people you can find.</p>
      </footer>
    } @else {
      @if (!embedded) { <app-public-bar></app-public-bar> }
      <main class="page">
        <div class="notfound-inline">
          <h1 class="nf-title">404 · Page Not Found</h1>
          <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
          <a class="btn btn-primary" routerLink="/">Return Home</a>
        </div>
      </main>
    }
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; gap: 48px; justify-content: center; padding: 32px 24px 96px; background: var(--ev-ground); color: var(--ev-ink); min-height: 70vh; }
    .page:not(.themed) { background: var(--paper); color: var(--ink); }
    .theme-fade { animation: event-theme-fade-in 2000ms linear forwards; }
    .rail { width: 332px; flex: none; display: flex; flex-direction: column; gap: 16px; }
    .col { width: 568px; max-width: 100%; }
    .title { font-family: var(--serif); font-weight: 400; font-size: 40px; line-height: 48px; margin: 0 0 24px; color: inherit; }
    .presented { display: flex; align-items: center; gap: 12px; }
    .presented-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ev-secondary { color: rgba(0, 15, 58, 0.36); font-size: 11px; }
    .cal-name { font-size: 16px; line-height: 24px; font-weight: 500; color: inherit; text-decoration: none; }
    .follow-pill { border-radius: 19px; padding: 8px 20px; min-height: 44px; border: 1px solid rgba(0,15,58,.08); background: rgba(0,15,58,.04); color: inherit; font-size: 16px; line-height: 24px; font-weight: 500; cursor: pointer; }
    .follow-pill:hover { background: rgba(0,15,58,.64); color: #fff; }
    .when { display: flex; gap: 16px; align-items: center; margin: 0 0 16px; }
    .date-tile { width: 56px; height: 56px; border-radius: 11px; background: rgba(0,15,58,.04); display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(0,15,58,.08); }
    .month { font-size: 11px; line-height: 14px; font-weight: 600; text-transform: uppercase; }
    .day { font-size: 20px; line-height: 24px; font-weight: 700; }
    .when-line { font-size: 16px; line-height: 24px; margin: 0; }
    .when-sub { font-size: 13px; line-height: 16px; margin: 2px 0 0; color: rgba(0, 15, 58, 0.36); }
    .place { font-size: 16px; line-height: 24px; margin: 0 0 16px; }
    .description { font-size: 16px; line-height: 25.6px; margin: 0 0 32px; }
    .panel { border: 1px solid rgba(0,15,58,.08); border-radius: 12px; padding: 20px; background: rgba(255,255,255,.55); display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .panel-head { display: flex; justify-content: space-between; width: 100%; align-items: baseline; }
    .panel-title { font-size: 16px; line-height: 24px; font-weight: 600; }
    .closed-title { font-weight: 700; }
    .panel-line { font-size: 14px; line-height: 21px; margin: 0; color: rgba(0,15,58,.64); }
    .panel-answer { font-size: 14px; line-height: 21px; margin: 0; font-weight: 600; }
    .ticket-code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 18px; letter-spacing: .04em; color: inherit; text-decoration: underline; text-underline-offset: 4px; }
    .btn-register { width: 100%; }
    .cancel-notice { border: 1px solid rgba(255,59,48,.4); border-radius: 12px; padding: 20px; background: rgba(255,59,48,.06); }
    .reason { font-size: 16px; line-height: 25.6px; margin: 12px 0 0; }
    .foot { text-align: center; padding: 32px; color: var(--ink-36); font-size: 13px; }
    .notfound-inline { max-width: 480px; margin: 48px auto; text-align: center; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .nf-title { font-family: var(--serif); font-size: 28px; line-height: 34px; }
    .skeleton-page { display: flex; gap: 48px; }
    @media (max-width: 1000px) {
      .page { flex-direction: column; align-items: center; }
      .rail { width: 100%; max-width: 568px; }
    }
    @media (max-width: 484px) {
      .page { padding-bottom: 128px; }
      .panel { position: fixed; left: 0; right: 0; bottom: 0; border-radius: 16px 16px 0 0; z-index: 200; padding: 14px 16px; }
      .btn-register { min-height: 72px; }
    }
  `],
})
export class EventPageComponent implements OnInit {
  @Input() slugInput: string | null = null;
  @Input() embedded = false;
  event = signal<ApiEvent | null>(null);
  loading = signal(true);
  working = signal(false);
  answer = signal<string | null>(null);
  theme = signal(Api.deriveTheme('#146aeb'));
  slug = '';

  public api!: Api;
  constructor(private route: ActivatedRoute, private apiPriv: Api, public auth: Auth, private router: Router) {
    this.api = apiPriv;
  }

  ngOnInit() {
    if (this.slugInput) {
      this.slug = this.slugInput;
      this.load();
      return;
    }
    this.route.paramMap.subscribe((pm) => {
      this.slug = pm.get('slug') || '';
      this.load();
    });
  }

  async load() {
    this.loading.set(true);
    const { status, body } = await this.api.get<ApiEvent>(`/events/${this.slug}`);
    if (status !== 200) { this.event.set(null); this.loading.set(false); return; }
    this.event.set(body);
    this.theme.set(Api.deriveTheme(body.theme_hex));
    this.loading.set(false);
  }

  p(): any { return this.panel(); }
  panel(): PanelState {
    const ev = this.event();
    if (!ev) return { kind: 'register' };
    if (ev.state === 'cancelled') return { kind: 'cancelled' };
    if (ev.state === 'registration_closed') return { kind: 'closed' };
    if (ev.has_ended) return { kind: 'ended' };
    const mine = ev.my_registration;
    if (mine) {
      if (mine.status === 'confirmed' || mine.status === 'checked_in') return { kind: 'going', code: mine.ticket_code || '' };
      if (mine.status === 'waitlisted') return { kind: 'waitlist', position: mine.waitlist_position || 1 };
      if (mine.status === 'pending_approval') return { kind: 'received' };
    }
    if (ev.approval_required) return { kind: 'request' };
    return { kind: 'register' };
  }

  monthLabel(iso: string, zone: string) {
    return new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: zone }).format(new Date(iso));
  }
  dayLabel(iso: string, zone: string) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: zone }).format(new Date(iso));
  }

  async register() {
    if (!this.auth.token) {
      this.router.navigate(['/login'], { queryParams: { next: '/' + this.slug } });
      return;
    }
    this.working.set(true);
    this.answer.set(null);
    const { status, body } = await this.api.post<any>(`/registrations`, { event_slug: this.slug });
    this.working.set(false);
    if (status === 201 || status === 200) {
      await this.load();
      const b = body as any;
      if (b.status === 'confirmed') this.answer.set(`You're in. Your ticket code is ${b.ticket_code}.`);
      else if (b.status === 'waitlisted') this.answer.set(`This event just filled up. You are on the waiting list at position ${b.waitlist_position}.`);
      else this.answer.set(`Your request is with the host.`);
    } else {
      const msg = (body as any)?.message || `That didn't go through. Try again in a moment.`;
      this.answer.set(msg);
    }
  }

  async leaveWaitlist() {
    const ev = this.event();
    const mine = ev?.my_registration;
    if (!mine) return;
    this.working.set(true);
    await this.api.post(`/registrations/${mine.id}/cancel`);
    this.working.set(false);
    this.answer.set(`You've left the waiting list.`);
    await this.load();
  }

  follow(e: Event) {
    this.api.flash(`Following ${this.event()?.calendar?.name ?? 'this calendar'}. New events will reach your home page.`, 'success');
  }

  fmt(iso: string, zone: string) { return Api.inZone(iso, zone); }
  vz() { return Api.visitorZone(); }
  zd(iso: string, zone: string) { return Api.zonesDiffer(iso, zone); }
}
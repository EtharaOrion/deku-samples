import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { CoverComponent } from '../ui/cover.component';
import { AvatarComponent } from '../ui/avatar.component';
import { PillComponent } from '../ui/pill.component';
import { ApiService, Refusal } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NoticeService } from '../core/notice.service';
import { EventDetail } from '../core/models';
import { deriveTheme } from '../core/art';
import { dateChip, longDateIn, timeRangeIn, visitorZone, zonesDiffer } from '../core/time';

/**
 * The event page: a poster, a date, a place, and one panel showing exactly one
 * of six states. The palette arrives in the first document the browser paints,
 * so this page never renders grey and then repaints.
 */
@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, CoverComponent, AvatarComponent, PillComponent],
  template: `
    <div class="theme-root" [style]="themeStyle()">
      <div class="gradient-ground event-theme-fade" aria-hidden="true"></div>
      <app-public-bar />

      @if (loading()) {
        <main class="layout">
          <div class="rail"><div class="skeleton skeleton-tile"></div></div>
          <div class="content">
            <div class="skeleton skeleton-title" style="height:44px"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text" style="width:70%"></div>
            <div class="skeleton" style="height:180px;margin-top:24px;border-radius:12px"></div>
          </div>
        </main>
      }
      @if (!loading() && event(); as e) {
        <main id="main" class="layout">
          <aside class="rail">
            <app-cover [seed]="e.cover_seed" [title]="e.title" radius="11px" />
            <div class="presented">
              <app-avatar [name]="e.calendar_name || ''" [size]="24" [decorative]="true" />
              <div class="who">
                <span class="t-badge overline">Presented by</span>
                <a class="cal" [routerLink]="['/', e.calendar_slug]">
                  {{ e.calendar_name }}<span aria-hidden="true"> &rsaquo;</span>
                </a>
              </div>
              <button type="button" class="btn btn-primary btn-pill btn-sm follow" (click)="follow()">Follow</button>
            </div>
          </aside>

          <div class="content">
            <h1 class="serif title">{{ e.title }}</h1>

            <div class="when-row">
              <span class="cal-tile" aria-hidden="true">
                <span class="t-month">{{ chip(e).month }}</span>
                <span class="day">{{ chip(e).day }}</span>
              </span>
              <div>
                <p class="t-body strong">{{ longDate(e) }}</p>
                <p class="t-caption sub">{{ timeRange(e) }}</p>
                @if (differs(e)) {
                  <p class="t-caption sub">{{ visitorLine(e) }}</p>
                }
              </div>
            </div>

            <p class="t-body place">{{ e.city }}</p>

            @if (e.state === 'cancelled') {
              <section class="panel notice-panel" aria-labelledby="panel-heading">
                <h2 id="panel-heading" class="t-section">This event has been called off</h2>
                <p class="t-body">{{ e.cancel_reason }}</p>
              </section>
            } @else {
              <section class="panel" aria-labelledby="panel-heading">
                <h2 id="panel-heading" class="t-section">{{ panelHeading() }}</h2>
                <p class="t-body panel-body">{{ panelBody() }}</p>

                <div class="live" aria-live="assertive">
                  @if (panelAnswer()) { <p class="answer">{{ panelAnswer() }}</p> }
                </div>

                @if (reg(); as r) {
                  <div class="state-row">
                    <app-pill [status]="r.status" />
                    @if (r.ticket_code) { <code class="ticket">{{ r.ticket_code }}</code> }
                  </div>
                  @if (r.ticket_code) {
                    <a class="btn btn-primary btn-block" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                  }
                } @else if (canRegister()) {
                  <button type="button" class="btn btn-solid btn-block panel-action"
                          (click)="register()" [disabled]="busy()">
                    @if (busy()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28"/></svg> }
                    {{ e.approval_required ? 'Request to Join' : 'Register' }}
                  </button>
                }

                @if (e.capacity !== null && e.state === 'published') {
                  <p class="t-caption seats">{{ seatLine() }}</p>
                }
              </section>
            }

            @if (e.description) {
              <section class="about">
                <h2 class="t-section">About this event</h2>
                <p class="t-long">{{ e.description }}</p>
              </section>
            }

            @if (e.is_owner) {
              <a class="btn btn-primary manage" [routerLink]="['/event', e.slug, 'manage', 'overview']">
                Manage this event
              </a>
            }
          </div>
        </main>

        <div class="footbar" role="region" aria-label="Registration">
          @if (reg(); as r) {
            <app-pill [status]="r.status" />
          } @else if (canRegister()) {
            <button type="button" class="btn btn-solid btn-block" (click)="register()" [disabled]="busy()">
              {{ e.approval_required ? 'Request to Join' : 'Register' }}
            </button>
          } @else {
            <span class="t-caption">{{ panelHeading() }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .theme-root {
      min-height: 100vh; position: relative;
      background: var(--event-ground); color: var(--event-ink);
    }
    .gradient-ground {
      position: absolute; inset: 0; z-index: -1; pointer-events: none;
      animation: event-theme-fade-in 2000ms linear forwards;
      background:
        radial-gradient(circle at 3% -50%, var(--event-accent) 0%, transparent 45%),
        radial-gradient(circle at 140% -50%, var(--event-accent) 0%, transparent 45%),
        radial-gradient(circle at -50% 120%, var(--event-accent) 0%, transparent 45%),
        radial-gradient(circle at 62% 100%, var(--event-accent) 0%, transparent 45%);
      opacity: 0.12;
    }
    .layout {
      display: grid; grid-template-columns: 332px 568px; gap: 48px;
      justify-content: center; padding: 96px 24px 96px;
    }
    .rail { display: flex; flex-direction: column; gap: 16px; }
    .presented { display: flex; align-items: center; gap: 12px; }
    .who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .overline { color: var(--event-ink-secondary); }
    .cal { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--event-ink); }
    .follow { min-height: 36px; }
    .title { font-size: 44px; line-height: 52px; margin-bottom: 24px; color: var(--event-ink); }
    .when-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .cal-tile {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 44px; height: 48px; flex: none; border-radius: var(--r-menu);
      background: var(--event-panel); border: 1px solid var(--event-hairline);
    }
    .cal-tile .t-month { color: var(--event-accent); }
    .cal-tile .day { font-size: 16px; font-weight: 700; }
    .strong { font-weight: 500; }
    .sub { color: var(--event-ink-secondary); }
    .place { margin-bottom: 24px; color: var(--event-ink); }
    .panel {
      border: 1px solid var(--event-hairline); background: var(--event-panel);
      border-radius: var(--r-card); padding: 24px; margin-bottom: 32px;
    }
    .panel-body { color: var(--event-ink-secondary); margin: 8px 0 16px; }
    .panel-action { margin-top: 8px; }
    .state-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .ticket { font-family: var(--mono); font-size: 15px; border-radius: 4px; padding: 2px 8px; background: var(--event-panel); }
    .seats { margin-top: 12px; color: var(--event-ink-secondary); }
    .answer { color: var(--event-ink); font-weight: 500; margin-bottom: 12px; }
    .about { margin-bottom: 32px; }
    .about h2 { margin-bottom: 8px; }
    .about p { color: var(--event-ink); }
    .manage { margin-bottom: 32px; }
    .footbar { display: none; }
    @media (max-width: 999px) {
      .layout { grid-template-columns: min(568px, 100%); }
      .rail { order: -1; }
    }
    @media (max-width: 483px) {
      .layout { padding: 88px 16px 96px; }
      .title { font-size: 32px; line-height: 38px; }
      .footbar {
        display: flex; align-items: center; gap: 12px;
        position: fixed; left: 0; right: 0; bottom: 0; height: 72px; padding: 0 16px;
        background: var(--event-ground); border-top: 1px solid var(--event-hairline);
        z-index: var(--z-bar);
      }
    }
  `],
})
export class EventPageComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private notices = inject(NoticeService);

  event = signal<EventDetail | null>(null);
  loading = signal(true);
  busy = signal(false);
  panelAnswer = signal('');

  reg = computed(() => {
    const r = this.event()?.my_registration;
    if (!r) return null;
    return ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(r.status) ? r : null;
  });

  themeStyle = computed(() => {
    const e = this.event();
    if (!e) return '';
    const t = deriveTheme(e.theme_hex);
    return `--event-theme:${t.theme};--event-ground:${t.ground};--event-sunk:${t.sunk};` +
           `--event-ink:${t.ink};--event-ink-secondary:${t.inkSecondary};` +
           `--event-hairline:${t.hairline};--event-panel:${t.panel};--event-accent:${t.theme}`;
  });

  ngOnInit() {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') || ''));
  }

  private load(slug: string) {
    this.loading.set(true);
    this.api.getEvent(slug).subscribe({
      next: (e) => {
        this.event.set(e);
        this.loading.set(false);
        document.title = `${e.title} - Deku Events`;
        const t = deriveTheme(e.theme_hex);
        if (t.tooPale) {
          this.notices.show('This cover is too pale to theme from, so the page keeps the paper ground.', 'warning');
        }
      },
      error: () => { this.loading.set(false); this.router.navigateByUrl('/404', { skipLocationChange: true }); },
    });
  }

  chip(e: EventDetail) { return dateChip(e.starts_at, e.time_zone); }
  longDate(e: EventDetail) { return longDateIn(e.starts_at, e.time_zone); }
  timeRange(e: EventDetail) { return timeRangeIn(e.starts_at, e.ends_at, e.time_zone); }
  differs(e: EventDetail) { return zonesDiffer(e.starts_at, e.time_zone); }
  visitorLine(e: EventDetail) {
    return `${timeRangeIn(e.starts_at, e.ends_at, visitorZone())} your time`;
  }

  canRegister() {
    const e = this.event();
    return !!e && e.state === 'published' && !this.reg();
  }

  /** Exactly one of six states. */
  panelHeading(): string {
    const e = this.event();
    if (!e) return '';
    if (e.state === 'registration_closed') return 'Registration Is Closed';
    const r = this.reg();
    if (r?.status === 'confirmed' || r?.status === 'checked_in') return "You're going";
    if (r?.status === 'waitlisted') return `You are number ${r.waitlist_position} on the waiting list`;
    if (r?.status === 'pending_approval') return 'Request received';
    if (e.approval_required) return 'Request to join';
    return 'Register';
  }

  panelBody(): string {
    const e = this.event();
    if (!e) return '';
    if (e.state === 'registration_closed') return 'The host has stopped taking registrations for this event.';
    const r = this.reg();
    if (r?.status === 'checked_in') return 'You have arrived. Enjoy the event.';
    if (r?.status === 'confirmed') return 'Your seat is held. Show your ticket code at the door.';
    if (r?.status === 'waitlisted') return 'We will write the moment a seat opens up.';
    if (r?.status === 'pending_approval') return 'The host is deciding. We will write once they do.';
    if (e.approval_required) return 'The host reads every request before a seat is given.';
    if ((e.remaining ?? 1) <= 0 && e.waitlist_enabled) return 'This event is full, so you would join the waiting list.';
    return 'Take a seat at this event. It is free.';
  }

  seatLine(): string {
    const e = this.event()!;
    const remaining = e.remaining ?? 0;
    if (remaining <= 0) return `Full - ${e.confirmed_count} of ${e.capacity} seats taken`;
    return `${remaining} of ${e.capacity} seats left`;
  }

  register() {
    const e = this.event();
    if (!e) return;
    if (!this.auth.isSignedIn()) {
      this.router.navigate(['/login'], { queryParams: { next: `/${e.slug}` } });
      return;
    }
    this.busy.set(true);
    this.panelAnswer.set('');
    this.api.register(e.slug).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.event.update((cur) => cur ? { ...cur, my_registration: r } : cur);
        if (r.status === 'confirmed') {
          this.panelAnswer.set(`You have a seat. Your ticket code is ${r.ticket_code}.`);
        } else if (r.status === 'waitlisted') {
          this.panelAnswer.set(`This event just filled up. You are on the waiting list at number ${r.waitlist_position}.`);
        } else if (r.status === 'pending_approval') {
          this.panelAnswer.set('Your request has reached the host.');
        }
        this.api.getEvent(e.slug).subscribe({ next: (fresh) => this.event.set(fresh) });
      },
      error: (err: Refusal) => {
        this.busy.set(false);
        this.panelAnswer.set(err.message);
        this.notices.show(err.message, 'warning');
      },
    });
  }

  follow() {
    this.notices.show(`You are following ${this.event()?.calendar_name}.`, 'success');
  }
}

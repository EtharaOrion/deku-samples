import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DecimalPipe, AsyncPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { catchError, switchMap } from 'rxjs/operators';
import { Api, AuthService, EventItem, CATEGORIES } from '../api';
import { PublicBarComponent } from '../chrome';
import { RegistrationPanelComponent, NotFoundEmbedComponent } from './bits';
import { IconDirective } from '../icons';
import { NoticeService } from '../notice';
import { themeFromHex, EventTheme } from '../theme';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [CommonModule, AsyncPipe, RouterLink, PublicBarComponent, IconDirective, RegistrationPanelComponent, NotFoundEmbedComponent],
  template: `
    @if (loading) {
      <app-public-bar />
      <main class="page wrap">
        <div class="skeleton" style="width:332px;aspect-ratio:1;border-radius:11px"></div>
        <div class="skeleton" style="height:52px;width:60%;margin-top:16px"></div>
        <div class="skeleton" style="height:24px;width:40%;margin-top:12px"></div>
        <div class="skeleton" style="height:160px;margin-top:24px"></div>
      </main>
    } @else if (!event) {
      <app-public-bar />
      <app-not-found-embed />
    } @else {
      <main class="event-root" [style]="themeVars()">
        <header class="bar">
          <a routerLink="/" class="brand" [style.color]="t.ink" aria-label="Deku home">
            <svg viewBox="0 0 133 134" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M66.5 0c3.4 30.5 26 53.1 66.5 67-40.5 13.9-63.1 36.5-66.5 67-3.4-30.5-26-53.1-66.5-67C40.5 53.1 63.1 30.5 66.5 0Z"/></svg>
            <span class="wordmark">Deku</span>
          </a>
          <span class="bar-time">{{ localTime }}</span>
          <nav class="bar-nav">
            <a routerLink="/discover" class="bar-link" [style.color]="t.inkSecondary">Discover Events</a>
            @if (account) {
              <a [routerLink]="account.role==='host' ? '/calendars' : '/home'" class="avatar" [style]="avatarStyle()">{{ initial(account.display_name) }}</a>
            } @else {
              <a routerLink="/login" [state]="{next: '/'+event.slug}" class="bar-link" [style.color]="t.ink">Sign In</a>
            }
          </nav>
        </header>

        <div class="wrap">
          <aside class="rail">
            <div class="cover">
              <div class="cover-blur" [style.background]="coverBg()"></div>
              <div class="cover-main" [style.background]="coverBg()">
                <span class="cover-word">{{ event.title }}</span>
              </div>
            </div>
            <div class="presented">
              <span class="avatar sm" [style]="avatarStyle()">{{ initial(presenterName) }}</span>
              <div class="presented-text">
                <span class="overline-lite">Presented by</span>
                <a [routerLink]="['/', calendarSlug]" class="presented-name">
                  {{ calendarName }} <span aria-hidden="true">›</span>
                </a>
              </div>
              <button type="button" class="follow" [style.color]="t.ink">Follow</button>
            </div>
          </aside>

          <section class="content">
            @if (event.state === 'cancelled') {
              <div class="notice-card">
                <h1 class="title">{{ event.title }}</h1>
                <p class="cancel-copy">This event has been cancelled.</p>
                <blockquote class="reason">{{ event.cancel_reason }}</blockquote>
              </div>
            } @else {
              <h1 class="title">{{ event.title }}</h1>
              <div class="when">
                <svg [appIcon]="'calendar'" [size]="20" [hue]="t.ink"></svg>
                <div>
                  <p class="when-main">{{ whenLocal }}</p>
                  @if (whenVisitor) { <p class="when-visitor">{{ whenVisitor }}</p> }
                </div>
              </div>
              <div class="where">
                <svg [appIcon]="'pin'" [size]="20" [hue]="t.ink"></svg>
                <p class="where-main">{{ event.city }}</p>
              </div>
              @if (event.description) { <p class="description">{{ event.description }}</p> }
            }
            <app-panel [event]="event" [reg]="event.my_registration" [signedIn]="(account$ | async) !== null" />
          </section>
        </div>
      </main>
    }
  `,
  styles: [`
    .event-root { min-height: 100vh; position: relative; }
    .bar { position: fixed; top:0; left:0; right:0; height:64px; z-index:200; display:flex; align-items:center; gap:24px; padding:0 24px; }
    .brand { display:inline-flex; align-items:center; gap:7px; }
    .wordmark { font-weight:700; letter-spacing:-0.02em; font-size:17px; line-height:22px; }
    .bar-time { font-size:13px; line-height:16px; opacity:.36; color: inherit; font-variant-numeric: tabular-nums; }
    .bar-nav { margin-left:auto; display:flex; align-items:center; gap:16px; }
    .bar-link { font-size:15px; line-height:22px; }
    .avatar { width:32px; height:32px; border-radius:100%; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; }
    .wrap { display:grid; grid-template-columns: 332px 568px; gap:48px; justify-content:center; padding: 112px 24px 64px; }
    .rail { display:flex; flex-direction:column; gap:20px; }
    .cover { position: relative; aspect-ratio: 1; border-radius: 11px; overflow: hidden; }
    .cover-main { position:absolute; inset:0; border-radius:11px; display:flex; align-items:flex-end; padding:16px;
                  transform: matrix(1.005,0,0,1.005,0,0); animation: nudge 1000ms linear infinite alternate; }
    .cover-blur { position:absolute; inset:-4%; filter: brightness(0.8) blur(24px) saturate(1.2); mix-blend-mode: multiply; opacity:.2; }
    .cover-word { color:#fff; font-size: 12%; font-weight:700; text-shadow: rgba(0,0,0,.2) 0 0 5px; }
    .presented { display:flex; align-items:center; gap:12px; }
    .avatar.sm { width:24px; height:24px; font-size:11px; box-shadow: rgba(0,15,58,0.08) 0 0 0 0.5px inset; }
    .presented-text { display:flex; flex-direction:column; }
    .overline-lite { font-size:11px; line-height:16px; opacity:.36; color:inherit; }
    .presented-name { font-size:16px; line-height:24px; font-weight:500; color:inherit; }
    .follow { margin-left:auto; border-radius:19px; padding:0 14px; min-height:32px; border:1px solid; font-size:13px; }
    .content { display:flex; flex-direction:column; gap:20px; }
    .title { font-family: var(--serif); font-size: 40px; line-height: 46px; font-weight: 400; }
    .when, .where { display:flex; gap:12px; align-items:flex-start; }
    .when-main, .where-main { font-size:16px; line-height:24px; }
    .when-visitor { font-size:13px; line-height:18px; opacity:.36; color:inherit; }
    .description { font-size:16px; line-height:25.6px; white-space: pre-line; }
    .notice-card { display:flex; flex-direction:column; gap:12px; }
    .cancel-copy { font-size:16px; line-height:24px; }
    .reason { margin:0; padding:12px 16px; border-left:3px solid; font-size:16px; line-height:24px; font-style: italic; }
    .page { padding: 96px 24px 64px; max-width: 1000px; margin: 0 auto; }
    @media (max-width: 999px) {
      .wrap { grid-template-columns: 1fr; gap:24px; }
      .title { font-size: 32px; line-height: 38px; }
    }
    @media (prefers-reduced-motion: reduce) { .cover-main { animation: none !important; } }
  `],
})
export class EventPageComponent implements OnInit, OnDestroy {
  loading = true;
  event: EventItem | null = null;
  t: EventTheme = themeFromHex('#146aeb');
  account: any = null;
  localTime = '';
  presenterName = '';
  calendarName = '';
  calendarSlug = '';
  private sub?: Subscription;
  private api = inject(Api);
  private auth = inject(AuthService);
  account$ = this.auth.account$;
  private route = inject(ActivatedRoute);
  private notice = inject(NoticeService);

  ngOnInit() {
    this.account = this.auth.accountValue;
    // Bootstrap the session if the service has not resolved yet, so the panel
    // can decide between "register" and "sign in to register".
    void this.auth.loadAccount();
    this.tick(); setInterval(() => this.tick(), 30000);
    this.sub = this.route.paramMap.pipe(
      switchMap(pm => {
        const slug = pm.get('slug') ?? '';
        return this.api.getEvent(slug).pipe(catchError(() => of(null)));
      })
    ).subscribe(e => {
      this.event = e as EventItem | null;
      if (e) {
        this.t = themeFromHex(e.theme_hex);
        this.calendarName = e.calendar?.name ?? '';
        this.calendarSlug = e.calendar?.slug ?? '';
        this.presenterName = e.calendar?.owner?.display_name ?? e.calendar?.name ?? '';
        if (e.theme_hex) this.applyEarlyTheme(e.theme_hex);
      }
      this.loading = false;
    });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  private tick() {
    const d = new Date();
    const off = -d.getTimezoneOffset();
    const s = off >= 0 ? '+' : '-', a = Math.abs(off);
    this.localTime = `${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} GMT${s}${Math.floor(a/60)}:${String(a%60).padStart(2,'0')}`;
  }

  /** Applies the theme colour to the document before paint. */
  private applyEarlyTheme(hex: string) {
    const th = themeFromHex(hex);
    const root = document.documentElement;
    root.style.setProperty('--event-ground', th.ground);
    root.style.setProperty('--event-ink', th.ink);
  }

  themeVars() {
    const s = this.t;
    return {
      background: s.ground,
      color: s.ink,
      '--t-ink': s.ink,
      '--t-ink-2': s.inkSecondary,
      '--t-hair': s.hairline,
      '--t-panel': s.panelFill,
      '--t-hex': s.hex,
    } as any;
  }
  avatarStyle() {
    return { background: this.t.ink, color: this.t.ground } as any;
  }
  initial(n: string) { return (n?.trim()?.[0] ?? '?').toUpperCase(); }

  get whenLocal(): string {
    if (!this.event) return '';
    return fmtInZone(this.event.starts_at, this.event.ends_at, this.event.time_zone);
  }
  get whenVisitor(): string | null {
    if (!this.event) return null;
    const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (visitorZone === this.event.time_zone) return null;
    return `${fmtInZone(this.event.starts_at, this.event.ends_at, visitorZone)} · your time`;
  }
  coverBg() {
    return `linear-gradient(135deg, ${this.t.hex}, ${mix(this.t.hex, '#000000', .25)})`;
  }
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

export function fmtInZone(starts: string, ends: string, zone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: zone,
  };
  const s = new Intl.DateTimeFormat('en-GB', opts).format(new Date(starts));
  const e = new Intl.DateTimeFormat('en-GB', { ...opts, weekday: undefined, day: undefined, month: undefined, year: undefined }).format(new Date(ends));
  return `${s} – ${e} ${zone.split('/').pop()?.replace('_', ' ')}`;
}

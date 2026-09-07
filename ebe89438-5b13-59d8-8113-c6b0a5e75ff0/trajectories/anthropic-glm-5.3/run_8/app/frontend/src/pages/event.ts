import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, EventSummary, MyRegistration } from '../api';
import { Toast } from '../domain';
import { Cover } from '../ui/cover';
import { Avatar, DateChip, Pill } from '../ui/bits';
import { Icon } from '../ui/icon';
import { inZone, visitorLine, zoneLine } from '../time';
import { NotFoundPage } from './notfound';
import { RegisterPanel } from './register-panel';

/**
 * The event page is the whole product: a poster for one particular evening.
 * The theme arrives in the first document from the server, so the page is
 * already wearing its colour before any data lands.
 */
@Component({
  selector: 'g-event-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'missing') {
      <g-not-found />
    } @else if (state() === 'loading') {
      <div class="event-skel" aria-hidden="true">
        <div class="skeleton skeleton-block"></div>
        <span class="skeleton skeleton-title"></span>
        <span class="skeleton skeleton-line"></span>
        <span class="skeleton skeleton-line" style="width: 70%"></span>
      </div>
    } @else if (ev()) {
      @if (ev(); as e) {
      <article class="event-page" [class.cancelled]="e.state === 'cancelled'" [style.--ev-key]="e.theme.key"
               [style.--ev-ground]="e.theme.ground" [style.--ev-ground-sunk]="e.theme.ground_sunk"
               [style.--ev-ink]="e.theme.ink" [style.--ev-ink-rgb]="inkRgb(e)">
        <div class="gradient-ground" aria-hidden="true"></div>
        <div class="columns">
          <aside class="rail">
            <g-cover [seed]="e.cover_seed" [title]="e.title" />
            <div class="presented row">
              <g-avatar [name]="e.calendar.owner.display_name" size="lg" />
              <div class="presented-text">
                <div class="t-overline presented-by">Presented by</div>
                <a class="calendar-link t-row" [routerLink]="['/', e.calendar.slug]">
                  {{ e.calendar.name }} <g-icon name="chevron-right" [size]="14" [colour]="'currentColor'" />
                </a>
              </div>
              <button class="btn btn-pill btn-sm follow" (click)="follow()">Follow</button>
            </div>
            <div class="city row t-row">
              <g-icon name="pin" [size]="16" />
              <span>{{ e.city }}</span>
            </div>
          </aside>

          <div class="content">
            <div class="badges row-wrap">
              <span class="pill"><span class="dot"></span>{{ e.calendar.name }}</span>
              @if (e.state === 'cancelled') {
                <g-pill word="Cancelled" tone="pill-danger" />
              } @else if (e.state === 'registration_closed') {
                <g-pill word="Registration closed" tone="pill-neutral" />
              } @else if (e.approval_required) {
                <g-pill word="Approval needed" tone="pill-info" />
              }
            </div>

            <h1 class="title t-display">{{ e.title }}</h1>

            <div class="when row">
              <g-date-chip [iso]="e.starts_at" />
              <div class="when-text">
                <div class="t-row">{{ zoneLine(e.starts_at, e.time_zone) }}</div>
                @if (visitorTime(e.starts_at); as v) {
                  <div class="t-caption visitor">{{ v }}</div>
                }
              </div>
            </div>

            @if (e.cancel_reason; as reason) {
              <div class="cancel-notice">
                <h2 class="t-h2">This event has been cancelled</h2>
                <p class="t-row">“{{ reason }}”</p>
              </div>
            } @else {
              <g-register-panel [event]="e" [registrationInput]="reg()" (changed)="reload()" />
            }

            @if (e.description) {
              <div class="longform t-longform">
                <h2 class="t-section">About this event</h2>
                <p [textContent]="e.description"></p>
              </div>
            }

            @if (isOwner()) {
              <div class="host-links row-wrap">
                <a class="btn btn-secondary btn-sm" [routerLink]="['/event', e.slug, 'manage', 'overview']">Manage event</a>
                <a class="btn btn-secondary btn-sm" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guest list</a>
              </div>
            }
          </div>
        </div>
      </article>
      }
    }
  `,
  imports: [Cover, Avatar, DateChip, Pill, Icon, RouterLink, NotFoundPage, RegisterPanel],
  styles: [`
    :host { display: block; }
    .event-skel { display: flex; flex-direction: column; gap: 16px; max-width: 568px; }
    .event-page {
      position: relative; color: var(--ev-ink, #000f3a); margin: 0 -24px; padding: 24px;
      animation: event-theme-fade 2000ms linear both;
    }
    @media (max-width: 650px) { .event-page { margin: 0 -16px; padding: 16px; } }
    .gradient-ground {
      position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: 0.9;
      background:
        radial-gradient(60vw 60vw at 3% -50%, var(--ev-ground, #fff), transparent 60%),
        radial-gradient(55vw 55vw at 140% -50%, var(--ev-ground-sunk, #fafafa), transparent 60%),
        radial-gradient(70vw 70vw at -50% 120%, var(--ev-ground-sunk, #fafafa), transparent 60%),
        radial-gradient(80vw 80vw at 62% 100%, var(--ev-ground, #fff), transparent 60%);
      animation: event-theme-fade 2000ms linear both;
    }
    .columns { display: grid; grid-template-columns: 332px 568px; gap: 48px; justify-content: center; }
    @media (max-width: 999px) {
      .columns { grid-template-columns: minmax(0, 568px); }
      .rail { max-width: 568px; }
    }
    .rail { display: flex; flex-direction: column; gap: 20px; }
    .presented { gap: 12px; }
    .presented-by { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.36); font-size: 11px; line-height: 16px; }
    .calendar-link { color: var(--ev-ink); text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 2px; }
    @media (hover: hover) { .calendar-link:hover { text-decoration: underline; } }
    .follow { margin-left: auto; }
    .city { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.64); }
    .content { min-width: 0; display: flex; flex-direction: column; gap: 24px; padding-bottom: 96px; }
    .badges { margin-top: 8px; }
    .title { font-size: 40px; line-height: 46px; letter-spacing: -0.01em; }
    @media (max-width: 999px) { .title { font-size: 32px; line-height: 38px; } }
    .when { gap: 16px; align-items: center; }
    .visitor { color: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.36); }
    .cancel-notice {
      border: 1px solid rgba(var(--ev-ink-rgb, 0, 15, 58), 0.08); border-radius: 12px;
      padding: 20px; display: flex; flex-direction: column; gap: 8px;
      background: rgba(var(--ev-ink-rgb, 0, 15, 58), 0.04);
    }
    .host-links { padding-bottom: 24px; }
    @keyframes event-theme-fade { from { opacity: 0.35; } to { opacity: 1; } }
  `],
})
export class EventPage {
  slug = input.required<string>();
  private api = inject(Api);
  private toast = inject(Toast);
  private router = inject(Router);

  state = signal<'loading' | 'ready' | 'missing'>('loading');
  ev = signal<EventSummary | null>(null);
  reg = signal<MyRegistration | null>(null);

  isOwner = computed(() => this.ev()?.is_owner === true);

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.load(slug);
    });
  }

  load(slug: string): void {
    // A return to a route already loaded never paints twice for the same data.
    if (!this.ev()) this.state.set('loading');
    this.api.event(slug).subscribe({
      next: (e) => {
        this.ev.set(e);
        this.reg.set((e.my_registration as MyRegistration) ?? null);
        this.state.set('ready');
      },
      error: (err) => {
        this.state.set(err.status === 404 ? 'missing' : 'ready');
        if (err.status !== 404) this.toast.show('We could not load this event. Try again in a moment.', 'danger');
      },
    });
  }

  reload(): void {
    this.load(this.slug());
  }

  zoneLine(iso: string, zone: string): string {
    return zoneLine(iso, zone);
  }

  visitorTime(iso: string): string | null {
    const e = this.ev();
    return e ? visitorLine(iso, e.time_zone) : null;
  }

  inkRgb(e: EventSummary): string {
    const ink = e.theme.ink;
    if (ink.startsWith('#')) {
      const h = ink.slice(1);
      return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
    }
    return '0, 15, 58';
  }

  follow(): void {
    this.toast.show('You are following this calendar.', 'success');
  }
}

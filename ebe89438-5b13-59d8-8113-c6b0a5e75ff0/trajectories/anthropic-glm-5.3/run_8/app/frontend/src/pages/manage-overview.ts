import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Api, EventSummary } from '../api';
import { Toast } from '../domain';
import { Icon } from '../ui/icon';
import { Dialog } from '../ui/dialog';
import { NotFoundPage } from './notfound';

/**
 * The dashboard: a masthead, four counters and the next three things to do.
 * Owning host only; anybody else meets the not-found page.
 */
@Component({
  selector: 'g-manage-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'missing') {
      <g-not-found />
    } @else {
      @if (loading) {
        <div class="stack" aria-hidden="true">
          <span class="skeleton skeleton-title"></span>
          <span class="skeleton skeleton-line"></span>
          <span class="skeleton skeleton-block"></span>
        </div>
      } @else {
        @if (ev(); as e) {
          <div class="wrap">
            <header class="head">
              <div class="row-wrap">
                <h1 class="t-h1">{{ e.title }}</h1>
                <span class="pill {{ stateTone(e.state) }}"><span class="dot"></span>{{ stateWord(e.state) }}</span>
              </div>
              <div class="address row">
                <g-icon name="link" [size]="16" />
                <span class="t-caption slug">/{{ e.slug }}</span>
                <button class="btn btn-quiet btn-sm" (click)="copy(e.slug)">Copy Link</button>
              </div>
            </header>

            @if (e.state === 'cancelled' && e.cancel_reason; as reason) {
              <div class="cancel card card-lg">
                <h2 class="t-h2">This event has been cancelled</h2>
                <p class="t-row">“{{ reason }}”</p>
              </div>
            } @else {
              <div class="counters">
                <div class="counter">
                  <span class="t-overline muted">Confirmed</span>
                  <span class="num">{{ e.confirmed_count }} <span class="of">of {{ e.capacity }}</span></span>
                </div>
                <div class="counter">
                  <span class="t-overline muted">Waiting</span>
                  <span class="num">{{ e.waitlist_count ?? 0 }}</span>
                </div>
                <div class="counter">
                  <span class="t-overline muted">Awaiting approval</span>
                  <span class="num">{{ e.pending_count ?? 0 }}</span>
                </div>
                <div class="counter">
                  <span class="t-overline muted">Arrived</span>
                  <span class="num">{{ e.arrived_count ?? 0 }}</span>
                </div>
              </div>

              <section class="todo card">
                <h2 class="t-overline">Next up</h2>
                <ul class="stack">
                  @for (item of todos(); track item.label) {
                    <li class="row todo-item">
                      <g-icon [name]="item.icon" [size]="18" />
                      <span class="t-row">{{ item.label }}</span>
                      <a class="btn btn-secondary btn-sm go" [routerLink]="item.link">{{ item.action }}</a>
                    </li>
                  } @empty {
                    <li class="t-row secondary">Nothing waiting. Share the link and guests will appear.</li>
                  }
                </ul>
              </section>
            }

            <nav class="row-wrap">
              <a class="btn btn-secondary" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guest list, queue and door</a>
              <a class="btn btn-secondary" [routerLink]="['/event', e.slug, 'manage', 'registration']">Capacity and approval</a>
              <a class="btn btn-quiet" [routerLink]="['/', e.slug]">View public page</a>
            </nav>

            @if (e.state !== 'cancelled') {
              <button class="btn btn-danger btn-sm" (click)="cancelOpen.set(true)">Cancel this event</button>
            }
          </div>

          @if (cancelOpen()) {
            <g-dialog title="Cancel this event" [danger]="true" (closed)="cancelOpen.set(false)">
              <p>This mails every guest still holding a place with your reason, word for word. It cannot be undone.</p>
              <label class="field">
                <span>Reason</span>
                <input type="text" [(ngModel)]="reason" name="reason" placeholder="Tell guests why" />
                <span class="field-hint">Your words are mailed exactly as typed.</span>
              </label>
              <div class="dialog-actions">
                <button class="btn btn-secondary btn-sm" (click)="cancelOpen.set(false)">Keep the event</button>
                <button class="btn btn-danger btn-sm" (click)="doCancel(e)" [disabled]="!reason.trim()">Cancel event</button>
              </div>
            </g-dialog>
          }
        }
      }
    }
  `,
  imports: [RouterLink, FormsModule, Icon, Dialog, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 24px; }
    .head { display: flex; flex-direction: column; gap: 12px; }
    .address { gap: 8px; flex-wrap: wrap; }
    .slug { color: var(--muted); }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 999px) { .counters { grid-template-columns: repeat(2, 1fr); } }
    .counter { display: flex; flex-direction: column; gap: 8px; }
    .num { font-size: 22px; line-height: 26px; font-weight: 700; }
    .of { font-size: 13px; font-weight: 500; color: var(--muted); }
    .todo { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .todo-item { gap: 12px; flex-wrap: wrap; }
    .go { margin-left: auto; }
    .cancel { padding: 24px; display: flex; flex-direction: column; gap: 8px; }
    .secondary { color: var(--ink-64); }
  `],
})
export class ManageOverviewPage {
  slug = input.required<string>();
  private api = inject(Api);
  private toast = inject(Toast);

  ev = signal<EventSummary | null>(null);
  state = signal<'loading' | 'ready' | 'missing'>('loading');
  get loading(): boolean {
    return this.state() === 'loading';
  }
  cancelOpen = signal(false);
  reason = '';

  todos = computed(() => {
    const e = this.ev();
    if (!e) return [];
    const out: { label: string; icon: string; link: string; action: string }[] = [];
    if ((e.pending_count ?? 0) > 0) {
      out.push({ label: `${e.pending_count} request(s) waiting on you`, icon: 'list', link: `/event/${e.slug}/manage/guests`, action: 'Open queue' });
    }
    if ((e.waitlist_count ?? 0) > 0 && e.remaining > 0) {
      out.push({ label: `${e.waitlist_count} waiting, ${e.remaining} seat(s) free`, icon: 'door', link: `/event/${e.slug}/manage/registration`, action: 'Raise capacity' });
    }
    if (e.state === 'draft') {
      out.push({ label: 'This event is still a draft', icon: 'eye', link: `/event/${e.slug}/manage/registration`, action: 'Finish it' });
    }
    if (out.length === 0) {
      out.push({ label: 'Share the address and registrations will appear', icon: 'link', link: `/event/${e.slug}/manage/guests`, action: 'Guest list' });
    }
    return out;
  });

  constructor() {
    effect(() => { this.load(this.slug()); });
  }

  load(slug: string): void {
    this.api.event(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) {
          this.state.set('missing');
          return;
        }
        this.ev.set(e);
        this.state.set('ready');
      },
      error: () => this.state.set('missing'),
    });
  }

  stateWord(s: string): string {
    if (s === 'registration_closed') return 'Registration closed';
    if (s === 'published') return 'Published';
    if (s === 'draft') return 'Draft';
    return 'Cancelled';
  }

  stateTone(s: string): string {
    if (s === 'cancelled') return 'pill-danger';
    if (s === 'draft') return 'pill-warning';
    if (s === 'registration_closed') return 'pill-neutral';
    return 'pill-success';
  }

  copy(slug: string): void {
    const url = `${location.origin}/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast.show('The link is copied.', 'success'),
      () => this.toast.show(url, 'info'),
    );
  }

  doCancel(e: EventSummary): void {
    this.api.cancelEvent(e.slug, this.reason.trim()).subscribe({
      next: () => {
        this.cancelOpen.set(false);
        this.toast.show('Every guest has been mailed your reason.', 'success');
        this.load(e.slug);
      },
      error: (err) => this.toast.show(err?.error?.message ?? 'We could not cancel that event.', 'danger'),
    });
  }
}

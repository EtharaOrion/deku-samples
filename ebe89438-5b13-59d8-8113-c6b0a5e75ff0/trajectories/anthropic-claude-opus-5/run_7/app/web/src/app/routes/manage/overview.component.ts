import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ManageStore } from './manage.store';
import { NoticeService } from '../../core/notice.service';
import { eventStatePillClass, eventStateWord } from '../../models';
import { IconComponent } from '../../shared/icons.component';
import { formatRange } from '../../core/time';

/**
 * The dashboard: a masthead, four counters, the next three things to do, and
 * a link to each sister screen. A cancelled event replaces the counters with
 * the notice carrying the host's own reason.
 */
@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.ev(); as ev) {
      <header class="masthead">
        <div class="title-row">
          <h1 class="screen-title">{{ ev.title }}</h1>
          <span [class]="statePill(ev.state)">{{ stateWord(ev.state) }}</span>
        </div>
        <p class="caption tertiary when">{{ when(ev) }}</p>
        <div class="address">
          <a class="link" [routerLink]="['/', ev.slug]">{{ address(ev.slug) }}</a>
          <button type="button" class="btn btn-text btn-sm" (click)="copy(ev.slug)">
            <app-icon name="copy" [size]="16" />
            Copy Link
          </button>
        </div>
      </header>

      @if (ev.state === 'cancelled') {
        <section class="cancelled card" aria-label="Cancellation notice">
          <h2 class="longform-heading">This event has been cancelled</h2>
          <p class="reason">{{ ev.cancel_reason }}</p>
        </section>
      } @else {
        <ul class="counters">
          <li class="counter">
            <span class="value">{{ ev.confirmed_count }}<span class="of">/{{ ev.capacity }}</span></span>
            <span class="overline label">Confirmed</span>
          </li>
          <li class="counter">
            <span class="value">{{ waiting() }}</span>
            <span class="overline label">Waiting</span>
          </li>
          <li class="counter">
            <span class="value">{{ pending() }}</span>
            <span class="overline label">Awaiting Approval</span>
          </li>
          <li class="counter">
            <span class="value">{{ arrived() }}</span>
            <span class="overline label">Arrived</span>
          </li>
        </ul>

        <section class="todo" aria-labelledby="todo-h">
          <h2 id="todo-h" class="longform-heading">Next</h2>
          <ol class="todo-list">
            @for (t of todos(); track t) { <li class="list-row">{{ t }}</li> }
          </ol>
        </section>
      }

      <nav class="sisters" aria-label="Related screens">
        <a class="card card-lift sister" [routerLink]="['/event', ev.slug, 'manage', 'guests']">
          <span class="card-title">Guests, queue and door</span>
          <app-icon name="chevron-right" [size]="18" />
        </a>
        <a class="card card-lift sister" [routerLink]="['/event', ev.slug, 'manage', 'registration']">
          <span class="card-title">Capacity and approval</span>
          <app-icon name="chevron-right" [size]="18" />
        </a>
      </nav>
    }
  `,
  styles: [`
    .masthead { margin-bottom: var(--s5); }
    .title-row { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
    .when { margin-top: var(--s1); }
    .address { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2);
      flex-wrap: wrap; }
    .link { font-size: 14px; }
    .counters { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3); }
    @media (min-width: 650px) { .counters { grid-template-columns: repeat(4, 1fr); } }
    .counter {
      padding: var(--s4); border: 1px solid var(--ink-hairline);
      border-radius: var(--r-card); display: flex; flex-direction: column; gap: var(--s1);
    }
    .value { font-size: 22px; line-height: 26px; font-weight: 700; }
    .of { color: var(--ink-tertiary); font-weight: 400; }
    .label { color: var(--ink-secondary); }
    .todo { margin-top: var(--s6); }
    .todo-list { margin-top: var(--s2); display: flex; flex-direction: column; gap: var(--s1); }
    .todo-list li { color: var(--ink-secondary); }
    .cancelled { padding: var(--s4); border-color: rgba(255, 59, 48, 0.4); }
    .reason { margin-top: var(--s2); color: var(--ink-secondary); }
    .sisters { display: grid; grid-template-columns: 1fr; gap: var(--s3); margin-top: var(--s6); }
    @media (min-width: 650px) { .sisters { grid-template-columns: repeat(2, 1fr); } }
    .sister { display: flex; align-items: center; justify-content: space-between;
      gap: var(--s3); padding: var(--s4); color: inherit; }
    .sister:hover { color: inherit; }
  `],
})
export class ManageOverviewComponent {
  store = inject(ManageStore);
  private notices = inject(NoticeService);

  stateWord = eventStateWord;
  statePill = eventStatePillClass;

  waiting = computed(() => this.store.guests().filter((g) => g.status === 'waitlisted').length);
  pending = computed(() => this.store.guests().filter((g) => g.status === 'pending_approval').length);
  arrived = computed(() => this.store.guests().filter((g) => g.status === 'checked_in').length);

  when(ev: { starts_at: string; ends_at: string; time_zone: string }) {
    return formatRange(ev.starts_at, ev.ends_at, ev.time_zone);
  }

  address(slug: string) { return `${window.location.origin}/${slug}`; }

  copy(slug: string) {
    const url = this.address(slug);
    navigator.clipboard?.writeText(url).then(
      () => this.notices.show('Link copied.', 'success'),
      () => this.notices.show(`Copy this address: ${url}`, 'info'),
    );
  }

  /** The next three things to do, read from the guest list as it stands. */
  todos = computed<string[]>(() => {
    const ev = this.store.ev();
    if (!ev) return [];
    const out: string[] = [];
    if (this.pending() > 0) {
      out.push(`${this.pending()} ${this.pending() === 1 ? 'request is' : 'requests are'} waiting on your decision.`);
    }
    if ((ev.remaining ?? 0) === 0 && this.waiting() > 0) {
      out.push(`${this.waiting()} on the waiting list. Raising capacity seats them at once.`);
    }
    if (ev.state === 'published' && this.store.guests().length === 0) {
      out.push('Share your event link and registrations will appear here.');
    }
    if (this.arrived() > 0) {
      out.push(`${this.arrived()} ${this.arrived() === 1 ? 'guest has' : 'guests have'} arrived.`);
    }
    if (out.length === 0) out.push('Nothing needs your attention right now.');
    return out.slice(0, 3);
  });
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, EventSummary, RegistrationRow } from '../api';
import { Toast, statusWord } from '../domain';
import { Icon } from '../ui/icon';
import { NotFoundPage } from './notfound';
import { zoneLine } from '../time';

/**
 * The guest list, the approval queue and the door: three panels sharing one
 * table. Only the rows the window shows are drawn.
 */
@Component({
  selector: 'g-manage-guests',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'missing') { <g-not-found />
    } @else if (ev()) {
      @if (ev(); as e) {
      <div class="wrap">
        <header class="head spread">
          <div>
            <h1 class="t-h1">Guests</h1>
            <a class="t-caption back" [routerLink]="['/event', e.slug, 'manage', 'overview']">← {{ e.title }}</a>
          </div>
          <div class="row-wrap">
            <a class="btn btn-secondary btn-sm" [routerLink]="['/event', e.slug, 'manage', 'registration']">Registration settings</a>
            <button class="btn btn-secondary btn-sm" (click)="exportCsv(e)">
              <g-icon name="download" [size]="16" /> Export CSV
            </button>
          </div>
        </header>

        <section class="card panel">
          <h2 class="t-overline">Approval queue</h2>
          @if (queue().length === 0) {
            <p class="t-row secondary">Nothing is waiting on you.</p>
          } @else {
            <ul class="rows">
              @for (r of queue(); track r.id) {
                <li class="row-item spread">
                  <div class="who">
                    <span class="t-row strong">{{ r.display_name }}</span>
                    <span class="t-caption muted">{{ r.email }}</span>
                  </div>
                  <div class="row">
                    <button class="btn btn-secondary btn-sm" (click)="decide(r, 'approve')" [disabled]="busy()">Approve</button>
                    <button class="btn btn-quiet btn-sm" (click)="decide(r, 'decline')" [disabled]="busy()">Decline</button>
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <section class="card panel">
          <div class="spread toolbar">
            <h2 class="t-overline">Guest list</h2>
            <label class="row filter">
              <span class="sr-only">Filter by status</span>
              <select [value]="filter()" (change)="filter.set($any($event.target).value)">
                <option value="">All statuses</option>
                @for (s of statuses; track s) { <option [value]="s">{{ statusWord(s).word }}</option> }
              </select>
            </label>
          </div>

          @if (rows().length === 0) {
            <div class="empty">
              <h2>No Guests Yet</h2>
              <p>Share your event link and registrations will appear here.</p>
              <button class="btn btn-primary" (click)="copy(e.slug)">Copy Link</button>
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Ticket</th></tr>
                </thead>
                <tbody>
                  @for (r of visible(); track r.id) {
                    <tr>
                      <td>{{ r.display_name }}</td>
                      <td class="muted">{{ r.email }}</td>
                      <td><span class="pill {{ statusWord(r.status).tone }}"><span class="dot"></span>{{ statusWord(r.status).word }}</span></td>
                      <td>{{ r.waitlist_position ?? '—' }}</td>
                      <td><span class="t-code">{{ r.ticket_code || '—' }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (hasMore()) {
                <button class="btn btn-quiet btn-sm more" (click)="showMore()" [attr.aria-expanded]="'true'">
                  Show more guests ({{ rows().length - shown() }} hidden)
                </button>
              }
            </div>
          }
        </section>

        <section class="card panel">
          <h2 class="t-overline">The door</h2>
          <form class="door row" (submit)="checkIn($event)">
            <label class="field grow">
              <span class="sr-only">Ticket code</span>
              <input type="text" [value]="doorCode()" (input)="doorCode.set($any($event.target).value.toUpperCase())"
                     placeholder="TKT-" class="t-code" aria-label="Ticket code" />
            </label>
            <button class="btn btn-primary btn-sm" type="submit" [disabled]="busy() || !doorCode()">
              @if (doorWorking()) { <span class="rotator"></span> } Check In
            </button>
          </form>
          <div class="door-answer" role="status" aria-live="polite">
            @if (doorAnswer(); as a) { <p class="t-row">{{ a }}</p> }
          </div>
        </section>
      </div>
      }
    }
  `,
  imports: [RouterLink, FormsModule, Icon, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 16px; }
    .back { color: var(--muted); text-decoration: none; }
    @media (hover: hover) { .back:hover { text-decoration: underline; } }
    .panel { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .rows { list-style: none; margin: 0; padding: 0; }
    .row-item { padding: 10px 0; border-bottom: 1px solid var(--divider); flex-wrap: wrap; gap: 12px; }
    .row-item:last-child { border-bottom: 0; }
    .who { display: flex; flex-direction: column; }
    .strong { font-weight: 500; }
    .secondary { color: var(--ink-64); }
    .table-wrap { overflow-x: auto; }
    .door { gap: 12px; }
    .door-answer { min-height: 24px; }
    .more { align-self: flex-start; }
    .filter select { min-height: 36px; padding: 6px 10px; }
    @media (max-width: 649px) { .table th:nth-child(2), .table td:nth-child(2) { display: none; } }
  `],
})
export class ManageGuestsPage {
  slug = input.required<string>();
  private api = inject(Api);
  private toast = inject(Toast);
  statusWord = statusWord;
  statuses = ['pending_approval', 'confirmed', 'waitlisted', 'checked_in', 'declined', 'cancelled_by_guest', 'cancelled_by_host'];

  ev = signal<EventSummary | null>(null);
  rows = signal<RegistrationRow[]>([]);
  state = signal<'loading' | 'ready' | 'missing'>('loading');
  filter = signal('');
  busy = signal(false);
  doorCode = signal('');
  doorWorking = signal(false);
  doorAnswer = signal<string | null>(null);
  private shownCount = signal(40);

  queue = computed(() => this.rows().filter((r) => r.status === 'pending_approval'));
  visible = computed(() => {
    const f = this.filter();
    const rows = f ? this.rows().filter((r) => r.status === f) : this.rows();
    return rows.slice(0, this.shownCount());
  });
  hasMore = computed(() => {
    const f = this.filter();
    const total = (f ? this.rows().filter((r) => r.status === f) : this.rows()).length;
    return total > this.shownCount();
  });
  shown = this.shownCount;

  constructor() {
    effect(() => { this.load(this.slug()); });
  }

  load(slug: string): void {
    this.api.event(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) { this.state.set('missing'); return; }
        this.ev.set(e);
        this.api.guestList(slug).subscribe((rows) => this.rows.set(rows));
        this.state.set('ready');
      },
      error: () => this.state.set('missing'),
    });
  }

  showMore(): void {
    this.shownCount.update((n) => n + 60);
  }

  decide(r: RegistrationRow, action: 'approve' | 'decline'): void {
    this.busy.set(true);
    const call = action === 'approve' ? this.api.approve(r.id) : this.api.decline(r.id);
    call.subscribe({
      next: (res) => {
        this.busy.set(false);
        if (action === 'approve' && res.status === 'waitlisted') {
          this.toast.show('The room is full, so this guest has taken a waiting-list place instead.', 'warning');
        } else if (action === 'approve') {
          this.toast.show(`${r.display_name} is confirmed.`, 'success');
        } else {
          this.toast.show(`${r.display_name} was declined.`, 'info');
        }
        this.load(this.slug());
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'That did not go through. Try again.', 'danger');
      },
    });
  }

  checkIn(e: Event): void {
    e.preventDefault();
    const code = this.doorCode().trim();
    if (!code) return;
    this.doorWorking.set(true);
    this.doorAnswer.set(null);
    this.api.checkIn(code).subscribe({
      next: (res) => {
        this.doorWorking.set(false);
        if (res.already_checked_in) {
          this.doorAnswer.set(`Already arrived at ${zoneLine(res.checked_in_at ?? new Date().toISOString(), 'UTC')}.`);
        } else {
          this.doorAnswer.set(`Checked in at ${zoneLine(res.checked_in_at ?? new Date().toISOString(), 'UTC')}.`);
        }
        this.load(this.slug());
      },
      error: (err) => {
        this.doorWorking.set(false);
        this.doorAnswer.set(err?.error?.message ?? 'We could not find that ticket. Check the code and try again.');
      },
    });
  }

  copy(slug: string): void {
    const url = `${location.origin}/${slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast.show('The link is copied.', 'success'),
      () => this.toast.show(url, 'info'),
    );
  }

  exportCsv(e: EventSummary): void {
    window.open(`/api/events/${e.slug}/registrations.csv`, '_blank');
    this.toast.show('The guest list is downloading as a CSV file.', 'success');
  }
}

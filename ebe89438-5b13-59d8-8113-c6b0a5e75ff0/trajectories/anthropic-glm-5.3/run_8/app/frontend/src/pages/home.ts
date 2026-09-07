import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, MyRegistrationFull } from '../api';
import { Toast, statusWord } from '../domain';
import { Cover } from '../ui/cover';
import { Icon } from '../ui/icon';
import { Dialog } from '../ui/dialog';
import { inZone } from '../time';

/** The guest's registrations: Upcoming first, Past second. */
@Component({
  selector: 'g-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1 class="t-h1">My events</h1>
      <p class="t-row secondary">Your seats, waiting-list places and requests, in one place.</p>

      @if (loading()) {
        <div class="stack" aria-hidden="true">
          @for (i of [1,2,3]; track i) { <span class="skeleton skeleton-row"></span> }
        </div>
      } @else if (mine().length === 0) {
        <div class="empty card card-lg">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        @if (upcoming().length) {
          <section class="group">
            <h2 class="t-overline">Upcoming</h2>
            <ul class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row-item">
                  <a class="cover-link" [routerLink]="['/', r.event.slug]" [attr.aria-label]="r.event.title">
                    <g-cover [seed]="r.event.cover_seed" [title]="r.event.title" [compact]="true" [showTitle]="false" />
                  </a>
                  <div class="info">
                    <a class="t-row title" [routerLink]="['/', r.event.slug]">{{ r.event.title }}</a>
                    <span class="t-caption muted">{{ when(r) }}</span>
                  </div>
                  <span class="pill {{ statusWord(r.status).tone }}"><span class="dot"></span>{{ statusWord(r.status).word }}</span>
                  <div class="trailing">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn-secondary btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button class="btn btn-quiet btn-sm" (click)="askCancel(r)">Cancel seat</button>
                    } @else if (r.status === 'waitlisted') {
                      <button class="btn btn-quiet btn-sm" (click)="askCancel(r)">Leave Waiting List</button>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (past().length) {
          <section class="group">
            <h2 class="t-overline">Past</h2>
            <ul class="rows">
              @for (r of past(); track r.id) {
                <li class="row-item">
                  <g-cover [seed]="r.event.cover_seed" [showTitle]="false" [compact]="true" />
                  <div class="info">
                    <span class="t-row title">{{ r.event.title }}</span>
                    <span class="t-caption muted">{{ when(r) }}</span>
                  </div>
                  <span class="pill {{ statusWord(r.status).tone }}"><span class="dot"></span>{{ statusWord(r.status).word }}</span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>

    @if (cancelling(); as r) {
      <g-dialog title="Cancel your place" [danger]="true" (closed)="cancelling.set(null)">
        <p>This frees your seat at “{{ r.event.title }}” at once and offers it to the head of the waiting list.</p>
        <div class="dialog-actions">
          <button class="btn btn-secondary btn-sm" (click)="cancelling.set(null)">Keep my place</button>
          <button class="btn btn-danger btn-sm" (click)="confirmCancel(r)">Cancel my place</button>
        </div>
      </g-dialog>
    }
  `,
  imports: [RouterLink, Cover, Icon, Dialog],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 24px; }
    .secondary { color: var(--ink-64); }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .row-item { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--divider); flex-wrap: wrap; }
    .row-item:last-child { border-bottom: 0; }
    .cover-link { width: 44px; height: 44px; flex: none; display: block; }
    .info { display: flex; flex-direction: column; gap: 2px; min-width: 180px; flex: 1; }
    .title { font-weight: 500; color: inherit; text-decoration: none; }
    @media (hover: hover) { .title:hover { text-decoration: underline; } }
    .trailing { display: flex; gap: 8px; margin-left: auto; }
  `],
})
export class HomePage {
  private api = inject(Api);
  private toast = inject(Toast);
  statusWord = statusWord;

  mine = signal<MyRegistrationFull[]>([]);
  loading = signal(true);
  cancelling = signal<MyRegistrationFull | null>(null);
  working = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.api.myRegistrations().subscribe({
      next: (rows) => {
        this.mine.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  upcoming(): MyRegistrationFull[] {
    return this.mine().filter((r) => !r.event.ended && ['confirmed', 'checked_in', 'waitlisted', 'pending_approval'].includes(r.status));
  }

  past(): MyRegistrationFull[] {
    return this.mine().filter((r) => r.event.ended || ['declined', 'cancelled_by_guest', 'cancelled_by_host'].includes(r.status));
  }

  when(r: MyRegistrationFull): string {
    return `${inZone(r.event.starts_at, r.event.time_zone)} · ${r.event.city}`;
  }

  askCancel(r: MyRegistrationFull): void {
    this.cancelling.set(r);
  }

  confirmCancel(r: MyRegistrationFull): void {
    if (this.working()) return;
    this.working.set(true);
    this.api.cancelRegistration(r.id).subscribe({
      next: (res) => {
        this.working.set(false);
        this.cancelling.set(null);
        this.toast.show(`Your place at ${r.event.title} is released.`, 'success');
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.cancelling.set(null);
        this.toast.show(err?.error?.message ?? 'We could not cancel that place. Try again in a moment.', 'danger');
      },
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import {
  MyRegistration,
  STATUS_TONES,
  STATUS_WORDS,
} from '../core/models';
import { Notices } from '../core/notices';
import { dateTimeInZone } from '../core/time';
import { CoverComponent } from '../ui/cover';
import {
  DialogComponent,
  EmptyStateComponent,
  PillComponent,
  SkeletonComponent,
} from '../ui/kit';

/** Two groups, Upcoming first and Past second. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    CoverComponent,
    PillComponent,
    SkeletonComponent,
    EmptyStateComponent,
    DialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="screen-title">Your registrations</h1>

    @if (loading()) {
      <ul class="rows">
        @for (n of [1, 2, 3]; track n) {
          <li class="row">
            <app-skeleton width="44px" height="44px" radius="8px"></app-skeleton>
            <div class="grow">
              <app-skeleton height="15px" width="45%"></app-skeleton>
              <app-skeleton height="13px" width="30%"></app-skeleton>
            </div>
          </li>
        }
      </ul>
    } @else if (all().length === 0) {
      <app-empty-state
        heading="No Upcoming Events"
        body="Events you register for will appear here."
      >
        <a class="btn" routerLink="/discover">Discover Events</a>
      </app-empty-state>
    } @else {
      @if (upcoming().length) {
        <section aria-labelledby="upcoming-h">
          <h2 id="upcoming-h" class="group-title">Upcoming</h2>
          <ol class="rows">
            @for (r of upcoming(); track r.id) {
              <li class="row">
                <a class="thumb" [routerLink]="'/' + r.event_slug">
                  <app-cover [seed]="r.cover_seed" [title]="r.title" [showTitle]="false"></app-cover>
                </a>
                <span class="grow">
                  <a class="title" [routerLink]="'/' + r.event_slug">{{ r.title }}</a>
                  <span class="when">{{ when(r) }}</span>
                </span>
                <app-pill [word]="word(r)" [tone]="tone(r)"></app-pill>
                <span class="controls">
                  @if (r.status === 'confirmed' || r.status === 'checked_in') {
                    <a class="btn btn-sm" [routerLink]="'/t/' + r.ticket_code">View Ticket</a>
                    <button type="button" class="btn btn-sm" (click)="askCancel(r)">Cancel</button>
                  } @else if (r.status === 'waitlisted') {
                    <button type="button" class="btn btn-sm" (click)="askCancel(r)">
                      Leave Waiting List
                    </button>
                  } @else if (r.status === 'pending_approval') {
                    <button type="button" class="btn btn-sm" (click)="askCancel(r)">
                      Withdraw
                    </button>
                  }
                </span>
              </li>
            }
          </ol>
        </section>
      }

      @if (past().length) {
        <section aria-labelledby="past-h">
          <h2 id="past-h" class="group-title">Past</h2>
          <ol class="rows">
            @for (r of past(); track r.id) {
              <li class="row">
                <a class="thumb" [routerLink]="'/' + r.event_slug">
                  <app-cover [seed]="r.cover_seed" [title]="r.title" [showTitle]="false"></app-cover>
                </a>
                <span class="grow">
                  <a class="title" [routerLink]="'/' + r.event_slug">{{ r.title }}</a>
                  <span class="when">{{ when(r) }}</span>
                </span>
                <app-pill [word]="word(r)" [tone]="tone(r)"></app-pill>
                <span class="controls"></span>
              </li>
            }
          </ol>
        </section>
      }
    }

    @if (pending(); as p) {
      <app-dialog heading="Cancel this registration?" (closed)="pending.set(null)">
        <p class="dialog-body">
          Your seat at {{ p.title }} will be given to the next guest waiting, and you will
          need to register again to get it back.
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn" (click)="pending.set(null)">Keep My Place</button>
          <button type="button" class="btn btn-danger" (click)="confirmCancel()" [disabled]="working()">
            {{ working() ? 'Cancelling…' : 'Cancel Registration' }}
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      .screen-title { margin-bottom: 32px; }
      .group-title {
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        color: var(--ink-64);
        margin: 24px 0 8px;
        letter-spacing: 0.02em;
      }
      .rows { display: flex; flex-direction: column; }
      .row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider);
        font-size: 15px;
        line-height: 22px;
      }
      .thumb {
        width: 44px;
        height: 44px;
        border-radius: var(--r-menu);
        overflow: hidden;
        flex: none;
        display: block;
      }
      .grow { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .title { color: var(--ink); font-weight: 500; }
      @media (hover: hover) { .title:hover { color: var(--blue); } }
      .when { font-size: 13px; line-height: 16px; color: var(--ink-64); }
      .controls { display: flex; gap: 8px; flex: none; }
      .dialog-body { font-size: 15px; line-height: 22px; color: var(--ink-64); margin-bottom: 24px; }
      .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
      @media (max-width: 649px) {
        .row { flex-wrap: wrap; }
        .controls { width: 100%; justify-content: flex-end; }
      }
    `,
  ],
})
export class HomeComponent implements OnDestroy {
  private api = inject(Api);
  private notices = inject(Notices);

  readonly all = signal<MyRegistration[]>([]);
  readonly loading = signal(true);
  readonly pending = signal<MyRegistration | null>(null);
  readonly working = signal(false);

  private controller = new AbortController();

  readonly upcoming = computed(() => this.all().filter((r) => !r.has_ended));
  readonly past = computed(() => this.all().filter((r) => r.has_ended));

  constructor() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api
      .myRegistrations(this.controller.signal)
      .then((rows) => {
        this.all.set(rows);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') this.loading.set(false);
      });
  }

  when(r: MyRegistration) {
    return `${dateTimeInZone(r.starts_at, r.time_zone)} · ${r.city}`;
  }

  word(r: MyRegistration) {
    return STATUS_WORDS[r.status];
  }

  tone(r: MyRegistration) {
    return STATUS_TONES[r.status];
  }

  askCancel(r: MyRegistration) {
    this.pending.set(r);
  }

  async confirmCancel() {
    const target = this.pending();
    if (!target) return;
    this.working.set(true);
    try {
      const updated = await this.api.cancelRegistration(target.id);
      // The row moves to its new status in place rather than vanishing.
      this.all.update((rows) =>
        rows.map((r) =>
          r.id === target.id
            ? { ...r, status: updated.status, ticket_code: null, waitlist_position: null }
            : r,
        ),
      );
      this.pending.set(null);
      this.notices.success('Your registration has been cancelled.');
    } catch (err) {
      this.notices.danger(
        err instanceof ApiError ? err.message : 'That did not go through.',
      );
    } finally {
      this.working.set(false);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

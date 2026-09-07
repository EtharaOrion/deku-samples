import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ApiFailure } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { NoticeService } from '../core/notice.service';
import { AppShellComponent } from '../ui/app-shell.component';
import { CoverComponent } from '../ui/cover.component';
import { PillComponent } from '../ui/pill.component';
import { DialogComponent } from '../ui/dialog.component';
import { EmptyStateComponent, SpinnerComponent } from '../ui/bits';
import { dayLine, hasPassed, timeLine, zoneAbbrev } from '../core/time';
import { STATUS_TONES, STATUS_WORDS, type MyRegistrationRow } from '../core/models';

/**
 * Two groups, Upcoming first and Past second, each an ordered list of rows at
 * 15/22 divided by hairlines. A confirmed row's cancel control opens the
 * confirmation dialog and, once confirmed, the row moves to its new status in
 * place rather than vanishing.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    AppShellComponent,
    CoverComponent,
    PillComponent,
    DialogComponent,
    EmptyStateComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title head">Your registrations</h1>

      @if (loading()) {
        <div class="stack" aria-busy="true">
          @for (n of [1, 2, 3]; track n) {
            <div class="skeleton row-skeleton"></div>
          }
        </div>
      } @else if (upcoming().length === 0 && past().length === 0) {
        <app-empty-state
          title="No Upcoming Events"
          body="Events you register for will appear here."
          actionLabel="Discover Events"
          actionLink="/discover"
        />
      } @else {
        <section class="group" aria-labelledby="grp-upcoming">
          <h2 class="t-overline group__head" id="grp-upcoming">Upcoming</h2>
          @if (upcoming().length === 0) {
            <app-empty-state
              title="No Upcoming Events"
              body="Events you register for will appear here."
              actionLabel="Discover Events"
              actionLink="/discover"
            />
          } @else {
            <ol class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row">
                  <span class="row__cover">
                    <app-cover
                      [seed]="r.cover_seed"
                      [showTitle]="false"
                      [radius]="'8px'"
                      [pixelSize]="44"
                    />
                  </span>
                  <a class="row__lines" [routerLink]="'/' + r.event_slug">
                    <span class="t-row row__title">{{ r.title }}</span>
                    <span class="t-caption row__when">{{ when(r) }}</span>
                  </a>
                  <span class="spacer"></span>
                  <app-pill [word]="word(r)" [tone]="tone(r)" />
                  <span class="row__controls">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn--sm" [routerLink]="'/t/' + r.ticket_code">View Ticket</a>
                      <button
                        type="button"
                        class="btn btn--sm"
                        (click)="askCancel(r)"
                        [disabled]="workingId() === r.id"
                      >
                        Cancel
                      </button>
                    } @else if (r.status === 'waitlisted') {
                      <button
                        type="button"
                        class="btn btn--sm"
                        (click)="leave(r)"
                        [disabled]="workingId() === r.id"
                      >
                        @if (workingId() === r.id) {
                          <app-spinner />
                        }
                        Leave Waiting List
                      </button>
                    } @else if (r.status === 'pending_approval') {
                      <button
                        type="button"
                        class="btn btn--sm"
                        (click)="leave(r)"
                        [disabled]="workingId() === r.id"
                      >
                        Withdraw
                      </button>
                    }
                  </span>
                </li>
              }
            </ol>
          }
        </section>

        @if (past().length > 0) {
          <section class="group" aria-labelledby="grp-past">
            <h2 class="t-overline group__head" id="grp-past">Past</h2>
            <ol class="rows">
              @for (r of past(); track r.id) {
                <li class="row">
                  <span class="row__cover">
                    <app-cover
                      [seed]="r.cover_seed"
                      [showTitle]="false"
                      [radius]="'8px'"
                      [pixelSize]="44"
                    />
                  </span>
                  <a class="row__lines" [routerLink]="'/' + r.event_slug">
                    <span class="t-row row__title">{{ r.title }}</span>
                    <span class="t-caption row__when">{{ when(r) }}</span>
                  </a>
                  <span class="spacer"></span>
                  <app-pill [word]="word(r)" [tone]="tone(r)" />
                </li>
              }
            </ol>
          </section>
        }
      }
    </app-shell>

    @if (pendingCancel(); as target) {
      <app-dialog heading="Cancel this registration?" (closed)="pendingCancel.set(null)">
        <p class="t-prose">
          Your seat at {{ target.title }} is released at once and passes to whoever is first on the
          waiting list. You can register again if a seat is free.
        </p>
        <div dialogActions>
          <button type="button" class="btn" (click)="pendingCancel.set(null)">Keep My Seat</button>
          <button type="button" class="btn btn--danger" (click)="confirmCancel(target)">
            Cancel Registration
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      .head { font-family: var(--serif); font-weight: 400; margin-bottom: var(--s5); }
      .group { display: flex; flex-direction: column; gap: var(--s2); margin-bottom: var(--s6); }
      .group__head { color: var(--ink-64); text-transform: uppercase; letter-spacing: 0.06em; }
      .rows { display: flex; flex-direction: column; }
      .row {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .row__cover { width: 44px; flex: none; }
      .row__lines { display: flex; flex-direction: column; min-width: 0; color: inherit; }
      .row__title { font-weight: 500; }
      .row__when { color: var(--muted); }
      .row__controls { display: flex; gap: var(--s2); flex-wrap: wrap; }
      .row-skeleton { height: 68px; margin-bottom: var(--s2); }
      @media (max-width: 483px) {
        .row { align-items: flex-start; }
        .row__controls { width: 100%; }
        .row__controls .btn { flex: 1; }
      }
    `,
  ],
})
export class HomePage implements OnInit {
  private api = inject(ApiService);
  private themeService = inject(ThemeService);
  private notices = inject(NoticeService);

  readonly rows = signal<MyRegistrationRow[]>([]);
  readonly loading = signal(true);
  readonly workingId = signal<number | null>(null);
  readonly pendingCancel = signal<MyRegistrationRow | null>(null);

  // Every row the guest holds stays on screen, so a cancelled registration
  // moves to its new status in place rather than vanishing.
  readonly upcoming = computed(() => this.rows().filter((r) => !hasPassed(r.ends_at)));
  readonly past = computed(() => this.rows().filter((r) => hasPassed(r.ends_at)));

  ngOnInit(): void {
    this.themeService.clear();
    this.load();
  }

  private load(): void {
    this.api.myRegistrations().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  when(r: MyRegistrationRow): string {
    if (!r.starts_at) return 'Date to be announced';
    return `${dayLine(r.starts_at, r.time_zone)}, ${timeLine(r.starts_at, r.time_zone)} ${zoneAbbrev(
      r.starts_at,
      r.time_zone,
    )}`;
  }

  word(r: MyRegistrationRow): string {
    return STATUS_WORDS[r.status];
  }

  tone(r: MyRegistrationRow): any {
    return STATUS_TONES[r.status];
  }

  askCancel(r: MyRegistrationRow): void {
    this.pendingCancel.set(r);
  }

  confirmCancel(r: MyRegistrationRow): void {
    this.pendingCancel.set(null);
    this.leave(r);
  }

  leave(r: MyRegistrationRow): void {
    this.workingId.set(r.id);
    this.api.cancelRegistration(r.id).subscribe({
      next: (updated) => {
        this.workingId.set(null);
        // The row moves to its new status in place rather than vanishing.
        this.rows.update((list) =>
          list.map((row) =>
            row.id === r.id
              ? { ...row, status: updated.status, ticket_code: null, waitlist_position: null }
              : row,
          ),
        );
        this.notices.show('Your place has been released.', 'info');
      },
      error: (e: ApiFailure) => {
        this.workingId.set(null);
        this.notices.refusal(e.message);
      },
    });
  }
}

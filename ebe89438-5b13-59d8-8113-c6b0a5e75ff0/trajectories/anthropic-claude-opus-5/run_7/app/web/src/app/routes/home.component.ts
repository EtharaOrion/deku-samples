import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { MyRegistration, statusPillClass, statusWord } from '../models';
import { formatInZone } from '../core/time';
import { ShellComponent } from '../shared/shell.component';
import { DialogComponent } from '../shared/dialog.component';
import {
  CoverComponent, EmptyStateComponent, SkeletonComponent,
} from '../shared/ui.components';
import { clearTheme } from '../core/theme';

/**
 * The guest's registrations, in two groups: Upcoming first and Past second.
 * A confirmed row's cancel control opens the confirmation dialog and, once
 * confirmed, the row moves to its new status in place rather than vanishing.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink, ShellComponent, DialogComponent, CoverComponent,
    EmptyStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <main id="main" class="page" role="main">
        <h1 class="screen-title">Your events</h1>

        @if (loading()) {
          <div class="rows">
            @for (i of [1,2,3]; track i) {
              <div class="row-skel">
                <app-skeleton w="44px" h="44px" radius="8px" />
                <app-skeleton w="40%" h="18px" />
              </div>
            }
          </div>
        } @else if (all().length === 0) {
          <app-empty-state
            heading="No Upcoming Events"
            body="Events you register for will appear here."
            actionLabel="Discover Events"
            actionLink="/discover" />
        } @else {
          @if (upcoming().length) {
            <section aria-labelledby="up-h">
              <h2 id="up-h" class="group-title overline">Upcoming</h2>
              <ol class="rows">
                @for (r of upcoming(); track r.id) {
                  <li class="row list-row">
                    <app-cover [seed]="r.cover_seed" [size]="44" radius="8px" />
                    <div class="main">
                      <a class="title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                      <p class="caption tertiary">{{ when(r) }}</p>
                    </div>
                    <span [class]="pill(r)">{{ word(r) }}</span>
                    <span class="trailing">
                      @if (r.status === 'confirmed' || r.status === 'checked_in') {
                        <a class="btn btn-secondary btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                        <button type="button" class="btn btn-text btn-sm" (click)="ask(r)">Cancel</button>
                      } @else if (r.status === 'waitlisted') {
                        <button type="button" class="btn btn-secondary btn-sm" (click)="ask(r)">
                          Leave Waiting List
                        </button>
                      } @else if (r.status === 'pending_approval') {
                        <button type="button" class="btn btn-text btn-sm" (click)="ask(r)">Withdraw</button>
                      }
                    </span>
                  </li>
                }
              </ol>
            </section>
          }

          @if (past().length) {
            <section aria-labelledby="past-h">
              <h2 id="past-h" class="group-title overline">Past</h2>
              <ol class="rows">
                @for (r of past(); track r.id) {
                  <li class="row list-row">
                    <app-cover [seed]="r.cover_seed" [size]="44" radius="8px" />
                    <div class="main">
                      <a class="title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                      <p class="caption tertiary">{{ when(r) }}</p>
                    </div>
                    <span [class]="pill(r)">{{ word(r) }}</span>
                    <span class="trailing"></span>
                  </li>
                }
              </ol>
            </section>
          }
        }
      </main>
    </app-shell>

    @if (pending(); as p) {
      <app-dialog [heading]="dialogHeading(p)" (closed)="pending.set(null)">
        <p>{{ dialogBody(p) }}</p>
        <ng-container dialogActions>
          <button type="button" class="btn btn-secondary" (click)="pending.set(null)">Keep it</button>
          <button type="button" class="btn btn-danger" (click)="confirmCancel(p)" [disabled]="working()">
            {{ dialogAction(p) }}
          </button>
        </ng-container>
      </app-dialog>
    }
  `,
  styles: [`
    .page { padding: var(--s6) var(--s5) var(--s8); max-width: 900px; }
    h1 { margin-bottom: var(--s5); }
    .group-title { color: var(--ink-tertiary); margin: var(--s5) 0 var(--s2); }
    .rows { display: flex; flex-direction: column; }
    .row {
      display: flex; align-items: center; gap: var(--s3);
      padding: var(--s3) 0; border-bottom: 1px solid var(--divider);
    }
    .row-skel { display: flex; gap: var(--s3); align-items: center; padding: var(--s3) 0; }
    .main { flex: 1; min-width: 0; }
    .title { color: var(--ink); font-weight: 500; }
    .trailing { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap;
      justify-content: flex-end; }
    @media (max-width: 649px) {
      .row { flex-wrap: wrap; }
      .trailing { width: 100%; justify-content: flex-start; }
    }
  `],
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  all = signal<MyRegistration[]>([]);
  loading = signal(true);
  pending = signal<MyRegistration | null>(null);
  working = signal(false);

  /** Rows that still hold a place, soonest first. */
  upcoming = computed(() => this.all().filter((r) => !r.has_ended && this.holds(r)));
  past = computed(() => this.all().filter((r) => r.has_ended || !this.holds(r)));

  private holds(r: MyRegistration) {
    return ['pending_approval', 'confirmed', 'waitlisted', 'checked_in'].includes(r.status);
  }

  ngOnInit() {
    clearTheme();
    this.load();
  }

  private load() {
    this.api.myRegistrations().subscribe({
      next: (rows) => { this.all.set(rows); this.loading.set(false); },
      error: () => { this.all.set([]); this.loading.set(false); },
    });
  }

  when(r: MyRegistration) { return formatInZone(r.starts_at, r.time_zone); }
  word(r: MyRegistration) { return statusWord(r.status); }
  pill(r: MyRegistration) { return statusPillClass(r.status); }

  ask(r: MyRegistration) { this.pending.set(r); }

  dialogHeading(r: MyRegistration) {
    if (r.status === 'waitlisted') return 'Leave this waiting list?';
    if (r.status === 'pending_approval') return 'Withdraw your request?';
    return 'Cancel your registration?';
  }

  /** A destructive dialog names what will happen in one sentence. */
  dialogBody(r: MyRegistration) {
    if (r.status === 'waitlisted') {
      return `You will lose your place on the waiting list for ${r.title}.`;
    }
    if (r.status === 'pending_approval') {
      return `Your request to join ${r.title} will be withdrawn.`;
    }
    return `Your seat at ${r.title} will be given to the first person waiting.`;
  }

  dialogAction(r: MyRegistration) {
    if (r.status === 'waitlisted') return 'Leave Waiting List';
    if (r.status === 'pending_approval') return 'Withdraw';
    return 'Cancel Registration';
  }

  confirmCancel(r: MyRegistration) {
    this.working.set(true);
    this.api.cancelRegistration(r.id).subscribe({
      next: (updated) => {
        this.working.set(false);
        this.pending.set(null);
        // The row moves to its new status in place rather than vanishing.
        this.all.update((rows) =>
          rows.map((x) => (x.id === r.id ? { ...x, ...updated } as MyRegistration : x)));
        this.notices.show('Your registration has been cancelled.', 'info');
      },
      error: (e: Refusal) => {
        this.working.set(false);
        this.pending.set(null);
        this.notices.show(e.message, 'danger');
      },
    });
  }
}

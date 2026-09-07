import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ApiError } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { statusLabel, statusTone, type Registration } from '../core/models';
import { formatInZone } from '../core/format';
import { clearTheme } from '../core/theme';
import { AppShellComponent } from '../ui/app-shell.component';
import { CoverComponent } from '../ui/cover.component';
import { DialogComponent } from '../ui/dialog.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, AppShellComponent, CoverComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title">Your Registrations</h1>

      @if (loading()) {
        <div class="rows">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton" style="height: 68px; margin-bottom: 12px"></div>
          }
        </div>
      } @else if (upcoming().length === 0 && past().length === 0) {
        <div class="empty-state">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <section class="group" aria-labelledby="grp-upcoming">
          <h2 id="grp-upcoming" class="t-section-heading">Upcoming</h2>
          @if (upcoming().length === 0) {
            <div class="empty-state">
              <h2>No Upcoming Events</h2>
              <p>Events you register for will appear here.</p>
              <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
            </div>
          } @else {
            <ol class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row t-row">
                  <span class="thumb"><app-cover [seed]="r.cover_seed || r.event_slug!" [title]="r.title!" radius="8px" [showTitle]="false" /></span>
                  <span class="main">
                    <a class="title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <span class="t-caption when">{{ when(r) }}</span>
                  </span>
                  <span class="pill" [class]="tone(r.status)">{{ label(r.status) }}</span>
                  <span class="trailing">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn-sm" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button type="button" class="btn btn-sm btn-text danger" (click)="ask(r)">Cancel</button>
                    } @else if (r.status === 'waitlisted') {
                      <button type="button" class="btn btn-sm" (click)="ask(r)">Leave Waiting List</button>
                    } @else if (r.status === 'pending_approval') {
                      <button type="button" class="btn btn-sm btn-text danger" (click)="ask(r)">Withdraw</button>
                    }
                  </span>
                </li>
              }
            </ol>
          }
        </section>

        @if (past().length) {
          <section class="group" aria-labelledby="grp-past">
            <h2 id="grp-past" class="t-section-heading">Past</h2>
            <ol class="rows">
              @for (r of past(); track r.id) {
                <li class="row t-row">
                  <span class="thumb"><app-cover [seed]="r.cover_seed || r.event_slug!" [title]="r.title!" radius="8px" [showTitle]="false" /></span>
                  <span class="main">
                    <a class="title" [routerLink]="['/', r.event_slug]">{{ r.title }}</a>
                    <span class="t-caption when">{{ when(r) }}</span>
                  </span>
                  <span class="pill" [class]="tone(r.status)">{{ label(r.status) }}</span>
                  <span class="trailing"></span>
                </li>
              }
            </ol>
          </section>
        }
      }
    </app-shell>

    @if (pending(); as target) {
      <app-dialog
        heading="Give up this place?"
        [blurb]="dialogBlurb()"
        (dismissed)="pending.set(null)"
      >
        <p class="t-body">{{ target.title }}</p>
        <ng-container dialogActions>
          <button type="button" class="btn" (click)="pending.set(null)">Keep It</button>
          <button type="button" class="btn btn-danger" (click)="confirmCancel()" [disabled]="working()">Yes, Cancel</button>
        </ng-container>
      </app-dialog>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s6);
      }
      .group {
        margin-bottom: var(--s7);
      }
      .group > h2 {
        margin-bottom: var(--s3);
      }
      .rows {
        display: flex;
        flex-direction: column;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
      }
      .thumb {
        width: 44px;
        flex: none;
      }
      .main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .title {
        font-weight: 500;
      }
      @media (hover: hover) {
        .title:hover {
          color: var(--blue);
        }
      }
      .when {
        color: var(--muted);
      }
      .trailing {
        display: flex;
        gap: var(--s2);
        align-items: center;
      }
      .danger {
        color: var(--danger);
      }
      @media (max-width: 649px) {
        .row {
          flex-wrap: wrap;
        }
        .trailing {
          width: 100%;
          justify-content: flex-end;
        }
      }
    `,
  ],
})
export class HomeComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly registrations = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly pending = signal<Registration | null>(null);
  readonly working = signal(false);

  readonly upcoming = computed(() =>
    this.registrations().filter((r) => !this.isPast(r) && !this.isDead(r)),
  );
  readonly past = computed(() => this.registrations().filter((r) => this.isPast(r) || this.isDead(r)));

  readonly dialogBlurb = computed(() => {
    const r = this.pending();
    if (!r) return '';
    if (r.status === 'confirmed' || r.status === 'checked_in')
      return 'Your seat is freed at once and passes to the head of that event’s waiting list.';
    if (r.status === 'waitlisted') return 'You leave the waiting list and everyone behind you moves up one place.';
    return 'Your request is withdrawn and the host will not see it in the queue.';
  });

  private isPast(r: Registration) {
    return !!r.ends_at && new Date(r.ends_at).getTime() < Date.now();
  }

  private isDead(r: Registration) {
    return ['cancelled_by_guest', 'cancelled_by_host', 'declined'].includes(r.status);
  }

  ngOnInit(): void {
    clearTheme();
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.registrations.set(await this.api.myRegistrations());
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  when(r: Registration) {
    return `${formatInZone(r.starts_at!, r.time_zone ?? 'UTC')} · ${r.time_zone}`;
  }

  label(s: Registration['status']) {
    return statusLabel(s);
  }

  tone(s: Registration['status']) {
    return statusTone(s);
  }

  ask(r: Registration) {
    this.pending.set(r);
  }

  async confirmCancel() {
    const target = this.pending();
    if (!target || this.working()) return;
    this.working.set(true);
    try {
      const updated = await this.api.cancelRegistration(target.id);
      // The row moves to its new status in place rather than vanishing.
      this.registrations.update((list) =>
        list.map((r) => (r.id === updated.id ? { ...r, ...updated, title: r.title, event_slug: r.event_slug } : r)),
      );
      this.notices.show('That place is given up. If anyone was waiting, the head of the list now has the seat.', 'success');
      this.pending.set(null);
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.working.set(false);
    }
  }
}

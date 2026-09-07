import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ApiError } from '../../core/api.service';
import { NoticeService } from '../../core/notice.service';
import { eventStateLabel, eventStateTone } from '../../core/models';
import { formatRange } from '../../core/format';
import { DialogComponent } from '../../ui/dialog.component';
import { IconComponent } from '../../ui/icons.component';
import { ManageStateService } from './manage-state.service';

@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [FormsModule, RouterLink, DialogComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.loading()) {
      <div class="skeleton" style="height: 40px; width: 60%"></div>
      <div class="skeleton" style="height: 120px; margin-top: 24px"></div>
    } @else if (state.event(); as ev) {
      <header class="masthead">
        <h1 class="t-screen-title">{{ ev.title }}</h1>
        <div class="meta">
          <span class="pill" [class]="stateTone()">{{ stateLabel() }}</span>
          <span class="t-caption when">{{ when() }}</span>
        </div>
        <div class="address">
          <a class="link t-caption" [routerLink]="['/', ev.slug]">{{ origin }}/{{ ev.slug }}</a>
          <button type="button" class="btn btn-sm" (click)="copyLink()">
            <app-icon name="copy" [size]="16" />
            Copy Link
          </button>
        </div>
      </header>

      @if (ev.state === 'cancelled') {
        <section class="notice-panel" role="status">
          <h2 class="t-section-heading">You called this event off</h2>
          <p class="t-longform reason">{{ ev.cancel_reason }}</p>
          <p class="t-caption">Every guest still holding a place was mailed these words. A cancellation cannot be undone.</p>
        </section>
      } @else {
        <ul class="counters">
          <li>
            <span class="figure t-screen-title">{{ ev.confirmed_count }} / {{ ev.capacity }}</span>
            <span class="t-overline">Confirmed</span>
          </li>
          <li>
            <span class="figure t-screen-title">{{ counts().waiting }}</span>
            <span class="t-overline">Waiting</span>
          </li>
          <li>
            <span class="figure t-screen-title">{{ counts().pending }}</span>
            <span class="t-overline">Awaiting Approval</span>
          </li>
          <li>
            <span class="figure t-screen-title">{{ counts().arrived }}</span>
            <span class="t-overline">Arrived</span>
          </li>
        </ul>

        <section class="todo">
          <h2 class="t-section-heading">Next three things</h2>
          <ol class="todo-list">
            @for (item of todo(); track item) {
              <li class="t-row">{{ item }}</li>
            }
          </ol>
        </section>
      }

      <section class="sisters">
        <a class="btn btn-sm" routerLink="../guests">Guests, queue and door</a>
        <a class="btn btn-sm" routerLink="../registration">Capacity and approval</a>
        @if (ev.state !== 'cancelled') {
          <button type="button" class="btn btn-sm btn-text danger" (click)="cancelOpen.set(true)">Cancel Event</button>
        }
      </section>
    }

    @if (cancelOpen()) {
      <app-dialog
        heading="Call this event off?"
        blurb="Every guest still holding a place is mailed your reason, word for word, and this cannot be undone."
        (dismissed)="cancelOpen.set(false)"
      >
        <div class="field">
          <label for="cancel-reason">Your reason</label>
          <textarea id="cancel-reason" [(ngModel)]="reason" placeholder="The venue lost its lease."></textarea>
        </div>
        <ng-container dialogActions>
          <button type="button" class="btn" (click)="cancelOpen.set(false)">Keep It</button>
          <button type="button" class="btn btn-danger" (click)="cancelEvent()" [disabled]="!reason.trim() || working()">
            Cancel This Event
          </button>
        </ng-container>
      </app-dialog>
    }
  `,
  styles: [
    `
      .masthead {
        margin-bottom: var(--s6);
      }
      .meta {
        display: flex;
        align-items: center;
        gap: var(--s3);
        margin-top: var(--s3);
        flex-wrap: wrap;
      }
      .when {
        color: var(--muted);
      }
      .address {
        display: flex;
        align-items: center;
        gap: var(--s3);
        margin-top: var(--s3);
        flex-wrap: wrap;
      }
      .link {
        color: var(--blue);
        word-break: break-all;
      }
      .counters {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--s4);
        margin-bottom: var(--s6);
      }
      @media (min-width: 650px) {
        .counters {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .counters li {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding: var(--s4);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-card);
      }
      .counters .t-overline {
        color: var(--muted);
      }
      .notice-panel {
        border: 1px solid var(--ink-08);
        border-left: 4px solid var(--danger);
        border-radius: var(--r-card);
        padding: var(--s5);
        margin-bottom: var(--s6);
      }
      .reason {
        margin: var(--s2) 0;
      }
      .notice-panel .t-caption {
        color: var(--muted);
      }
      .todo {
        margin-bottom: var(--s6);
      }
      .todo-list {
        list-style: decimal;
        padding-left: var(--s5);
        margin-top: var(--s3);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        color: var(--ink-64);
      }
      .sisters {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
      }
      .danger {
        color: var(--danger);
      }
    `,
  ],
})
export class ManageOverviewComponent {
  readonly state = inject(ManageStateService);
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly origin = typeof window !== 'undefined' ? window.location.origin : '';
  readonly cancelOpen = signal(false);
  readonly working = signal(false);
  reason = '';

  readonly counts = computed(() => {
    const g = this.state.guests();
    return {
      waiting: g.filter((r) => r.status === 'waitlisted').length,
      pending: g.filter((r) => r.status === 'pending_approval').length,
      arrived: g.filter((r) => r.status === 'checked_in').length,
    };
  });

  readonly stateLabel = computed(() => (this.state.event() ? eventStateLabel(this.state.event()!.state) : ''));
  readonly stateTone = computed(() => (this.state.event() ? eventStateTone(this.state.event()!.state) : ''));

  readonly when = computed(() => {
    const ev = this.state.event();
    return ev ? `${formatRange(ev.starts_at, ev.ends_at, ev.time_zone)} · ${ev.time_zone}` : '';
  });

  readonly todo = computed(() => {
    const ev = this.state.event();
    const c = this.counts();
    const out: string[] = [];
    if (!ev) return out;
    if (c.pending) out.push(`Work the queue: ${c.pending} ${c.pending === 1 ? 'request is' : 'requests are'} waiting on you.`);
    if (ev.state === 'draft') out.push('Publish this event: it needs a time, a place and a capacity.');
    if (ev.remaining === 0 && c.waiting) out.push(`Raise capacity to seat ${c.waiting} waiting.`);
    if (ev.state === 'registration_closed') out.push('Registration is closed. Reopen it when you are ready for more guests.');
    if (c.arrived === 0 && ev.confirmed_count > 0) out.push('Check tickets in at the door when the evening starts.');
    if (out.length < 3) out.push('Share the event link so the seats fill.');
    if (out.length < 3) out.push('Export the guest list before the door opens.');
    return out.slice(0, 3);
  });

  async copyLink() {
    const ev = this.state.event();
    if (!ev) return;
    const url = `${this.origin}/${ev.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notices.show('The event link is on your clipboard.', 'success');
    } catch {
      this.notices.show(`Copy this address by hand: ${url}`, 'info');
    }
  }

  async cancelEvent() {
    const ev = this.state.event();
    if (!ev || !this.reason.trim() || this.working()) return;
    this.working.set(true);
    try {
      await this.api.cancelEvent(ev.slug, this.reason.trim());
      await this.state.refresh();
      this.notices.show('The event is called off and every guest still holding a place has your words.', 'success');
      this.cancelOpen.set(false);
      this.reason = '';
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.working.set(false);
    }
  }
}

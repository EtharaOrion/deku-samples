import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { EventDetail, GuestRow } from '../../core/models';
import { NoticeService } from '../../core/notice.service';
import { formatRange } from '../../core/time';
import { DialogComponent } from '../../ui/dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PillComponent } from '../../ui/pill.component';
import { ShellComponent } from '../../ui/shell.component';
import { NotFoundComponent } from '../not-found.component';
import { ManageNavComponent } from './manage-nav.component';

@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ShellComponent,
    ManageNavComponent,
    PillComponent,
    IconComponent,
    DialogComponent,
    NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-shell>
        @if (loading()) {
          <div class="sk sk-title" style="height:32px;width:280px"></div>
          <div class="sk sk-line" style="width:180px"></div>
        } @else if (event(); as e) {
          <header class="masthead">
            <div class="titles">
              <h1 class="t-screen-title">{{ e.title }}</h1>
              <app-pill [eventState]="e.state" />
            </div>
            <div class="address">
              <span class="t-caption link">{{ publicUrl() }}</span>
              <button type="button" class="btn btn-text btn-sm" (click)="copyLink()">
                <app-icon name="copy" [size]="16" />
                <span>Copy Link</span>
              </button>
            </div>
          </header>

          <app-manage-nav [slug]="slug()" />

          @if (e.state === 'cancelled') {
            <section class="panel cancelled">
              <h2 class="t-section">You called this event off</h2>
              <p class="t-prose reason">{{ e.cancel_reason }}</p>
              <p class="t-caption muted">Every guest holding a place was mailed these words.</p>
            </section>
          } @else {
            <ul class="counters">
              <li>
                <span class="n">{{ e.confirmed_count }} / {{ e.capacity ?? '—' }}</span>
                <span class="t-overline lbl">Confirmed</span>
              </li>
              <li>
                <span class="n">{{ counts().waiting }}</span>
                <span class="t-overline lbl">Waiting</span>
              </li>
              <li>
                <span class="n">{{ counts().pending }}</span>
                <span class="t-overline lbl">Awaiting Approval</span>
              </li>
              <li>
                <span class="n">{{ counts().arrived }}</span>
                <span class="t-overline lbl">Arrived</span>
              </li>
            </ul>

            <section class="next" aria-labelledby="next-h">
              <h2 id="next-h" class="t-section">Next three things</h2>
              <ol class="todo">
                @for (t of todos(); track t) {
                  <li class="t-row">{{ t }}</li>
                }
              </ol>
            </section>
          }

          <section class="sisters" aria-labelledby="sisters-h">
            <h2 id="sisters-h" class="t-section">Elsewhere on this event</h2>
            <div class="links">
              <a class="btn btn-pill" [routerLink]="['/event', slug(), 'manage', 'guests']">Guests, queue and door</a>
              <a class="btn btn-pill" [routerLink]="['/event', slug(), 'manage', 'registration']">Capacity and approval</a>
              <a class="btn btn-pill" [routerLink]="['/', slug()]">See the public page</a>
            </div>
          </section>

          @if (e.state !== 'cancelled') {
            <section class="danger-zone">
              <h2 class="t-section">Call this event off</h2>
              <p class="t-caption muted">
                Every guest still holding a place is mailed your reason, word for word. This cannot be undone.
              </p>
              <button type="button" class="btn btn-danger btn-pill" (click)="cancelOpen.set(true)">
                Cancel Event
              </button>
            </section>
          }
        }
      </app-shell>

      @if (cancelOpen()) {
        <app-dialog heading="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p class="t-prose">
            Every guest holding a seat, a waiting-list place or a pending request is mailed the reason you type
            here, and the event moves to no other state afterwards.
          </p>
          <div class="field">
            <label for="reason">Your reason</label>
            <textarea id="reason" name="reason" [(ngModel)]="reason"></textarea>
          </div>
          @if (refusal()) {
            <p class="refusal">{{ refusal() }}</p>
          }
          <div class="dialog-actions">
            <button type="button" class="btn btn-pill" (click)="cancelOpen.set(false)">Keep The Event</button>
            <button
              type="button"
              class="btn btn-danger btn-pill"
              [disabled]="!reason.trim() || working()"
              (click)="doCancel()"
            >
              Cancel Event
            </button>
          </div>
        </app-dialog>
      }
    }
  `,
  styles: [
    `
      .masthead {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        margin-bottom: var(--s5);
      }
      .titles {
        display: flex;
        align-items: center;
        gap: var(--s3);
        flex-wrap: wrap;
      }
      .address {
        display: flex;
        align-items: center;
        gap: var(--s2);
        flex-wrap: wrap;
      }
      .link {
        color: var(--muted);
        font-family: var(--mono);
      }
      .counters {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--s4);
        margin-bottom: var(--s7);
      }
      @media (min-width: 650px) {
        .counters {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .counters li {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--s4);
        background: var(--paper-inset);
        border-radius: var(--r-card);
      }
      .n {
        font-size: 22px;
        line-height: 26px;
        font-weight: 700;
      }
      .lbl {
        color: var(--muted);
      }
      .next,
      .sisters,
      .danger-zone {
        margin-bottom: var(--s7);
      }
      .next h2,
      .sisters h2,
      .danger-zone h2 {
        margin-bottom: var(--s3);
      }
      .todo {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        list-style: decimal inside;
        color: var(--ink-64);
      }
      .links {
        display: flex;
        gap: var(--s2);
        flex-wrap: wrap;
      }
      .danger-zone {
        border-top: 1px solid var(--divider);
        padding-top: var(--s5);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--s3);
      }
      .muted {
        color: var(--muted);
        max-width: 520px;
      }
      .panel.cancelled {
        border-left: 4px solid #ff3b30;
        margin-bottom: var(--s7);
      }
      .reason {
        color: var(--ink-64);
        margin: var(--s2) 0;
      }
      .dialog-actions {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
        margin-top: var(--s4);
        flex-wrap: wrap;
      }
    `,
  ],
})
export class ManageOverviewComponent {
  slug = input.required<string>();

  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly cancelOpen = signal(false);
  readonly working = signal(false);
  readonly refusal = signal('');

  reason = '';
  private loaded = '';

  readonly publicUrl = computed(() => `${location.origin}/${this.slug()}`);

  readonly counts = computed(() => {
    const g = this.guests();
    return {
      waiting: g.filter((x) => x.status === 'waitlisted').length,
      pending: g.filter((x) => x.status === 'pending_approval').length,
      arrived: g.filter((x) => x.status === 'checked_in').length,
    };
  });

  readonly todos = computed(() => {
    const e = this.event();
    const c = this.counts();
    const out: string[] = [];
    if (!e) return out;
    if (c.pending) out.push(`Work the queue: ${c.pending} request${c.pending === 1 ? '' : 's'} awaiting your decision.`);
    if (e.state === 'draft') out.push('Fill in every publishing field so this event can go live.');
    if (c.waiting) out.push(`Raise capacity to seat ${c.waiting} waiting guest${c.waiting === 1 ? '' : 's'}.`);
    if (e.state === 'published') out.push('Share the link so more guests can find it.');
    out.push('Check tickets in at the door on the guests screen.');
    return out.slice(0, 3);
  });

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const slug = this.slug();
    if (this.loaded === slug) return;
    this.loaded = slug;
    try {
      const e = await this.api.event(slug);
      if (!e.is_owner) {
        this.missing.set(true);
        return;
      }
      this.event.set(e);
      this.guests.set(await this.api.guests(slug));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.publicUrl());
      this.notices.success('The address is on your clipboard.');
    } catch {
      this.notices.warn(`Copy this by hand: ${this.publicUrl()}`);
    }
  }

  async doCancel() {
    if (!this.reason.trim()) return;
    this.working.set(true);
    this.refusal.set('');
    try {
      const e = await this.api.cancelEvent(this.slug(), this.reason.trim());
      this.event.set({ ...this.event()!, ...e });
      this.cancelOpen.set(false);
      this.notices.success('The event is cancelled and every guest holding a place has been mailed.');
    } catch (err) {
      this.refusal.set((err as ApiError).message);
    } finally {
      this.working.set(false);
    }
  }

  when(e: EventDetail) {
    return formatRange(e.starts_at, e.ends_at, e.time_zone);
  }
}

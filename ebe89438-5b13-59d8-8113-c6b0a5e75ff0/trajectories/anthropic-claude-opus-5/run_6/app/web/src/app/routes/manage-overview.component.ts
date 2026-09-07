import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PillComponent } from '../ui/pill.component';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { EventDetail, GuestRow } from '../core/models';

@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [RouterLink, FormsModule, PillComponent],
  template: `
    <main id="main" class="col">
      @if (loading()) {
        <div class="skeleton skeleton-title" style="height:32px"></div>
        <div class="skeleton skeleton-text" style="width:40%"></div>
      }
      @if (!loading() && event(); as e) {
        <header class="head">
          <h1 class="t-screen-title">{{ e.title }}</h1>
          <app-pill [text]="stateWord(e.state)" [toneOverride]="stateTone(e.state)" />
        </header>

        <div class="address">
          <a class="link" [routerLink]="['/', e.slug]">{{ origin }}/{{ e.slug }}</a>
          <button type="button" class="btn btn-primary btn-sm" (click)="copyLink(e)">Copy Link</button>
        </div>

        @if (e.state === 'cancelled') {
          <section class="cancelled card">
            <h2 class="t-section">This event has been called off</h2>
            <p class="t-body">{{ e.cancel_reason }}</p>
          </section>
        } @else {
          <ul class="counters">
            <li><span class="n">{{ e.confirmed_count }}/{{ e.capacity ?? '-' }}</span>
                <span class="t-overline">Confirmed</span></li>
            <li><span class="n">{{ waiting() }}</span><span class="t-overline">Waiting</span></li>
            <li><span class="n">{{ pending() }}</span><span class="t-overline">Awaiting Approval</span></li>
            <li><span class="n">{{ arrived() }}</span><span class="t-overline">Arrived</span></li>
          </ul>

          <section class="todo">
            <h2 class="t-section">Next three things to do</h2>
            <ol class="t-row list">
              @for (t of todos(); track t) { <li>{{ t }}</li> }
            </ol>
          </section>
        }

        <nav class="sisters" aria-label="Event management">
          <a class="btn btn-primary" [routerLink]="['/event', e.slug, 'manage', 'guests']">Guests, queue and door</a>
          <a class="btn btn-primary" [routerLink]="['/event', e.slug, 'manage', 'registration']">Capacity and approval</a>
          @if (e.state !== 'cancelled') {
            <button type="button" class="btn btn-quiet" (click)="openCancel()">Cancel Event</button>
          }
        </nav>
      }
    </main>

    @if (cancelOpen()) {
      <div class="scrim" (click)="closeCancel()">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-event-title"
             (click)="$event.stopPropagation()">
          <h2 id="cancel-event-title">Call this event off?</h2>
          <p class="t-body">
            Everyone holding a place is emailed your reason, word for word, and the event stops
            taking registrations. This cannot be undone.
          </p>
          <label class="field" style="margin-top:16px">
            <span class="label">Why is it called off?</span>
            <textarea class="control" [(ngModel)]="reason" name="reason"
                      placeholder="The venue lost its lease."></textarea>
          </label>
          <div class="dialog-actions">
            <button type="button" class="btn btn-primary" (click)="closeCancel()">Keep Event</button>
            <button type="button" class="btn btn-danger" [disabled]="!reason.trim()"
                    (click)="doCancel()">Cancel Event</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .col { max-width: 800px; padding: 32px 24px 64px; }
    .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .address { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; flex-wrap: wrap; }
    .link { font-size: 15px; }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .counters li { display: flex; flex-direction: column; gap: 4px; }
    .n { font-size: 22px; line-height: 26px; font-weight: 700; }
    .t-overline { color: var(--ink-64); }
    .todo { margin-bottom: 32px; }
    .todo h2 { margin-bottom: 8px; }
    .list { list-style: decimal; padding-left: 20px; color: var(--ink-64); }
    .sisters { display: flex; gap: 12px; flex-wrap: wrap; }
    .cancelled { border-left: 4px solid var(--danger); margin-bottom: 32px; }
    @media (max-width: 649px) { .counters { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ManageOverviewComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notices = inject(NoticeService);

  event = signal<EventDetail | null>(null);
  guests = signal<GuestRow[]>([]);
  loading = signal(true);
  cancelOpen = signal(false);
  reason = '';
  origin = typeof location !== 'undefined' ? location.origin : '';
  private opener: HTMLElement | null = null;

  ngOnInit() {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') || ''));
  }

  private load(slug: string) {
    this.loading.set(true);
    this.api.getEvent(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) { this.router.navigateByUrl('/404', { skipLocationChange: true }); return; }
        this.event.set(e);
        this.loading.set(false);
        this.api.guestList(slug).subscribe({ next: (g) => this.guests.set(g), error: () => {} });
      },
      error: () => { this.loading.set(false); this.router.navigateByUrl('/404', { skipLocationChange: true }); },
    });
  }

  waiting() { return this.guests().filter((g) => g.status === 'waitlisted').length; }
  pending() { return this.guests().filter((g) => g.status === 'pending_approval').length; }
  arrived() { return this.guests().filter((g) => g.status === 'checked_in').length; }

  stateWord(s: string) {
    return { draft: 'Draft', published: 'Published',
             registration_closed: 'Registration Closed', cancelled: 'Cancelled' }[s] || s;
  }
  stateTone(s: string) {
    return { draft: 'neutral', published: 'success',
             registration_closed: 'warning', cancelled: 'danger' }[s] || 'neutral';
  }

  todos(): string[] {
    const e = this.event();
    if (!e) return [];
    const out: string[] = [];
    if (this.pending()) out.push(`Work the approval queue: ${this.pending()} waiting on you.`);
    if (this.waiting()) out.push(`Raise capacity to seat ${this.waiting()} on the waiting list.`);
    if (!e.description) out.push('Write a description so guests know what to expect.');
    out.push('Share the event address with your people.');
    out.push('Check tickets in at the door on the day.');
    return out.slice(0, 3);
  }

  async copyLink(e: EventDetail) {
    const url = `${this.origin}/${e.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      this.notices.show('The event address is on your clipboard.', 'success');
    } catch {
      this.notices.show(url, 'info');
    }
  }

  openCancel() { this.opener = document.activeElement as HTMLElement; this.cancelOpen.set(true); }
  closeCancel() { this.cancelOpen.set(false); this.opener?.focus(); }

  doCancel() {
    const e = this.event();
    if (!e || !this.reason.trim()) return;
    this.api.cancelEvent(e.slug, this.reason.trim()).subscribe({
      next: (updated) => {
        this.event.set({ ...e, ...updated });
        this.cancelOpen.set(false);
        this.notices.show('Everyone holding a place has been told.', 'success');
      },
      error: (err: Refusal) => this.notices.show(err.message, 'danger'),
    });
  }
}

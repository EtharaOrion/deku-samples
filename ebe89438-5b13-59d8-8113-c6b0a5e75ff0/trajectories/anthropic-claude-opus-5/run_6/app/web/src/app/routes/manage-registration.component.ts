import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { EventDetail } from '../core/models';

@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main id="main" class="col">
      <h1 class="t-screen-title">Registration</h1>
      @if (event(); as e) {
        <p class="t-caption muted sub">{{ e.title }}</p>

        <div class="setting">
          <div class="grow">
            <label class="t-body" for="cap">Capacity</label>
            <p class="t-caption" [class.refusal]="!!capRefusal()" id="cap-caption">
              {{ capRefusal() || 'How many seats this event holds, from 1 to 500.' }}
            </p>
          </div>
          <div class="stepper">
            <button type="button" class="btn btn-primary btn-sm" (click)="bump(-1)"
                    aria-label="Lower capacity by one">-</button>
            <input id="cap" class="control cap" type="number" min="1" max="500"
                   [(ngModel)]="capacity" aria-describedby="cap-caption" />
            <button type="button" class="btn btn-primary btn-sm" (click)="bump(1)"
                    aria-label="Raise capacity by one">+</button>
            <button type="button" class="btn btn-solid btn-sm" (click)="saveCapacity()"
                    [disabled]="capacity === e.capacity">Save</button>
          </div>
        </div>

        <div class="setting">
          <div class="grow">
            <span class="t-body" id="approval-label">Approval Required</span>
            <p class="t-caption muted">You read each request before a seat is given.</p>
          </div>
          <button type="button" role="switch" class="switch" [attr.aria-checked]="e.approval_required"
                  aria-labelledby="approval-label" (click)="toggle('approval_required', !e.approval_required)">
            <span class="knob" [class.on]="e.approval_required"></span>
            <span class="sr-only">{{ e.approval_required ? 'On' : 'Off' }}</span>
          </button>
        </div>

        <div class="setting">
          <div class="grow">
            <span class="t-body" id="waitlist-label">Waiting List</span>
            <p class="t-caption muted">When the event is full, new registrations take a place in line.</p>
          </div>
          <button type="button" role="switch" class="switch" [attr.aria-checked]="e.waitlist_enabled"
                  aria-labelledby="waitlist-label" (click)="toggle('waitlist_enabled', !e.waitlist_enabled)">
            <span class="knob" [class.on]="e.waitlist_enabled"></span>
            <span class="sr-only">{{ e.waitlist_enabled ? 'On' : 'Off' }}</span>
          </button>
        </div>

        <div class="setting">
          <div class="grow">
            <span class="t-body" id="open-label">Registration Open</span>
            <p class="t-caption muted">Turning this off shows the closed panel and mails nobody.</p>
          </div>
          <button type="button" role="switch" class="switch" [attr.aria-checked]="isOpen(e)"
                  aria-labelledby="open-label" (click)="toggleOpen(e)"
                  [disabled]="e.state === 'cancelled' || e.state === 'draft'">
            <span class="knob" [class.on]="isOpen(e)"></span>
            <span class="sr-only">{{ isOpen(e) ? 'Open' : 'Closed' }}</span>
          </button>
        </div>

        <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
      }
    </main>
  `,
  styles: [`
    .col { max-width: 568px; padding: 32px 24px 64px; }
    .sub { margin-bottom: 24px; }
    .setting { display: flex; align-items: center; gap: 24px; padding: 16px 0; border-bottom: 1px solid var(--divider); }
    .stepper { display: flex; align-items: center; gap: 8px; }
    .cap { width: 84px; text-align: center; }
    .refusal { color: var(--danger); }
    .switch {
      width: 52px; height: 32px; border-radius: var(--r-full); border: 1px solid var(--ink-08);
      background: var(--disabled-fill); cursor: pointer; padding: 3px; flex: none;
      transition: background-color var(--dur) var(--ease); min-width: 52px;
    }
    .switch[aria-checked="true"] { background: var(--success); }
    .knob {
      display: block; width: 24px; height: 24px; border-radius: 100%; background: #fff;
      box-shadow: var(--elev-card); transition: transform var(--dur) var(--ease);
    }
    .knob.on { transform: translateX(20px); }
  `],
})
export class ManageRegistrationComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private notices = inject(NoticeService);

  event = signal<EventDetail | null>(null);
  capacity = 0;
  capRefusal = signal('');
  announcement = signal('');

  ngOnInit() {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') || ''));
  }

  private load(slug: string) {
    this.api.getEvent(slug).subscribe({
      next: (e) => {
        if (!e.is_owner) { this.router.navigateByUrl('/404', { skipLocationChange: true }); return; }
        this.event.set(e);
        this.capacity = e.capacity ?? 0;
      },
      error: () => this.router.navigateByUrl('/404', { skipLocationChange: true }),
    });
  }

  isOpen(e: EventDetail) { return e.state === 'published'; }

  bump(d: number) { this.capacity = Math.max(1, Math.min(500, Number(this.capacity) + d)); }

  saveCapacity() {
    const e = this.event();
    if (!e) return;
    this.capRefusal.set('');
    this.api.patchEvent(e.slug, { capacity: Number(this.capacity) }).subscribe({
      next: (updated) => {
        this.event.set({ ...e, ...updated });
        this.capacity = updated.capacity ?? this.capacity;
        const moved = updated.promoted_count || 0;
        if (moved) {
          const msg = `${moved} ${moved === 1 ? 'guest was' : 'guests were'} moved from the waiting list to a seat.`;
          this.notices.show(msg, 'success');
          this.announcement.set(msg);
        } else {
          this.notices.show('Capacity saved.', 'success');
        }
      },
      error: (err: Refusal) => {
        this.capRefusal.set(err.message);
        this.capacity = e.capacity ?? this.capacity;
      },
    });
  }

  toggle(key: 'approval_required' | 'waitlist_enabled', value: boolean) {
    const e = this.event();
    if (!e) return;
    this.api.patchEvent(e.slug, { [key]: value }).subscribe({
      next: (updated) => {
        this.event.set({ ...e, ...updated });
        this.notices.show('Saved.', 'success');
      },
      error: (err: Refusal) => this.notices.show(err.message, 'danger'),
    });
  }

  toggleOpen(e: EventDetail) {
    const next = this.isOpen(e) ? 'registration_closed' : 'published';
    this.api.patchEvent(e.slug, { state: next }).subscribe({
      next: (updated) => {
        this.event.set({ ...e, ...updated });
        this.notices.show(next === 'published'
          ? 'Registration is open again.'
          : 'Registration is closed. Nobody was mailed.', 'info');
      },
      error: (err: Refusal) => this.notices.show(err.message, 'danger'),
    });
  }
}

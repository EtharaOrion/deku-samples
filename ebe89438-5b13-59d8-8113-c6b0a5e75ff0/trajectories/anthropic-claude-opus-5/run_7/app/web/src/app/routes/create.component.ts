import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../models';
import { ShellComponent } from '../shared/shell.component';
import { CoverComponent, SpinnerComponent } from '../shared/ui.components';
import { visitorZone } from '../core/time';
import { clearTheme } from '../core/theme';

/**
 * One screen, never a wizard. At 1000px and above an art column of 520px sits
 * beside a form column of 568px; below that they stack with the art first.
 * Behind it all the rotating field turns once a minute.
 */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, ShellComponent, CoverComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <main id="main" class="page" role="main">
        <h1 class="visually-hidden">Create an event</h1>

        <div class="layout">
          <!-- art column -->
          <div class="art">
            <div class="art-stage">
              <div class="rotating-field" aria-hidden="true"></div>
              <div class="glow-layer" aria-hidden="true"></div>
              <div class="backdrop" aria-hidden="true"></div>
              <app-cover class="preview" [seed]="seed()" [size]="320"
                         [title]="form.title || 'Event Name'" />
            </div>
          </div>

          <!-- form column, one column throughout -->
          <form class="form" (ngSubmit)="submit()" novalidate>
            <label class="field">
              <span class="field-label">Calendar</span>
              <select class="field-input" name="calendar_slug" [(ngModel)]="form.calendar_slug">
                @for (c of calendars(); track c.slug) {
                  <option [value]="c.slug">{{ c.name }}</option>
                }
              </select>
            </label>

            <label class="switch-row">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span>Public event</span>
            </label>

            <label class="field" [class.field-invalid]="refusedField() === 'title'">
              <span class="field-label">Name</span>
              <input class="field-input" name="title" placeholder="Event Name"
                     [(ngModel)]="form.title" required />
            </label>

            <div class="pair">
              <label class="field" [class.field-invalid]="refusedField() === 'starts_at'">
                <span class="field-label">Starts</span>
                <input class="field-input" type="datetime-local" name="starts_at"
                       [(ngModel)]="form.starts_at" required />
              </label>
              <label class="field" [class.field-invalid]="refusedField() === 'ends_at'">
                <span class="field-label">Ends</span>
                <input class="field-input" type="datetime-local" name="ends_at"
                       [(ngModel)]="form.ends_at" required />
              </label>
            </div>

            <label class="field">
              <span class="field-label">Time zone</span>
              <input class="field-input" name="time_zone" [(ngModel)]="form.time_zone" required />
              <span class="field-caption">The zone the event is actually held in.</span>
            </label>

            <div class="pair">
              <label class="field" [class.field-invalid]="refusedField() === 'city'">
                <span class="field-label">Where</span>
                <input class="field-input" name="city" [(ngModel)]="form.city" required />
              </label>
              <label class="field" [class.field-invalid]="refusedField() === 'category'">
                <span class="field-label">Category</span>
                <select class="field-input" name="category" [(ngModel)]="form.category">
                  @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
                </select>
              </label>
            </div>

            <label class="field">
              <span class="field-label">About</span>
              <textarea class="field-input" name="description" rows="4"
                        [(ngModel)]="form.description"></textarea>
            </label>

            <!-- the three setting rows, with pinned copy -->
            <div class="setting-row">
              <span class="row-label">Capacity</span>
              <div class="row-control">
                <input class="field-input cap" type="number" name="capacity" min="1" max="500"
                       [(ngModel)]="form.capacity" aria-label="Capacity"
                       [disabled]="form.unlimited" />
                <label class="inline"><input type="checkbox" name="unlimited"
                       [(ngModel)]="form.unlimited" /> Unlimited</label>
                <label class="inline"><input type="checkbox" name="waitlist_enabled"
                       [(ngModel)]="form.waitlist_enabled" /> Waitlist Enabled</label>
              </div>
            </div>

            <div class="setting-row">
              <span class="row-label">Theme</span>
              <div class="row-control">
                <label class="inline"><input type="checkbox" name="seasonal"
                       [(ngModel)]="form.seasonal" (ngModelChange)="reseed()" /> Seasonal</label>
              </div>
            </div>

            <div class="setting-row">
              <span class="row-label">Approval</span>
              <div class="row-control">
                <label class="inline"><input type="checkbox" name="approval_required"
                       [(ngModel)]="form.approval_required" /> Approve each guest</label>
              </div>
            </div>

            @if (refusal()) { <p class="field-refusal" role="alert">{{ refusal() }}</p> }

            <button type="submit" class="btn btn-solid submit" [disabled]="working()">
              @if (working()) { <app-spinner /> }
              Create Event
            </button>
          </form>
        </div>
      </main>
    </app-shell>
  `,
  styles: [`
    .page { padding: var(--s6) var(--s5) var(--s8); }
    .layout { display: grid; grid-template-columns: 520px 568px; gap: var(--s7);
      justify-content: center; align-items: start; }
    @media (max-width: 1099px) {
      .layout { grid-template-columns: minmax(0, 568px); justify-content: center; }
    }
    .art-stage {
      position: relative; height: 420px; border-radius: var(--r-card-lg);
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      background: var(--paper-inset);
    }
    /* one turn per minute, slow enough to read as light in the room */
    .rotating-field {
      position: absolute; width: 160%; height: 160%;
      background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #f31a7c);
      filter: brightness(1.3) saturate(0) blur(50px);
      mix-blend-mode: overlay;
      animation: shift-background 60000ms linear infinite;
      will-change: transform;
    }
    .glow-layer {
      position: absolute; inset: 10%;
      background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #f31a7c);
      filter: blur(60px); opacity: 0.5;
    }
    .backdrop { position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .preview { position: relative; z-index: 1; }

    .form { display: block; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s3); }
    @media (max-width: 449px) { .pair { grid-template-columns: 1fr; } }
    .switch-row { display: flex; align-items: center; gap: var(--s2); min-height: 44px;
      margin-bottom: var(--s3); }
    .setting-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: var(--s3); padding: var(--s3) 0; border-top: 1px solid var(--divider);
      flex-wrap: wrap;
    }
    .row-label { font-size: 16px; line-height: 24px; font-weight: 500; }
    .row-control { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; }
    .inline { display: inline-flex; align-items: center; gap: var(--s1);
      min-height: 44px; font-size: 14px; }
    .cap { width: 96px; }
    /* The composer date and time fields are at least 44px on any axis. */
    input[type="datetime-local"] { min-height: 44px; }
    .submit { margin-top: var(--s5); }
  `],
})
export class CreateComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  categories = CATEGORIES;
  calendars = signal<Calendar[]>([]);
  working = signal(false);
  refusal = signal<string | null>(null);
  refusedField = signal<string | null>(null);
  seed = signal(`draft-${Math.random().toString(36).slice(2, 8)}`);

  form = {
    calendar_slug: '', title: '', category: 'running', city: '',
    time_zone: visitorZone(), starts_at: '', ends_at: '',
    capacity: 20, unlimited: false, waitlist_enabled: true,
    approval_required: false, description: '', is_public: true, seasonal: false,
  };

  label(c: string) { return CATEGORY_LABELS[c] ?? c; }
  reseed() { this.seed.set(`draft-${Math.random().toString(36).slice(2, 8)}`); }

  ngOnInit() {
    clearTheme();
    this.api.myCalendars().subscribe({
      next: (rows) => {
        this.calendars.set(rows);
        if (rows.length && !this.form.calendar_slug) {
          this.form.calendar_slug = rows[0].slug;
          this.form.city = rows[0].city;
          this.form.category = rows[0].category;
        }
      },
      error: () => this.calendars.set([]),
    });

    // A sensible default: next week, an hour long.
    const start = new Date(Date.now() + 7 * 86400000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    this.form.starts_at = localInput(start);
    this.form.ends_at = localInput(end);
  }

  submit() {
    if (this.working()) return;
    this.working.set(true);
    this.refusal.set(null);
    this.refusedField.set(null);

    // The composer collects wall-clock input and sends UTC instants, because
    // every timestamp crossing the API ends in Z.
    const body: Record<string, unknown> = {
      calendar_slug: this.form.calendar_slug,
      title: this.form.title.trim(),
      category: this.form.category,
      city: this.form.city.trim(),
      time_zone: this.form.time_zone.trim(),
      starts_at: toUtc(this.form.starts_at),
      ends_at: toUtc(this.form.ends_at),
      approval_required: this.form.approval_required,
      waitlist_enabled: this.form.waitlist_enabled,
      description: this.form.description.trim(),
      cover_seed: this.seed(),
    };
    if (!this.form.unlimited) body['capacity'] = Number(this.form.capacity);

    this.api.createEvent(body).subscribe({
      next: (ev) => {
        this.working.set(false);
        this.notices.show(
          ev.state === 'published' ? `${ev.title} is live.` : `${ev.title} was saved as a draft.`,
          'success',
        );
        this.router.navigate(['/event', ev.slug, 'manage', 'overview']);
      },
      error: (r: Refusal) => {
        this.working.set(false);
        this.refusal.set(r.message);
        this.refusedField.set(r.field ?? null);
      },
    });
  }
}

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toUtc(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

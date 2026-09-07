import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';
import { CoverComponent } from '../shared/cover.component';
import { visitorZone } from '../core/time';

/**
 * One screen at /create, never a wizard. Behind it all the rotating field turns
 * once a minute, slow enough to read as light in the room.
 */
@Component({
  selector: 'app-create-event',
  standalone: true,
  imports: [FormsModule, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="composer">
      <div class="art-column" aria-hidden="true">
        <div class="art-stage">
          <div class="rotator shift-background"></div>
          <div class="glow"></div>
          <div class="backdrop"></div>
          <div class="preview">
            <app-cover [seed]="form.cover_seed || 'new-event'" [title]="form.title || 'Event Name'" [size]="300" />
          </div>
        </div>
      </div>

      <div class="form-column">
        <h1 class="t-screen-title">Create Event</h1>

        <form (submit)="submit($event)" novalidate class="form">
          <div class="field">
            <label for="calendar">Calendar</label>
            <select id="calendar" name="calendar_slug" [(ngModel)]="form.calendar_slug">
              @for (cal of calendars(); track cal.slug) {
                <option [value]="cal.slug">{{ cal.name }}</option>
              }
            </select>
            @if (calendars().length === 0 && !loading()) {
              <span class="caption">Create a calendar first, then your events can live on it.</span>
            }
          </div>

          <label class="switch-row">
            <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
            <span>Public event</span>
          </label>

          <div class="field" [class.is-refused]="refusalField() === 'title'">
            <label for="title">Name</label>
            <input id="title" name="title" type="text" placeholder="Event Name" [(ngModel)]="form.title" />
          </div>

          <div class="two-up">
            <div class="field" [class.is-refused]="refusalField() === 'starts_at'">
              <label for="starts">Starts</label>
              <input id="starts" name="starts_at" type="datetime-local" [(ngModel)]="form.starts_at" />
            </div>
            <div class="field" [class.is-refused]="refusalField() === 'ends_at'">
              <label for="ends">Ends</label>
              <input id="ends" name="ends_at" type="datetime-local" [(ngModel)]="form.ends_at" />
            </div>
          </div>

          <div class="field">
            <label for="time-zone">Time zone</label>
            <input id="time-zone" name="time_zone" type="text" [(ngModel)]="form.time_zone" />
            <span class="caption">The zone the event is actually held in.</span>
          </div>

          <div class="two-up">
            <div class="field">
              <label for="city">City</label>
              <input id="city" name="city" type="text" [(ngModel)]="form.city" />
            </div>
            <div class="field">
              <label for="category">Category</label>
              <select id="category" name="category" [(ngModel)]="form.category">
                @for (c of categories; track c) {
                  <option [value]="c">{{ labelFor(c) }}</option>
                }
              </select>
            </div>
          </div>

          <div class="field">
            <label for="location">Where</label>
            <input id="location" name="location" type="text" [(ngModel)]="form.location" />
          </div>

          <div class="field">
            <label for="description">What it is about</label>
            <textarea id="description" name="description" rows="4" [(ngModel)]="form.description"></textarea>
          </div>

          <!-- The three setting rows, with their copy pinned. -->
          <div class="setting-row">
            <div class="setting-text">
              <span class="setting-label">Capacity</span>
              <span class="caption">{{ form.unlimited ? 'Unlimited' : 'Seats available at this event.' }}</span>
            </div>
            <div class="setting-control">
              <input
                type="number"
                min="1"
                max="500"
                aria-label="Capacity"
                [(ngModel)]="form.capacity"
                name="capacity"
                [disabled]="form.unlimited"
                class="stepper"
              />
            </div>
          </div>

          <label class="switch-row">
            <input type="checkbox" name="unlimited" [(ngModel)]="form.unlimited" />
            <span>Unlimited</span>
          </label>

          <label class="switch-row">
            <input type="checkbox" name="waitlist_enabled" [(ngModel)]="form.waitlist_enabled" />
            <span>Waitlist Enabled</span>
          </label>

          <label class="switch-row">
            <input type="checkbox" name="approval_required" [(ngModel)]="form.approval_required" />
            <span>Approval required</span>
          </label>

          <div class="setting-row">
            <div class="setting-text">
              <span class="setting-label">Theme</span>
              <span class="caption">Seasonal</span>
            </div>
            <div class="setting-control">
              <input
                type="text"
                aria-label="Theme seed"
                name="cover_seed"
                [(ngModel)]="form.cover_seed"
                class="seed"
                placeholder="Seasonal"
              />
            </div>
          </div>

          @if (refusal()) {
            <p class="refusal" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-primary btn-pill submit" [disabled]="working() || calendars().length === 0">
            @if (working()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg>
            }
            Create Event
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      .composer {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .art-stage {
        position: relative;
        height: 420px;
        border-radius: var(--r-card-lg);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--paper-inset);
      }

      /* A rotating element, a glow layer, and a backdrop. Only the moving layer
         declares will-change, and no blur is ever animated. */
      .rotator {
        position: absolute;
        width: 140%;
        height: 140%;
        background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #ab46dd, #f31a7c);
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        animation: shift-background 60000ms linear infinite;
        will-change: transform;
      }

      .glow {
        position: absolute;
        width: 70%;
        height: 70%;
        background: radial-gradient(circle, #146aeb, transparent 70%);
        filter: blur(60px);
        opacity: 0.5;
      }

      .backdrop {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(100px) saturate(1.5);
      }

      .preview { position: relative; }

      .form-column { max-width: 568px; }

      h1 { margin-bottom: 24px; }

      .form { display: flex; flex-direction: column; gap: 20px; }

      .two-up {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      /* The composer date and time fields are at least 44px on any axis. */
      input[type='datetime-local'] { min-height: 44px; }

      .setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 0;
        border-top: 1px solid var(--divider);
      }

      .setting-text { display: flex; flex-direction: column; gap: 2px; }
      .setting-label { font-size: 16px; line-height: 24px; font-weight: 500; }

      .stepper, .seed {
        min-height: 44px;
        width: 140px;
        padding: 10px 12px;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }

      .switch-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        font-size: 15px;
      }

      .switch-row input { width: 20px; height: 20px; min-height: 20px; }

      .refusal { color: var(--danger); font-size: 13px; line-height: 18px; }

      .submit { align-self: flex-start; }

      /* At 1000px and above: an art column of 520px and a form column of 568px.
         Below that they stack with the art first. */
      @media (min-width: 1000px) {
        .composer { flex-direction: row; gap: 48px; align-items: flex-start; }
        .art-column { width: 520px; flex: none; position: sticky; top: 40px; }
        .form-column { width: 568px; flex: none; }
      }

      @media (max-width: 449px) {
        .two-up { grid-template-columns: 1fr; }
      }

      @media (prefers-reduced-motion: reduce) {
        .rotator { animation: none; }
      }
    `,
  ],
})
export class CreateEventComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);

  form = {
    calendar_slug: '',
    title: '',
    category: 'running',
    city: '',
    time_zone: visitorZone(),
    starts_at: '',
    ends_at: '',
    location: '',
    description: '',
    capacity: 20,
    unlimited: false,
    approval_required: false,
    waitlist_enabled: true,
    is_public: true,
    cover_seed: '',
  };

  ngOnInit() {
    this.api.calendars().subscribe({
      next: (list) => {
        this.calendars.set(list);
        if (list.length) this.form.calendar_slug = list[0].slug;
        if (list[0]) {
          this.form.category = list[0].category;
          this.form.city = list[0].city;
        }
        this.loading.set(false);
      },
      error: () => {
        this.calendars.set([]);
        this.loading.set(false);
      },
    });
  }

  /**
   * A datetime-local field carries a wall time in the event's own zone. It is
   * converted to the instant that wall time names in that zone, so what crosses
   * the API is always UTC with a trailing Z.
   */
  private toInstant(local: string, timeZone: string): string | null {
    if (!local) return null;
    const [datePart, timePart] = local.split('T');
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
    // Find the offset that zone had at that moment and correct for it.
    const asUtc = new Date(guess);
    const tzName = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(asUtc);
    const get = (type: string) => Number(tzName.find((p) => p.type === type)?.value ?? 0);
    const zoned = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const offset = zoned - guess;
    return new Date(guess - offset).toISOString();
  }

  submit(event: Event) {
    event.preventDefault();
    this.refusal.set('');
    this.refusalField.set(null);
    this.working.set(true);

    const tz = this.form.time_zone || 'UTC';
    const body: Record<string, unknown> = {
      calendar_slug: this.form.calendar_slug,
      title: this.form.title,
      category: this.form.category,
      city: this.form.city,
      time_zone: tz,
      location: this.form.location,
      description: this.form.description,
      approval_required: this.form.approval_required,
      waitlist_enabled: this.form.waitlist_enabled,
    };
    const starts = this.toInstant(this.form.starts_at, tz);
    const ends = this.toInstant(this.form.ends_at, tz);
    if (starts) body['starts_at'] = starts;
    if (ends) body['ends_at'] = ends;
    if (!this.form.unlimited) body['capacity'] = Number(this.form.capacity);
    if (this.form.cover_seed) body['cover_seed'] = this.form.cover_seed;

    this.api.createEvent(body).subscribe({
      next: (created) => {
        this.working.set(false);
        this.notices.success(
          created.state === 'published'
            ? `${created.title} is published at /${created.slug}.`
            : `${created.title} is saved as a draft. Fill in the rest to publish it.`
        );
        this.router.navigateByUrl(`/event/${created.slug}/manage/overview`);
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        this.refusal.set(err.message);
        this.refusalField.set(err.field ?? null);
      },
    });
  }

  labelFor(category: string) {
    return CATEGORY_LABELS[category] ?? category;
  }
}

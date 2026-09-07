import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';
import { Notices } from '../core/notices';
import { visitorZone } from '../core/time';

/** One screen at /create, never a wizard. */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="composer">
      <!-- the art column: a rotating field turning once a minute -->
      <div class="art" aria-hidden="true">
        <div class="art-stage">
          <span class="rotating-field" [style.background]="fieldGradient"></span>
          <span class="art-glow"></span>
          <span class="art-backdrop"></span>
        </div>
      </div>

      <div class="form-col">
        <h1 class="screen-title">Create an event</h1>

        @if (calendars().length === 0 && !loading()) {
          <p class="need-calendar">
            An event lives on a calendar, and you do not have one yet. Create a calendar
            first and then come back.
          </p>
          <button type="button" class="btn btn-primary" (click)="goCalendars()">
            Go to Calendars
          </button>
        } @else {
          <form (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label class="field-label" for="calendar">Which calendar</label>
              <select id="calendar" name="calendar" class="field-input" [(ngModel)]="form.calendar_slug">
                @for (c of calendars(); track c.slug) {
                  <option [value]="c.slug">{{ c.name }}</option>
                }
              </select>
            </div>

            <label class="switch-row">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span>Anyone can find this event</span>
            </label>

            <div class="field">
              <label class="field-label" for="title">Name</label>
              <input
                id="title"
                name="title"
                class="field-input"
                placeholder="Event Name"
                [(ngModel)]="form.title"
                [attr.aria-invalid]="field() === 'title' ? 'true' : null"
                required
              />
            </div>

            <div class="two-up">
              <div class="field">
                <label class="field-label" for="starts">Starts</label>
                <input
                  id="starts"
                  name="starts"
                  class="field-input"
                  type="datetime-local"
                  [(ngModel)]="form.starts_at"
                  [attr.aria-invalid]="field() === 'starts_at' ? 'true' : null"
                />
              </div>
              <div class="field">
                <label class="field-label" for="ends">Ends</label>
                <input
                  id="ends"
                  name="ends"
                  class="field-input"
                  type="datetime-local"
                  [(ngModel)]="form.ends_at"
                  [attr.aria-invalid]="field() === 'ends_at' ? 'true' : null"
                />
              </div>
            </div>

            <div class="two-up">
              <div class="field">
                <label class="field-label" for="city">Where</label>
                <input id="city" name="city" class="field-input" [(ngModel)]="form.city" />
              </div>
              <div class="field">
                <label class="field-label" for="tz">Time zone</label>
                <input id="tz" name="tz" class="field-input" [(ngModel)]="form.time_zone" />
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="category">Category</label>
              <select id="category" name="category" class="field-input" [(ngModel)]="form.category">
                @for (c of categories; track c) {
                  <option [value]="c">{{ label(c) }}</option>
                }
              </select>
            </div>

            <div class="field">
              <label class="field-label" for="description">What it is about</label>
              <textarea
                id="description"
                name="description"
                class="field-input"
                rows="4"
                [(ngModel)]="form.description"
              ></textarea>
            </div>

            <!-- the three setting rows, with their pinned copy -->
            <ul class="settings">
              <li class="setting">
                <span class="s-label" id="cap-l">Capacity</span>
                <span class="s-controls">
                  <input
                    class="cap"
                    type="number"
                    min="1"
                    max="500"
                    aria-labelledby="cap-l"
                    [(ngModel)]="form.capacity"
                    name="capacity"
                    [disabled]="form.unlimited"
                  />
                  <label class="inline">
                    <input type="checkbox" name="unlimited" [(ngModel)]="form.unlimited" />
                    <span>Unlimited</span>
                  </label>
                  <label class="inline">
                    <input type="checkbox" name="waitlist" [(ngModel)]="form.waitlist_enabled" />
                    <span>Waitlist Enabled</span>
                  </label>
                </span>
              </li>

              <li class="setting">
                <span class="s-label" id="appr-l">Approval</span>
                <label class="inline">
                  <input
                    type="checkbox"
                    name="approval"
                    aria-labelledby="appr-l"
                    [(ngModel)]="form.approval_required"
                  />
                  <span>Approve each guest</span>
                </label>
              </li>

              <li class="setting">
                <span class="s-label">Theme</span>
                <span class="s-controls">
                  <span class="theme-swatch" aria-hidden="true"></span>
                  <span class="theme-word">Seasonal</span>
                </span>
              </li>
            </ul>

            @if (refusal()) {
              <p class="field-refusal">{{ refusal() }}</p>
            }

            <button type="submit" class="btn btn-primary submit" [disabled]="working()">
              {{ working() ? 'Creating…' : 'Create Event' }}
            </button>
          </form>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .composer {
        display: flex;
        flex-direction: column;
        gap: 48px;
      }
      .art { width: 100%; }
      .art-stage {
        position: relative;
        height: 280px;
        border-radius: var(--r-card-lg);
        overflow: hidden;
        background: var(--paper-inset);
        isolation: isolate;
      }
      /* one turn per minute, slow enough to read as light in the room */
      .rotating-field {
        position: absolute;
        inset: -40%;
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        animation: shift-background 60000ms linear infinite;
        will-change: transform;
      }
      .art-glow {
        position: absolute;
        inset: 10%;
        border-radius: 100%;
        background: linear-gradient(120deg, #f31a7c, #146aeb, #3cbd2c);
        filter: blur(60px);
        opacity: 0.5;
        z-index: -1;
      }
      .art-backdrop {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(100px) saturate(1.5);
        z-index: -1;
      }
      .form-col { width: 100%; }
      .screen-title { margin-bottom: 24px; }
      .two-up { display: grid; grid-template-columns: 1fr; gap: 12px; }
      .switch-row,
      .inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        font-size: 15px;
      }
      .switch-row { display: flex; margin-bottom: 8px; }
      .settings { display: flex; flex-direction: column; margin: 16px 0; }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .s-label { font-size: 16px; line-height: 24px; font-weight: 500; }
      .s-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .cap {
        width: 80px;
        min-height: 44px;
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        padding: 0 8px;
        background: var(--paper);
        color: var(--ink);
      }
      .theme-swatch {
        width: 24px;
        height: 24px;
        border-radius: 100%;
        background: linear-gradient(120deg, #f31a7c, #d69712);
        box-shadow: var(--hairline-inset);
      }
      .theme-word { font-size: 15px; color: var(--ink-64); }
      .submit { width: 100%; margin-top: 16px; }
      .need-calendar { color: var(--ink-64); line-height: 25.6px; margin-bottom: 24px; }

      @media (min-width: 484px) {
        .two-up { grid-template-columns: 1fr 1fr; }
      }
      /* at 1000px and above: an art column of 520px and a form column of 568px */
      @media (min-width: 1000px) {
        .composer { flex-direction: row; align-items: flex-start; }
        .art { width: 520px; flex: none; position: sticky; top: 48px; }
        .art-stage { height: 520px; }
        .form-col { width: 568px; flex: none; }
      }
    `,
  ],
})
export class CreateComponent implements OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);

  readonly fieldGradient =
    'conic-gradient(from 0deg, #f31a7c, #146aeb, #3cbd2c, #d69712, #f31a7c)';

  form = {
    calendar_slug: '',
    is_public: true,
    title: '',
    starts_at: '',
    ends_at: '',
    city: '',
    time_zone: visitorZone(),
    category: 'running',
    description: '',
    capacity: 20,
    unlimited: false,
    approval_required: false,
    waitlist_enabled: true,
  };

  private controller = new AbortController();

  constructor() {
    this.api
      .myCalendars(this.controller.signal)
      .then((rows) => {
        this.calendars.set(rows);
        if (rows.length) {
          this.form.calendar_slug = rows[0].slug;
          this.form.category = rows[0].category;
          this.form.city = rows[0].city;
        }
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  goCalendars() {
    this.router.navigateByUrl('/calendars');
  }

  /** A local datetime typed by the host becomes an instant in the event's zone. */
  private toUtc(local: string, zone: string): string | null {
    if (!local) return null;
    const [datePart, timePart] = local.split('T');
    if (!datePart || !timePart) return null;
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    // Find the UTC instant whose rendering in `zone` matches what was typed.
    let guess = Date.UTC(y, mo - 1, d, h, mi);
    for (let i = 0; i < 3; i++) {
      const shown = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date(guess));
      const get = (t: string) => Number(shown.find((p) => p.type === t)?.value);
      const shownUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour') % 24,
        get('minute'),
      );
      const drift = Date.UTC(y, mo - 1, d, h, mi) - shownUtc;
      if (drift === 0) break;
      guess += drift;
    }
    return new Date(guess).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async submit() {
    this.working.set(true);
    this.refusal.set('');
    this.field.set(null);
    try {
      const zone = this.form.time_zone.trim() || 'UTC';
      const created = await this.api.createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title.trim(),
        category: this.form.category,
        city: this.form.city.trim(),
        time_zone: zone,
        starts_at: this.toUtc(this.form.starts_at, zone),
        ends_at: this.toUtc(this.form.ends_at, zone),
        capacity: this.form.unlimited ? null : Number(this.form.capacity),
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description,
      });
      this.notices.success(
        created.state === 'published'
          ? `${created.title} is live at /${created.slug}.`
          : `${created.title} is saved as a draft until it has a date and a capacity.`,
      );
      this.router.navigateByUrl(`/event/${created.slug}/manage/overview`);
    } catch (err) {
      if (err instanceof ApiError) {
        this.refusal.set(err.message);
        this.field.set(err.field);
      } else {
        this.refusal.set('That did not go through. Try again in a moment.');
      }
    } finally {
      this.working.set(false);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

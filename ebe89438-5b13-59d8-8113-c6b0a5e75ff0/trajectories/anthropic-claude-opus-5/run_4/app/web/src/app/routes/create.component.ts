import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';
import { NoticeService } from '../core/notice.service';
import { SessionService } from '../core/session.service';
import { visitorZone } from '../core/time';
import { coverBackground } from '../ui/cover';
import { ShellComponent } from '../ui/shell.component';
import { NotFoundComponent } from './not-found.component';

const ZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
];

/** One screen, never a wizard. Behind it all the rotating field turns once a minute. */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, ShellComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!session.isHost()) {
      <app-not-found />
    } @else {
      <app-shell>
        <h1 class="t-screen-title">Create an event</h1>

        <div class="layout">
          <aside class="art" aria-hidden="true">
            <div class="art-stack">
              <div class="rotor anim-shift-background" [style.background]="art()"></div>
              <div class="glow" [style.background]="art()"></div>
              <div class="backdrop"></div>
              <div class="preview" [style.background]="art()">
                <span class="preview-title">{{ form.title || 'Event Name' }}</span>
              </div>
            </div>
          </aside>

          <form class="form" (ngSubmit)="submit()" novalidate>
            <div class="field" [class.invalid]="bad('calendar_slug')">
              <label for="cal">Which calendar</label>
              <select id="cal" name="calendar_slug" [(ngModel)]="form.calendar_slug">
                @for (c of calendars(); track c.slug) {
                  <option [value]="c.slug">{{ c.name }}</option>
                }
              </select>
              @if (calendars().length === 0) {
                <span class="caption">Create a calendar first; an event has to live on one.</span>
              }
            </div>

            <label class="switch-row">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span>Listed publicly</span>
            </label>

            <div class="field" [class.invalid]="bad('title')">
              <label for="title">The name</label>
              <input id="title" name="title" [(ngModel)]="form.title" placeholder="Event Name" />
            </div>

            <div class="two">
              <div class="field" [class.invalid]="bad('starts_at')">
                <label for="starts">When it starts</label>
                <input id="starts" name="starts_at" type="datetime-local" [(ngModel)]="form.starts_at" />
              </div>
              <div class="field" [class.invalid]="bad('ends_at')">
                <label for="ends">When it ends</label>
                <input id="ends" name="ends_at" type="datetime-local" [(ngModel)]="form.ends_at" />
              </div>
            </div>

            <div class="field" [class.invalid]="bad('time_zone')">
              <label for="tz">Time zone it is held in</label>
              <select id="tz" name="time_zone" [(ngModel)]="form.time_zone">
                @for (z of zones; track z) {
                  <option [value]="z">{{ z }}</option>
                }
              </select>
            </div>

            <div class="two">
              <div class="field" [class.invalid]="bad('city')">
                <label for="city">City</label>
                <input id="city" name="city" [(ngModel)]="form.city" />
              </div>
              <div class="field" [class.invalid]="bad('category')">
                <label for="cat">Category</label>
                <select id="cat" name="category" [(ngModel)]="form.category">
                  @for (c of categories; track c) {
                    <option [value]="c">{{ label(c) }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="field">
              <label for="loc">Where it happens</label>
              <input id="loc" name="location" [(ngModel)]="form.location" />
            </div>

            <div class="field">
              <label for="desc">What it is about</label>
              <textarea id="desc" name="description" [(ngModel)]="form.description"></textarea>
            </div>

            <div class="setting-row">
              <span class="t-body label">Capacity</span>
              <div class="control">
                <input
                  class="num"
                  type="number"
                  min="1"
                  max="500"
                  name="capacity"
                  aria-label="Capacity"
                  [(ngModel)]="form.capacity"
                />
                <label class="chk">
                  <input type="checkbox" name="waitlist" [(ngModel)]="form.waitlist_enabled" />
                  <span>Waitlist Enabled</span>
                </label>
              </div>
              <span class="caption">Unlimited is not an option; every seat is counted.</span>
            </div>

            <div class="setting-row">
              <span class="t-body label">Approval</span>
              <div class="control">
                <label class="chk">
                  <input type="checkbox" name="approval" [(ngModel)]="form.approval_required" />
                  <span>Approve each guest</span>
                </label>
              </div>
              <span class="caption">A request then holds no seat until you say so.</span>
            </div>

            <div class="setting-row">
              <span class="t-body label">Theme</span>
              <div class="control">
                <span class="swatch" [style.background]="form.theme_hex"></span>
                <label class="chk">
                  <input type="checkbox" name="seasonal" [(ngModel)]="seasonal" />
                  <span>Seasonal</span>
                </label>
              </div>
              <span class="caption">The whole event page is painted from this one colour.</span>
            </div>

            @if (refusal()) {
              <p class="refusal">{{ refusal() }}</p>
            }

            <button type="submit" class="btn btn-primary btn-pill submit" [disabled]="working()">Create Event</button>
          </form>
        </div>
      </app-shell>
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s6);
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s6);
      }
      @media (min-width: 1000px) {
        .layout {
          grid-template-columns: 520px 568px;
        }
      }
      .art-stack {
        position: relative;
        aspect-ratio: 1;
        max-width: 520px;
        border-radius: var(--r-card-lg);
        overflow: hidden;
        background: var(--paper-inset);
      }
      .rotor {
        position: absolute;
        inset: -30%;
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        animation: shift-background 60000ms linear infinite;
        will-change: transform;
      }
      .glow {
        position: absolute;
        inset: 10%;
        filter: blur(60px);
        opacity: 0.7;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(100px) saturate(1.5);
      }
      .preview {
        position: absolute;
        inset: 18%;
        border-radius: 12.8% / 5.7%;
        box-shadow: var(--elev-card);
        display: flex;
        align-items: flex-end;
        padding: var(--s5);
      }
      .preview-title {
        color: #fff;
        font-weight: 700;
        font-size: 26px;
        line-height: 32px;
        text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
      }
      .form {
        max-width: 568px;
      }
      .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--s3);
      }
      @media (max-width: 449px) {
        .two {
          grid-template-columns: 1fr;
        }
      }
      .setting-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-top: 1px solid var(--divider);
      }
      .setting-row .caption {
        grid-column: 1 / -1;
        font-size: 13px;
        line-height: 16px;
        color: var(--muted);
      }
      .control {
        display: flex;
        align-items: center;
        gap: var(--s3);
      }
      .num {
        width: 92px;
        min-height: 44px;
        padding: 10px var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        background: var(--paper);
      }
      .chk {
        display: inline-flex;
        align-items: center;
        gap: var(--s2);
        min-height: 44px;
        cursor: pointer;
        font-size: 14px;
      }
      .chk input {
        width: 20px;
        height: 20px;
      }
      .switch-row {
        display: flex;
        align-items: center;
        gap: var(--s2);
        min-height: 44px;
        margin-bottom: var(--s3);
        cursor: pointer;
      }
      .switch-row input {
        width: 20px;
        height: 20px;
      }
      .swatch {
        width: 28px;
        height: 28px;
        border-radius: 100%;
        box-shadow: var(--hairline-inset);
      }
      .submit {
        margin-top: var(--s5);
        width: 100%;
      }
      input[type='datetime-local'] {
        min-height: 44px;
      }
    `,
  ],
})
export class CreateComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);
  session = inject(SessionService);

  readonly categories = CATEGORIES;
  readonly zones = ZONES;
  readonly calendars = signal<Calendar[]>([]);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusedField = signal('');

  seasonal = false;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  form = {
    calendar_slug: '',
    title: '',
    category: 'running',
    city: '',
    location: '',
    time_zone: ZONES.includes(visitorZone()) ? visitorZone() : 'UTC',
    starts_at: '',
    ends_at: '',
    capacity: 20,
    approval_required: false,
    waitlist_enabled: true,
    description: '',
    is_public: true,
    theme_hex: '#146aeb',
  };

  readonly art = computed(() => coverBackground(this.form.title || 'composer'));

  constructor() {
    void this.load();
  }

  private async load() {
    if (!this.session.isHost()) return;
    const cals = await this.api.myCalendars();
    this.calendars.set(cals);
    if (cals[0]) {
      this.form.calendar_slug = cals[0].slug;
      this.form.category = cals[0].category;
      this.form.city = cals[0].city;
    }
  }

  bad(field: string) {
    return this.refusedField() === field;
  }

  /**
   * A datetime-local value is a wall time in the event's own zone. It crosses
   * the API only after being turned into the instant that wall time names, in
   * UTC with a trailing Z. Two passes settle the offset, which also lands the
   * hour correctly across a daylight-saving boundary.
   */
  private toInstant(local: string, zone: string): string | null {
    if (!local) return null;
    const [datePart, timePart] = local.split('T');
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    const wanted = Date.UTC(y!, m! - 1, d!, hh!, mm!);

    // offsetAt: how far ahead of UTC the zone is at a given instant, in ms.
    const offsetAt = (ts: number): number => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(new Date(ts));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const asUtc = Date.UTC(
        get('year'),
        get('month') - 1,
        get('day'),
        get('hour') % 24,
        get('minute'),
        get('second'),
      );
      return asUtc - ts;
    };

    let ts = wanted - offsetAt(wanted);
    ts = wanted - offsetAt(ts);
    return new Date(ts).toISOString();
  }

  async submit() {
    if (this.working()) return;
    this.working.set(true);
    this.refusal.set('');
    this.refusedField.set('');
    try {
      const created = await this.api.createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title.trim(),
        category: this.form.category,
        city: this.form.city.trim(),
        location: this.form.location.trim(),
        time_zone: this.form.time_zone,
        starts_at: this.toInstant(this.form.starts_at, this.form.time_zone),
        ends_at: this.toInstant(this.form.ends_at, this.form.time_zone),
        capacity: Number(this.form.capacity),
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description.trim(),
      });
      this.notices.success(
        created.state === 'published'
          ? `${created.title} is live at /${created.slug}.`
          : `${created.title} is saved as a draft until every publishing field is filled in.`,
      );
      await this.router.navigate(['/event', created.slug, 'manage', 'overview']);
    } catch (err) {
      const e = err as ApiError;
      this.refusal.set(e.message);
      this.refusedField.set(e.field ?? '');
    } finally {
      this.working.set(false);
    }
  }
}

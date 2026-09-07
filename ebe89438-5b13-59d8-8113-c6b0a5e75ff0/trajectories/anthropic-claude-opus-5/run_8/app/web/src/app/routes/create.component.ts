import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, ApiError } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';
import { clearTheme } from '../core/theme';
import { visitorZone } from '../core/format';
import { AppShellComponent } from '../ui/app-shell.component';
import { CoverComponent } from '../ui/cover.component';
import { SpinnerComponent } from '../ui/icons.component';

/** One screen, never a wizard: an art column and a form column. */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CoverComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <div class="composer">
        <div class="art">
          <!-- The rotating field turns once a minute behind the art. -->
          <div class="field-layer" aria-hidden="true">
            <div class="rotating-field"></div>
            <div class="glow"></div>
            <div class="backdrop"></div>
          </div>
          <div class="preview card">
            <app-cover [seed]="coverSeed()" [title]="form.title || 'Event Name'" radius="11px" />
          </div>
          <p class="t-caption art-note">Your cover is drawn from this seed. Change the name and it changes with you.</p>
        </div>

        <div class="form">
          <h1 class="t-screen-title">Create Event</h1>

          @if (loadingCalendars()) {
            <div class="skeleton" style="height: 320px"></div>
          } @else if (calendars().length === 0) {
            <div class="empty-state">
              <h2>No Calendars Yet</h2>
              <p>A calendar is where your events live. Create one to get started.</p>
              <button type="button" class="btn btn-primary btn-pill" (click)="goCalendars()">New Calendar</button>
            </div>
          } @else {
            <form (ngSubmit)="submit()" novalidate>
              <div class="field">
                <label for="c-calendar">Which calendar</label>
                <select id="c-calendar" name="calendar" [(ngModel)]="form.calendar_slug">
                  @for (c of calendars(); track c.slug) {
                    <option [value]="c.slug">{{ c.name }}</option>
                  }
                </select>
              </div>

              <div class="switch-row">
                <label for="c-public">Publicly listed</label>
                <input id="c-public" type="checkbox" role="switch" [(ngModel)]="form.is_public" name="is_public" [attr.aria-checked]="form.is_public" />
              </div>

              <div class="field" [class.invalid]="field() === 'title'">
                <label for="c-title">The name</label>
                <input
                  id="c-title"
                  name="title"
                  type="text"
                  placeholder="Event Name"
                  [(ngModel)]="form.title"
                  (ngModelChange)="titleSig.set($event)"
                />
              </div>

              <div class="two">
                <div class="field" [class.invalid]="field() === 'starts_at'">
                  <label for="c-start">When it starts</label>
                  <input id="c-start" name="starts_at" type="datetime-local" [(ngModel)]="form.starts_at" />
                </div>
                <div class="field" [class.invalid]="field() === 'ends_at'">
                  <label for="c-end">When it ends</label>
                  <input id="c-end" name="ends_at" type="datetime-local" [(ngModel)]="form.ends_at" />
                </div>
              </div>

              <div class="field">
                <label for="c-zone">Time zone</label>
                <select id="c-zone" name="time_zone" [(ngModel)]="form.time_zone">
                  @for (z of zones; track z) {
                    <option [value]="z">{{ z }}</option>
                  }
                </select>
                <span class="caption">Times you type above are read in this zone.</span>
              </div>

              <div class="two">
                <div class="field" [class.invalid]="field() === 'city'">
                  <label for="c-city">Where it is</label>
                  <input id="c-city" name="city" type="text" [(ngModel)]="form.city" />
                </div>
                <div class="field" [class.invalid]="field() === 'category'">
                  <label for="c-category">Category</label>
                  <select id="c-category" name="category" [(ngModel)]="form.category">
                    @for (c of categories; track c) {
                      <option [value]="c">{{ label(c) }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="field">
                <label for="c-about">What it is about</label>
                <textarea id="c-about" name="description" [(ngModel)]="form.description"></textarea>
              </div>

              <div class="setting-row">
                <span class="row-label t-body">Capacity</span>
                <span class="row-control">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    [(ngModel)]="form.capacity"
                    name="capacity"
                    aria-label="Capacity, from 1 to 500"
                  />
                  <span class="t-caption">Unlimited is not offered; seats are what makes a waiting list mean something.</span>
                </span>
              </div>

              <div class="setting-row">
                <span class="row-label t-body">Waitlist Enabled</span>
                <input type="checkbox" role="switch" [(ngModel)]="form.waitlist_enabled" name="waitlist" [attr.aria-checked]="form.waitlist_enabled" aria-label="Waitlist Enabled" />
              </div>

              <div class="setting-row">
                <span class="row-label t-body">Approval required</span>
                <input type="checkbox" role="switch" [(ngModel)]="form.approval_required" name="approval" [attr.aria-checked]="form.approval_required" aria-label="Approval required" />
              </div>

              <div class="setting-row">
                <span class="row-label t-body">Theme</span>
                <span class="t-caption">Seasonal</span>
              </div>

              @if (refusal()) {
                <p class="refusal t-caption" role="alert">{{ refusal() }}</p>
              }

              <button class="btn btn-primary btn-block submit" type="submit" [disabled]="working()">
                @if (working()) {
                  <app-spinner [size]="18" />
                }
                Create Event
              </button>
            </form>
          }
        </div>
      </div>
    </app-shell>
  `,
  styles: [
    `
      .composer {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s7);
        align-items: start;
      }
      @media (min-width: 1000px) {
        .composer {
          grid-template-columns: 520px 568px;
          max-width: 1136px;
        }
      }
      .art {
        position: relative;
        padding: var(--s5);
        border-radius: var(--r-card-lg);
        overflow: hidden;
        isolation: isolate;
      }
      .field-layer {
        position: absolute;
        inset: -30%;
        z-index: -1;
      }
      .rotating-field {
        position: absolute;
        inset: 0;
        background: conic-gradient(from 0deg, #f31a7c, #146aeb, #3cbd2c, #d69712, #ab46dd, #f31a7c);
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        animation: shift-background 60000ms linear infinite;
        will-change: transform;
      }
      .glow {
        position: absolute;
        inset: 10%;
        background: radial-gradient(circle, var(--blue-30), transparent 70%);
        filter: blur(60px);
      }
      .backdrop {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(100px) saturate(1.5);
      }
      .preview {
        overflow: hidden;
        border-radius: var(--r-media);
        box-shadow: var(--elev-primary);
      }
      .art-note {
        color: var(--muted);
        margin-top: var(--s3);
      }
      h1 {
        margin-bottom: var(--s5);
      }
      .two {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s3);
      }
      @media (min-width: 450px) {
        .two {
          grid-template-columns: 1fr 1fr;
        }
      }
      .setting-row,
      .switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        padding: var(--s3) 0;
        border-top: 1px solid var(--divider);
        min-height: 44px;
      }
      .row-control {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        align-items: flex-end;
        max-width: 60%;
      }
      .row-control input {
        width: 96px;
        min-height: 44px;
        padding: var(--s2) var(--s3);
        border: 1px solid var(--ink-08);
        border-radius: var(--r-input);
        text-align: right;
      }
      .row-control .t-caption {
        color: var(--muted);
        text-align: right;
      }
      .setting-row input[type='checkbox'],
      .switch-row input[type='checkbox'] {
        width: 44px;
        height: 26px;
      }
      .refusal {
        color: var(--danger);
        font-weight: 500;
        margin: var(--s3) 0;
      }
      .submit {
        margin-top: var(--s5);
      }
      input[type='datetime-local'] {
        min-height: 44px;
      }
    `,
  ],
})
export class CreateComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loadingCalendars = signal(true);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);

  readonly zones = [
    'UTC',
    'Europe/Berlin',
    'Europe/Lisbon',
    'Europe/London',
    'Europe/Paris',
    'Europe/Madrid',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Tokyo',
    'Asia/Kolkata',
    'Australia/Sydney',
  ];

  form = {
    calendar_slug: '',
    title: '',
    category: 'running',
    city: '',
    time_zone: 'Europe/Berlin',
    starts_at: '',
    ends_at: '',
    capacity: 20,
    approval_required: false,
    waitlist_enabled: true,
    description: '',
    is_public: true,
  };

  readonly titleSig = signal('');

  readonly coverSeed = computed(() => this.titleSig() || 'new-event');

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  ngOnInit(): void {
    clearTheme();
    const zone = visitorZone();
    if (this.zones.includes(zone)) this.form.time_zone = zone;
    void this.load();
  }

  private async load() {
    this.loadingCalendars.set(true);
    try {
      const cals = await this.api.calendars();
      this.calendars.set(cals);
      if (cals.length) {
        this.form.calendar_slug = cals[0].slug;
        this.form.category = cals[0].category;
        this.form.city = cals[0].city;
      }
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.loadingCalendars.set(false);
    }
  }

  goCalendars() {
    void this.router.navigateByUrl('/calendars');
  }

  /** A wall-clock time in the event's zone becomes the instant it names. */
  private toInstant(local: string, zone: string): string | null {
    if (!local) return null;
    const [datePart, timePart] = local.split('T');
    if (!datePart || !timePart) return null;
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
    const offsetAt = (ms: number) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(new Date(ms));
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      return asUtc - ms;
    };
    let ms = guess - offsetAt(guess);
    ms = guess - offsetAt(ms);
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async submit() {
    if (this.working()) return;
    this.refusal.set('');
    this.field.set(null);
    this.titleSig.set(this.form.title);

    if (!this.form.title.trim()) {
      this.refusal.set('Give the event a name so guests know what they are joining.');
      this.field.set('title');
      return;
    }
    const starts = this.toInstant(this.form.starts_at, this.form.time_zone);
    const ends = this.toInstant(this.form.ends_at, this.form.time_zone);
    if (starts && ends && new Date(ends) <= new Date(starts)) {
      this.refusal.set('The end has to come after the start.');
      this.field.set('ends_at');
      return;
    }

    this.working.set(true);
    try {
      const created = await this.api.createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title.trim(),
        category: this.form.category,
        city: this.form.city.trim(),
        time_zone: this.form.time_zone,
        starts_at: starts,
        ends_at: ends,
        capacity: Number(this.form.capacity),
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description.trim(),
      });
      this.notices.show(
        created.state === 'published'
          ? `${created.title} is live at /${created.slug}.`
          : `${created.title} is saved as a draft; it needs a time, a place and a capacity to publish.`,
        created.state === 'published' ? 'success' : 'warning',
      );
      await this.router.navigate(['/event', created.slug, 'manage', 'overview']);
    } catch (e) {
      const err = e as ApiError;
      this.refusal.set(err.message);
      this.field.set(err.field);
    } finally {
      this.working.set(false);
    }
  }
}

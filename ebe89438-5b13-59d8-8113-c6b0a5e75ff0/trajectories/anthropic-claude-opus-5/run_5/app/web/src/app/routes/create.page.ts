import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, ApiFailure } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { NoticeService } from '../core/notice.service';
import { AppShellComponent } from '../ui/app-shell.component';
import { CoverComponent } from '../ui/cover.component';
import { EmptyStateComponent, SpinnerComponent } from '../ui/bits';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';
import { visitorZone } from '../core/time';

/**
 * One screen, never a wizard. At 1000px and above: an art column of 520px and a
 * form column of 568px. Behind it all the rotating field turns once a minute.
 */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, AppShellComponent, CoverComponent, EmptyStateComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title head">Create an event</h1>

      @if (loadingCalendars()) {
        <div class="skeleton form-skeleton" aria-busy="true"></div>
      } @else if (calendars().length === 0) {
        <app-empty-state
          title="No Calendars Yet"
          body="A calendar is where your events live. Create one to get started."
          actionLabel="New Calendar"
          actionLink="/calendars"
        />
      } @else {
        <div class="composer">
          <aside class="art" aria-hidden="true">
            <span class="art__field rotating-field"></span>
            <span class="art__glow"></span>
            <span class="art__backdrop"></span>
            <span class="art__cover">
              <app-cover [seed]="seed()" [title]="form.title || 'Event Name'" [pixelSize]="360" />
            </span>
          </aside>

          <form class="form" (ngSubmit)="submit($event)" novalidate>
            <div class="field">
              <label class="field__label" for="ev-calendar">Which calendar</label>
              <select id="ev-calendar" class="input" name="calendar" [(ngModel)]="form.calendar_slug">
                @for (c of calendars(); track c.slug) {
                  <option [value]="c.slug">{{ c.name }}</option>
                }
              </select>
            </div>

            <label class="switch">
              <input type="checkbox" name="public" [(ngModel)]="form.is_public" />
              <span>Anyone can find this event</span>
            </label>

            <div class="field" [class.field--refused]="field() === 'title'">
              <label class="field__label" for="ev-title">The name</label>
              <input
                id="ev-title"
                class="input"
                name="title"
                placeholder="Event Name"
                [(ngModel)]="form.title"
              />
            </div>

            <div class="pair">
              <div class="field" [class.field--refused]="field() === 'starts_at'">
                <label class="field__label" for="ev-start">When it starts</label>
                <input
                  id="ev-start"
                  class="input datetime"
                  type="datetime-local"
                  name="starts_at"
                  [(ngModel)]="form.starts_at"
                />
              </div>
              <div class="field" [class.field--refused]="field() === 'ends_at'">
                <label class="field__label" for="ev-end">When it ends</label>
                <input
                  id="ev-end"
                  class="input datetime"
                  type="datetime-local"
                  name="ends_at"
                  [(ngModel)]="form.ends_at"
                />
              </div>
            </div>

            <div class="pair">
              <div class="field" [class.field--refused]="field() === 'city'">
                <label class="field__label" for="ev-city">Where it is</label>
                <input id="ev-city" class="input" name="city" [(ngModel)]="form.city" />
              </div>
              <div class="field" [class.field--refused]="field() === 'time_zone'">
                <label class="field__label" for="ev-zone">Time zone</label>
                <input id="ev-zone" class="input" name="time_zone" [(ngModel)]="form.time_zone" />
              </div>
            </div>

            <div class="field" [class.field--refused]="field() === 'category'">
              <label class="field__label" for="ev-category">Category</label>
              <select id="ev-category" class="input" name="category" [(ngModel)]="form.category">
                @for (c of categories; track c) {
                  <option [value]="c">{{ label(c) }}</option>
                }
              </select>
            </div>

            <div class="field">
              <label class="field__label" for="ev-description">What it is about</label>
              <textarea
                id="ev-description"
                class="input"
                name="description"
                rows="4"
                [(ngModel)]="form.description"
              ></textarea>
            </div>

            <div class="setting">
              <div class="setting__label">
                <span class="t-body">Capacity</span>
                <span class="t-caption setting__caption">{{
                  form.unlimited ? 'Unlimited' : 'How many seats this event holds'
                }}</span>
              </div>
              <div class="setting__control">
                <label class="switch switch--sm">
                  <input type="checkbox" name="unlimited" [(ngModel)]="form.unlimited" />
                  <span>Unlimited</span>
                </label>
                @if (!form.unlimited) {
                  <input
                    class="input stepper"
                    type="number"
                    min="1"
                    max="500"
                    name="capacity"
                    aria-label="Capacity"
                    [(ngModel)]="form.capacity"
                  />
                }
              </div>
            </div>

            <div class="setting">
              <div class="setting__label">
                <span class="t-body">Waitlist Enabled</span>
                <span class="t-caption setting__caption"
                  >Keep a waiting list once every seat is taken.</span
                >
              </div>
              <label class="switch switch--sm setting__control">
                <input type="checkbox" name="waitlist" [(ngModel)]="form.waitlist_enabled" />
                <span class="visually-hidden">Waitlist Enabled</span>
              </label>
            </div>

            <div class="setting">
              <div class="setting__label">
                <span class="t-body">Theme</span>
                <span class="t-caption setting__caption">Seasonal</span>
              </div>
              <div class="setting__control">
                <span class="swatch" [style.background]="form.theme_hex"></span>
                <input
                  class="input theme-input"
                  name="theme"
                  aria-label="Theme colour"
                  [(ngModel)]="form.theme_hex"
                />
              </div>
            </div>

            <div class="setting">
              <div class="setting__label">
                <span class="t-body">Approval</span>
                <span class="t-caption setting__caption"
                  >Read each request before confirming a seat.</span
                >
              </div>
              <label class="switch switch--sm setting__control">
                <input type="checkbox" name="approval" [(ngModel)]="form.approval_required" />
                <span class="visually-hidden">Approval required</span>
              </label>
            </div>

            @if (refusal()) {
              <p class="field__refusal" role="alert">{{ refusal() }}</p>
            }

            <button type="submit" class="btn btn--primary" [disabled]="working()">
              @if (working()) {
                <app-spinner />
              }
              Create Event
            </button>
          </form>
        </div>
      }
    </app-shell>
  `,
  styles: [
    `
      .head { font-family: var(--serif); font-weight: 400; margin-bottom: var(--s5); }
      .form-skeleton { height: 520px; border-radius: var(--r-card); }

      .composer { display: grid; grid-template-columns: 1fr; gap: var(--s6); }
      @media (min-width: 1000px) {
        .composer { grid-template-columns: minmax(0, 520px) minmax(0, 568px); align-items: start; }
      }

      .art {
        position: relative;
        aspect-ratio: 1 / 1;
        border-radius: var(--r-card-lg);
        overflow: hidden;
        background: var(--paper-inset);
        display: flex;
        align-items: center;
        justify-content: center;
        order: -1;
      }
      /* One turn per minute, slow enough to read as light in the room.
         will-change sits on the moving layer alone. */
      .rotating-field {
        position: absolute;
        inset: -30%;
        background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #ab46dd, #f31a7c);
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        animation: shift-background 60000ms linear infinite;
        will-change: transform;
      }
      .art__glow {
        position: absolute;
        inset: 6%;
        background: radial-gradient(circle, rgba(243, 26, 124, 0.4), rgba(20, 106, 235, 0.2) 60%, transparent 75%);
        filter: blur(60px);
      }
      .art__backdrop {
        position: absolute;
        inset: 0;
        backdrop-filter: blur(100px) saturate(1.5);
      }
      .art__cover { position: relative; width: 68%; }

      .form { display: flex; flex-direction: column; gap: var(--s4); }
      .pair { display: grid; grid-template-columns: 1fr; gap: var(--s3); }
      @media (min-width: 650px) {
        .pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .datetime { min-height: 44px; }

      .switch { display: flex; align-items: center; gap: var(--s2); min-height: 44px; cursor: pointer; }
      .switch input { width: 20px; height: 20px; }
      .switch--sm { min-height: 44px; }

      .setting {
        display: flex;
        align-items: center;
        gap: var(--s3);
        justify-content: space-between;
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }
      .setting__label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .setting__caption { color: var(--muted); }
      .setting__control { display: flex; align-items: center; gap: var(--s2); }
      .stepper { width: 96px; }
      .theme-input { width: 116px; font-family: var(--mono); }
      .swatch {
        width: 28px;
        height: 28px;
        border-radius: var(--r-circle);
        box-shadow: var(--hairline-inset);
        flex: none;
      }
    `,
  ],
})
export class CreatePage implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private themeService = inject(ThemeService);
  private notices = inject(NoticeService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loadingCalendars = signal(true);
  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly field = signal<string | null>(null);
  readonly nonce = signal(Date.now().toString(36));

  form = {
    calendar_slug: '',
    title: '',
    category: 'running',
    city: '',
    time_zone: visitorZone(),
    starts_at: '',
    ends_at: '',
    capacity: 25,
    unlimited: false,
    approval_required: false,
    waitlist_enabled: true,
    description: '',
    is_public: true,
    theme_hex: '#146aeb',
  };

  readonly seed = computed(() => `${this.form.title || 'new event'}-${this.nonce()}`);

  ngOnInit(): void {
    this.themeService.clear();
    this.api.myCalendars().subscribe({
      next: (list) => {
        this.calendars.set(list);
        if (list[0]) {
          this.form.calendar_slug = list[0].slug;
          this.form.category = list[0].category;
          this.form.city = list[0].city;
        }
        this.loadingCalendars.set(false);
      },
      error: () => this.loadingCalendars.set(false),
    });
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  submit(event: Event): void {
    event.preventDefault();
    this.refusal.set(null);
    this.field.set(null);
    this.working.set(true);

    this.api
      .createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title,
        category: this.form.category,
        city: this.form.city,
        time_zone: this.form.time_zone,
        starts_at: toInstant(this.form.starts_at, this.form.time_zone),
        ends_at: toInstant(this.form.ends_at, this.form.time_zone),
        capacity: this.form.unlimited ? undefined : Number(this.form.capacity),
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description,
        theme_hex: this.form.theme_hex,
      })
      .subscribe({
        next: (created) => {
          this.working.set(false);
          this.notices.success(
            created.state === 'published'
              ? `${created.title} is live at /${created.slug}.`
              : `${created.title} was saved as a draft; it needs a category, a city, times and a capacity to publish.`,
          );
          this.router.navigateByUrl(
            created.state === 'published'
              ? `/${created.slug}`
              : `/event/${created.slug}/manage/overview`,
          );
        },
        error: (e: ApiFailure) => {
          this.working.set(false);
          this.refusal.set(e.message);
          this.field.set(e.field ?? null);
        },
      });
  }
}

/**
 * A local wall-clock value typed into the composer is converted to the instant
 * it names in the event's own zone, so what crosses the API is always UTC.
 */
function toInstant(local: string, zone: string): string | undefined {
  if (!local) return undefined;
  const [datePart, timePart] = local.split('T');
  if (!datePart || !timePart) return undefined;
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle any offset, including a shift across a DST boundary.
  let instant = guess;
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMs(new Date(instant), zone);
    instant = guess - offset;
  }
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function zoneOffsetMs(date: Date, zone: string): number {
  try {
    const asZone = new Date(date.toLocaleString('en-US', { timeZone: zone }));
    const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    return asZone.getTime() - asUtc.getTime();
  } catch {
    return 0;
  }
}

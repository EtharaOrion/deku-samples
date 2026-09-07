import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { Notices } from '../core/notices';
import { visitorZone } from '../core/timefmt';
import { CATEGORIES, CATEGORY_LABELS, type Calendar, type Refusal } from '../core/models';
import { Shell } from '../ui/chrome';
import { CoverArt } from '../ui/cover-art';

/** One screen, never a wizard. */
@Component({
  selector: 'app-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Shell, CoverArt],
  template: `
    <app-shell>
      <h1 class="t-screen-title">Create Event</h1>

      <div class="cols">
        <aside class="art" aria-hidden="true">
          <!-- the rotating field turns once a minute, slow enough to read as
               light in the room -->
          <span class="art-rotor rotating-field"></span>
          <span class="art-glow"></span>
          <span class="art-backdrop"></span>
          <span class="art-cover">
            <app-cover [seed]="seed()" [title]="form.title || 'Event Name'" radius="var(--r-card-lg)" [glow]="true" />
          </span>
        </aside>

        <form class="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">Calendar</span>
            <select class="field-control" name="calendar" [(ngModel)]="form.calendar_slug">
              @for (c of calendars(); track c.slug) {
                <option [value]="c.slug">{{ c.name }}</option>
              }
            </select>
            @if (!calendars().length && !loading()) {
              <span class="field-caption">Create a calendar first — an event lives on one.</span>
            }
          </label>

          <div class="setting">
            <span class="setting-label t-body" id="pub-l">Public</span>
            <label class="setting-control">
              <input type="checkbox" name="is_public" [(ngModel)]="isPublic" aria-labelledby="pub-l" />
              <span class="sr-only">Make this event public</span>
            </label>
          </div>

          <label class="field">
            <span class="field-label">Name</span>
            <input
              class="field-control"
              name="title"
              placeholder="Event Name"
              [(ngModel)]="form.title"
              [attr.aria-invalid]="fieldRefused('title') ? 'true' : null"
            />
            @if (fieldRefused('title')) {
              <span class="field-refusal">{{ refusal() }}</span>
            }
          </label>

          <div class="pair">
            <label class="field">
              <span class="field-label">Starts</span>
              <input class="field-control" type="datetime-local" name="starts" [(ngModel)]="form.starts_at" />
            </label>
            <label class="field">
              <span class="field-label">Ends</span>
              <input
                class="field-control"
                type="datetime-local"
                name="ends"
                [(ngModel)]="form.ends_at"
                [attr.aria-invalid]="fieldRefused('ends_at') ? 'true' : null"
              />
              @if (fieldRefused('ends_at')) {
                <span class="field-refusal">{{ refusal() }}</span>
              }
            </label>
          </div>

          <div class="pair">
            <label class="field">
              <span class="field-label">City</span>
              <input class="field-control" name="city" [(ngModel)]="form.city" />
            </label>
            <label class="field">
              <span class="field-label">Time zone</span>
              <input class="field-control" name="tz" [(ngModel)]="form.time_zone" />
            </label>
          </div>

          <label class="field">
            <span class="field-label">Category</span>
            <select class="field-control" name="category" [(ngModel)]="form.category">
              @for (c of categories; track c) {
                <option [value]="c">{{ label(c) }}</option>
              }
            </select>
          </label>

          <label class="field">
            <span class="field-label">About</span>
            <textarea class="field-control" name="description" [(ngModel)]="form.description"></textarea>
          </label>

          <div class="setting">
            <span class="setting-label t-body" id="cap-l">Capacity</span>
            <span class="setting-control cap">
              <input
                class="field-control cap-input"
                type="number"
                min="1"
                max="500"
                name="capacity"
                [(ngModel)]="form.capacity"
                aria-labelledby="cap-l"
                [attr.aria-invalid]="fieldRefused('capacity') ? 'true' : null"
              />
              <label class="inline"><input type="checkbox" name="unlimited" [(ngModel)]="unlimited" /> Unlimited</label>
              <label class="inline"><input type="checkbox" name="wl" [(ngModel)]="form.waitlist_enabled" /> Waitlist Enabled</label>
            </span>
          </div>
          @if (fieldRefused('capacity')) {
            <p class="field-refusal">{{ refusal() }}</p>
          }

          <div class="setting">
            <span class="setting-label t-body" id="app-l">Approval</span>
            <label class="setting-control inline">
              <input type="checkbox" name="approval" [(ngModel)]="form.approval_required" aria-labelledby="app-l" />
              Approval required
            </label>
          </div>

          <div class="setting">
            <span class="setting-label t-body" id="th-l">Theme</span>
            <label class="setting-control inline">
              <input type="checkbox" name="seasonal" [(ngModel)]="seasonal" aria-labelledby="th-l" />
              Seasonal
            </label>
          </div>

          @if (refusal() && !refusalField()) {
            <p class="field-refusal">{{ refusal() }}</p>
          }

          <button class="btn btn-primary btn-block submit" type="submit" [disabled]="busy() || !calendars().length">
            @if (busy()) {
              <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" fill="none" stroke-width="6" /></svg>
            }
            Create Event
          </button>
        </form>
      </div>
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .cols {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s5);
      }
      @media (min-width: 1000px) {
        .cols {
          grid-template-columns: 520px 568px;
          gap: 48px;
        }
      }
      .art {
        position: relative;
        min-height: 320px;
        border-radius: var(--r-card-lg);
        overflow: hidden;
        background: var(--paper-inset);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s6);
        isolation: isolate;
      }
      .art-rotor {
        position: absolute;
        width: 160%;
        height: 160%;
        background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #ab46dd, #f31a7c);
        filter: brightness(1.3) saturate(0) blur(50px);
        mix-blend-mode: overlay;
        will-change: transform;
        animation: shift-background 60000ms linear infinite;
        z-index: -1;
      }
      .art-glow {
        position: absolute;
        inset: 10%;
        background: radial-gradient(circle, #146aeb, transparent 70%);
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
      .art-cover {
        display: block;
        width: 100%;
        max-width: 320px;
        position: relative;
        z-index: 1;
      }
      .form {
        max-width: 568px;
      }
      .pair {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s3);
      }
      @media (min-width: 484px) {
        .pair {
          grid-template-columns: 1fr 1fr;
        }
      }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        padding: var(--s3) 0;
        border-bottom: 1px solid var(--paper-divider);
        margin-bottom: var(--s3);
        flex-wrap: wrap;
        min-height: 44px;
      }
      .setting-label {
        font-weight: 500;
      }
      .setting-control {
        display: flex;
        align-items: center;
        gap: var(--s3);
        flex-wrap: wrap;
      }
      .cap-input {
        width: 96px;
        min-height: 44px;
      }
      .inline {
        display: inline-flex;
        align-items: center;
        gap: var(--s2);
        min-height: 44px;
        font-size: 15px;
        line-height: 22px;
        color: var(--ink-secondary);
      }
      input[type='checkbox'] {
        width: 20px;
        height: 20px;
        accent-color: var(--blue);
      }
      input[type='datetime-local'] {
        min-height: 44px;
      }
      .submit {
        margin-top: var(--s5);
      }
    `,
  ],
})
export class CreateRoute {
  private api = inject(Api);
  private router = inject(Router);
  private notices = inject(Notices);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly refusalField = signal<string | null>(null);

  isPublic = true;
  unlimited = false;
  seasonal = false;

  form = {
    calendar_slug: '',
    title: '',
    category: 'running',
    city: '',
    time_zone: visitorZone(),
    starts_at: '',
    ends_at: '',
    capacity: 20,
    approval_required: false,
    waitlist_enabled: true,
    description: '',
  };

  readonly seed = computed(() => this.form.title || 'new-event');

  constructor() {
    this.api.calendars().subscribe({
      next: (list) => {
        this.calendars.set(list);
        if (list.length) this.form.calendar_slug = list[0].slug;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  fieldRefused(name: string) {
    return this.refusalField() === name;
  }

  /** A local datetime typed by the host becomes an instant in UTC on the wire. */
  private toInstant(local: string): string | undefined {
    if (!local) return undefined;
    const d = new Date(local);
    return isNaN(d.getTime()) ? undefined : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.refusalField.set(null);
    this.api
      .createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title.trim(),
        category: this.form.category,
        city: this.form.city.trim(),
        time_zone: this.form.time_zone.trim() || 'UTC',
        starts_at: this.toInstant(this.form.starts_at),
        ends_at: this.toInstant(this.form.ends_at),
        capacity: this.unlimited ? null : Number(this.form.capacity),
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description,
      })
      .subscribe({
        next: (e) => {
          this.busy.set(false);
          this.notices.success(
            e.state === 'published'
              ? `${e.title} is published at /${e.slug}.`
              : `${e.title} is saved as a draft — fill in the rest to publish it.`
          );
          this.router.navigate(['/event', e.slug, 'manage', 'overview']);
        },
        error: (err: Refusal) => {
          this.busy.set(false);
          this.refusal.set(err.message);
          this.refusalField.set((err.field as string) ?? null);
          this.notices.refuse(err.message);
        },
      });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }
}

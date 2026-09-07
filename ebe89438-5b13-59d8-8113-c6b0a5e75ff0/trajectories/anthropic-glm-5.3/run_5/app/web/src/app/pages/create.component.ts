import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { CATEGORIES } from '../categories';
import { CoverComponent } from '../ui/cover.component';
import type { Calendar, CommunityEvent } from '../types';

@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, CoverComponent],
  template: `
    <div class="create-grid">
      <div class="art-col" aria-hidden="true">
        <div class="field-turn-wrap">
          <div class="field-turn"></div>
        </div>
        <div class="art-preview">
          <app-cover [seed]="previewSeedValue" [title]="form.title || 'Event Name'" [showTitle]="true"></app-cover>
        </div>
      </div>

      <form class="form-col" (submit)="submit($event)" novalidate>
        <h1 class="screen-title">Create an event</h1>

        <div class="field">
          <label for="e-cal">Calendar</label>
          <select id="e-cal" name="calendar_slug" [(ngModel)]="form.calendar_slug">
            @for (cal of calendars(); track cal.slug) {
              <option [value]="cal.slug">{{ cal.name }}</option>
            }
          </select>
          @if (calendars().length === 0) {
            <p class="caption">You need a calendar first. Create one from Calendars.</p>
          }
        </div>

        <div class="row between switch-row">
          <label for="e-public">Public</label>
          <button id="e-public" type="button" class="switch" role="switch" [attr.aria-checked]="form.is_public"
                  (click)="form.is_public = !form.is_public" aria-label="Public event"></button>
        </div>

        <div class="field" [class.refused]="refusalField === 'title'">
          <label for="e-title">Name</label>
          <input id="e-title" type="text" placeholder="Event Name" name="title" [(ngModel)]="form.title" required />
          @if (refusalField === 'title') { <p class="refusal">{{ refusal }}</p> }
        </div>

        <div class="two-col">
          <div class="field" [class.refused]="refusalField === 'starts_at'">
            <label for="e-starts">Starts</label>
            <input id="e-starts" type="datetime-local" name="starts_at" [(ngModel)]="form.starts_at" required />
            @if (refusalField === 'starts_at') { <p class="refusal">{{ refusal }}</p> }
          </div>
          <div class="field" [class.refused]="refusalField === 'ends_at'">
            <label for="e-ends">Ends</label>
            <input id="e-ends" type="datetime-local" name="ends_at" [(ngModel)]="form.ends_at" required />
            @if (refusalField === 'ends_at') { <p class="refusal">{{ refusal }}</p> }
          </div>
        </div>

        <div class="two-col">
          <div class="field" [class.refused]="refusalField === 'city'">
            <label for="e-city">Location</label>
            <input id="e-city" type="text" placeholder="City" name="city" [(ngModel)]="form.city" required />
            @if (refusalField === 'city') { <p class="refusal">{{ refusal }}</p> }
          </div>
          <div class="field">
            <label for="e-tz">Time zone</label>
            <select id="e-tz" name="time_zone" [(ngModel)]="form.time_zone">
              @for (tz of zones; track tz) { <option [value]="tz">{{ tz }}</option> }
            </select>
          </div>
        </div>

        <div class="field" [class.refused]="refusalField === 'category'">
          <label for="e-cat">Category</label>
          <select id="e-cat" name="category" [(ngModel)]="form.category">
            @for (cat of categories; track cat.slug) { <option [value]="cat.slug">{{ cat.label }}</option> }
          </select>
        </div>

        <div class="field">
          <label for="e-desc">About</label>
          <textarea id="e-desc" name="description" [(ngModel)]="form.description"
                    placeholder="What should a guest expect?"></textarea>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <p class="setting-label">Capacity</p>
            <p class="caption">Unlimited is not available on the free tier; pick a number from 1 to 500.</p>
          </div>
          <div class="stepper">
            <button type="button" (click)="step(-10)" [disabled]="form.capacity <= 1" aria-label="Ten fewer seats">−10</button>
            <button type="button" (click)="step(-1)" [disabled]="form.capacity <= 1" aria-label="One fewer seat">−</button>
            <span class="value" aria-live="polite">{{ form.capacity }}</span>
            <button type="button" (click)="step(1)" [disabled]="form.capacity >= 500" aria-label="One more seat">+</button>
            <button type="button" (click)="step(10)" [disabled]="form.capacity >= 500" aria-label="Ten more seats">+10</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-text"><p class="setting-label">Approval</p>
            <p class="caption">Review each request before a seat is held.</p></div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="form.approval_required"
                  (click)="form.approval_required = !form.approval_required" aria-label="Approval required"></button>
        </div>

        <div class="setting-row">
          <div class="setting-text"><p class="setting-label">Waitlist Enabled</p>
            <p class="caption">A full event takes a waiting list instead of refusing.</p></div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="form.waitlist_enabled"
                  (click)="form.waitlist_enabled = !form.waitlist_enabled" aria-label="Waitlist enabled"></button>
        </div>

        <div class="setting-row">
          <div class="setting-text"><p class="setting-label">Theme</p><p class="caption">Seasonal</p></div>
          <span class="theme-swatch" aria-hidden="true"></span>
        </div>

        <p class="form-refusal" role="alert">{{ refusal }}</p>

        <div class="actions">
          <button class="btn primary" type="submit" [disabled]="working()">
            @if (working()) { <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg> Creating }
            @else { Create Event }
          </button>
          <label class="publish-row">
            <input type="checkbox" name="publish" [(ngModel)]="form.publish" />
            Publish now
          </label>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
    :host { display: block; }
    .create-grid { display: grid; grid-template-columns: 520px minmax(0, 568px); gap: 48px; align-items: start; }
    .art-col { position: relative; }
    .art-preview { position: relative; z-index: 1; }
    .art-preview app-cover { width: 100%; aspect-ratio: 1; border-radius: 24px; overflow: hidden; display: block; }
    .field-turn-wrap { position: absolute; inset: -40px; filter: blur(100px) saturate(1.5); opacity: 0.5; z-index: 0; }
    .field-turn {
      position: absolute; inset: 0; will-change: transform;
      animation: shift-background 60000ms linear infinite;
      background: conic-gradient(from 0deg, #f31a7c, #146aeb, #3cbd2c, #ab46dd, #d69712, #f31a7c);
      filter: brightness(1.3) saturate(0) blur(50px);
    }
    .form-col { display: flex; flex-direction: column; gap: 16px; position: relative; z-index: 1; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .switch-row { border-top: 1px solid var(--divider); padding-top: 16px; }
    .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--divider); padding: 16px 0; }
    .setting-text { display: flex; flex-direction: column; gap: 2px; }
    .setting-label { margin: 0; font-size: 16px; line-height: 24px; }
    .theme-swatch { width: 48px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #f31a7c, #d69712); }
    .form-refusal { min-height: 20px; margin: 0; color: var(--danger); font-size: 14px; }
    .form-refusal:empty { display: none; }
    .actions { display: flex; align-items: center; gap: 16px; margin-top: 8px; }
    .publish-row { display: inline-flex; gap: 8px; align-items: center; font-size: 14px; color: var(--ink-2); }
    @media (max-width: 999px) { .create-grid { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .field-turn { animation: none; } }
  `],
})
export class CreateComponent {
  readonly categories = CATEGORIES;
  readonly zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
  calendars = signal<Calendar[]>([]);
  working = signal(false);
  refusal = '';
  refusalField: string | null = null;

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
    publish: true,
  };

  get previewSeedValue(): string {
    return `preview-${this.form.title || 'event'}-${this.form.city || 'city'}`;
  }

  constructor(private api: ApiService, private router: Router, private notice: NoticeService) {
    this.api.calendars().then(
      (rows) => {
        this.calendars.set(rows);
        if (rows.length > 0) this.form.calendar_slug = rows[0].slug;
      },
      () => {},
    );
  }

  step(delta: number) {
    this.form.capacity = Math.max(1, Math.min(500, this.form.capacity + delta));
  }

  /** A datetime-local string becomes an RFC 3339 instant in the event's own zone. */
  private toInstant(local: string, tz: string): string | null {
    if (!local) return null;
    const [datePart, timePart] = local.split('T');
    if (!datePart || !timePart) return null;
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi] = timePart.split(':').map(Number);
    if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
    // Interpret the wall time in the event zone, then emit a UTC instant.
    const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
    let offset = 0;
    try {
      const asUtc = new Date(guess.getTime());
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
      const label = fmt.formatToParts(asUtc).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
      const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(label);
      if (m) offset = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
    } catch {
      offset = 0;
    }
    const instant = new Date(guess.getTime() - offset * 60000);
    return instant.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async submit(event: Event) {
    event.preventDefault();
    this.refusal = '';
    this.refusalField = null;
    if (!this.form.calendar_slug) {
      this.refusal = 'Pick one of your own calendars for this event.';
      this.refusalField = 'calendar_slug';
      return;
    }
    const startsAt = this.toInstant(this.form.starts_at, this.form.time_zone);
    const endsAt = this.toInstant(this.form.ends_at, this.form.time_zone);
    if (!startsAt) {
      this.refusal = 'Give a start time.';
      this.refusalField = 'starts_at';
      return;
    }
    if (!endsAt) {
      this.refusal = 'Give an end time.';
      this.refusalField = 'ends_at';
      return;
    }
    this.working.set(true);
    try {
      const created = await this.api.createEvent({
        calendar_slug: this.form.calendar_slug,
        title: this.form.title,
        category: this.form.category,
        city: this.form.city,
        time_zone: this.form.time_zone,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity: this.form.capacity,
        approval_required: this.form.approval_required,
        waitlist_enabled: this.form.waitlist_enabled,
        description: this.form.description,
        state: this.form.publish ? 'published' : 'draft',
      });
      this.notice.success(this.form.publish ? 'Event published.' : 'Draft saved.');
      await this.router.navigate(['/', created.slug]);
    } catch (e) {
      const failure = e as ApiFailure;
      this.refusal = failure.message;
      this.refusalField = failure.field ?? null;
      this.notice.danger(failure.message);
    } finally {
      this.working.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Calendar, EventSummary } from '../api';
import { CATEGORIES, Toast } from '../domain';
import { Cover } from '../ui/cover';
import { Icon } from '../ui/icon';
import { fromLocalInputValue, toLocalInputValue } from '../time';

/**
 * The event composer: one screen, never a wizard. An art column of 520px and a
 * form column of 568px, with the rotating field turning once a minute behind it.
 */
@Component({
  selector: 'g-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="art" aria-hidden="true">
        <div class="field-glow"></div>
        <div class="art-card">
          <g-cover [seed]="previewSeed()" [title]="title() || 'Event Name'" />
        </div>
      </div>

      <form class="form stack-lg" (ngSubmit)="submit()" novalidate>
        <h1 class="t-h1">Create an event</h1>

        <label class="field">
          <span>Calendar</span>
          <select [(ngModel)]="calendarSlug" name="calendar" required>
            @for (c of calendars(); track c.id) { <option [value]="c.slug">{{ c.name }}</option> }
          </select>
          @if (fieldError('calendar_slug'); as m) { <span class="field-error">{{ m }}</span> }
        </label>

        <label class="field">
          <span>Visibility</span>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="isPublic" (click)="isPublic = !isPublic">
            <span class="track"><span class="knob"></span></span>
            <span>{{ isPublic ? 'Public calendar' : 'Private calendar' }}</span>
          </button>
          <span class="field-hint">Set on the calendar; shown here for context.</span>
        </label>

        <label class="field">
          <span>Name</span>
          <input type="text" [(ngModel)]="title" name="title" placeholder="Event Name" required />
          @if (fieldError('title'); as m) { <span class="field-error">{{ m }}</span> }
        </label>

        <div class="two">
          <label class="field">
            <span>Starts</span>
            <input type="datetime-local" [(ngModel)]="startsAt" name="startsAt" required />
            @if (fieldError('starts_at'); as m) { <span class="field-error">{{ m }}</span> }
          </label>
          <label class="field">
            <span>Ends</span>
            <input type="datetime-local" [(ngModel)]="endsAt" name="endsAt" required />
            @if (fieldError('ends_at'); as m) { <span class="field-error">{{ m }}</span> }
          </label>
        </div>

        <div class="two">
          <label class="field">
            <span>City</span>
            <input type="text" [(ngModel)]="city" name="city" placeholder="Berlin" required />
            @if (fieldError('city'); as m) { <span class="field-error">{{ m }}</span> }
          </label>
          <label class="field">
            <span>Category</span>
            <select [(ngModel)]="category" name="category">
              @for (c of categories; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
            </select>
          </label>
        </div>

        <label class="field">
          <span>Time zone</span>
          <select [(ngModel)]="timeZone" name="timeZone">
            @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
          </select>
        </label>

        <label class="field">
          <span>What it is about</span>
          <textarea [(ngModel)]="description" name="description" rows="4" placeholder="One paragraph that makes somebody want to come."></textarea>
        </label>

        <div class="setting spread">
          <div>
            <div class="t-row strong">Capacity</div>
            <span class="field-hint">Unlimited is not offered; every event has a room.</span>
          </div>
          <div class="stepper" role="group" aria-label="Capacity">
            <button type="button" (click)="stepDown()" [disabled]="capacity <= 1" aria-label="Fewer seats">−</button>
            <span class="value">{{ capacity }}</span>
            <button type="button" (click)="stepUp()" [disabled]="capacity >= 500" aria-label="More seats">+</button>
          </div>
        </div>
        @if (fieldError('capacity'); as m) { <span class="field-error">{{ m }}</span> }

        <div class="setting spread">
          <div>
            <div class="t-row strong">Waitlist Enabled</div>
            <span class="field-hint">When the room fills, further guests queue in order.</span>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="waitlist" (click)="waitlist = !waitlist">
            <span class="track"><span class="knob"></span></span>
            <span class="sr-only">Waitlist enabled</span>
          </button>
        </div>

        <div class="setting spread">
          <div>
            <div class="t-row strong">Approvals</div>
            <span class="field-hint">Requests wait for you rather than taking a seat.</span>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="approval" (click)="approval = !approval">
            <span class="track"><span class="knob"></span></span>
            <span class="sr-only">Approval required</span>
          </button>
        </div>

        <div class="setting spread">
          <div>
            <div class="t-row strong">Theme</div>
            <span class="field-hint">Seasonal — the page derives its palette from the cover.</span>
          </div>
          <span class="pill">Seasonal</span>
        </div>

        @if (refusal(); as r) { <p class="refusal t-row" role="alert">{{ r }}</p> }

        <button class="btn btn-primary btn-block" type="submit" [disabled]="working()">
          @if (working()) { <span class="rotator" aria-hidden="true"></span> } Create Event
        </button>
        <p class="field-hint">A submission missing anything needed to publish is stored as a draft you can finish later.</p>
      </form>
    </div>
  `,
  imports: [FormsModule, RouterLink, Cover, Icon],
  styles: [`
    :host { display: block; }
    .wrap { display: grid; grid-template-columns: 520px minmax(0, 568px); gap: 48px; align-items: start; }
    @media (max-width: 999px) { .wrap { grid-template-columns: minmax(0, 568px); } .art { order: -1; } }
    .art { position: relative; padding: 24px; }
    .art-card { position: relative; border-radius: 12px; }
    .field-glow {
      position: absolute; inset: -40px; border-radius: 50%;
      filter: brightness(1.3) saturate(0) blur(50px); mix-blend-mode: overlay; opacity: 0.7;
      background: conic-gradient(from 0deg, #f31a7c, #146aeb, #3cbd2c, #ab46dd, #f31a7c);
      animation: shift-background 60000ms linear infinite;
      will-change: transform;
    }
    @media (prefers-reduced-motion: reduce) { .field-glow { animation: none; } }
    .backdrop { position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .form { position: relative; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 483px) { .two { grid-template-columns: 1fr; } }
    .setting { border-top: 1px solid var(--divider); padding-top: 16px; gap: 16px; }
    .strong { font-weight: 500; }
    .refusal { color: #c4150e; }
    @keyframes shift-background { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class CreatePage {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(Toast);

  categories = CATEGORIES;
  zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];

  calendars = signal<Calendar[]>([]);
  calendarSlug = '';
  title = signal('');
  city = '';
  category = 'running';
  timeZone = 'UTC';
  description = '';
  startsAt = '';
  endsAt = '';
  capacity = 20;
  waitlist = true;
  approval = false;
  isPublic = true;
  working = signal(false);
  refusal = signal<string | null>(null);
  fields = signal<Record<string, string>>({});

  previewSeed = computed(() => this.title() || 'gather');

  constructor() {
    this.api.calendars().subscribe((rows) => {
      this.calendars.set(rows);
      const wanted = this.route.snapshot.queryParamMap.get('calendar');
      const pick = rows.find((c) => c.slug === wanted) ?? rows[0];
      if (pick) {
        this.calendarSlug = pick.slug;
        this.city = pick.city;
        this.category = pick.category;
        this.timeZone = pick.category === 'books' ? 'Europe/Lisbon' : this.timeZone;
      }
    });
  }

  fieldError(key: string): string | null {
    return this.fields()[key] ?? null;
  }

  stepDown(): void { this.capacity = Math.max(1, this.capacity - 1); }
  stepUp(): void { this.capacity = Math.min(500, this.capacity + 1); }

  submit(): void {
    if (this.working()) return;
    const fields: Record<string, string> = {};
    if (!this.title().trim()) fields.title = 'Give the event a name.';
    if (!this.calendarSlug) fields.calendar_slug = 'Choose a calendar.';
    if (!this.startsAt) fields.starts_at = 'Add a UTC time ending in Z.';
    if (!this.endsAt) fields.ends_at = 'Add a UTC time ending in Z.';
    if (!this.city.trim()) fields.city = 'Add a city.';
    if (Object.keys(fields).length) {
      this.fields.set(fields);
      this.refusal.set('Fill in the fields named below and try again.');
      return;
    }
    if (fromLocalInputValue(this.endsAt)! <= fromLocalInputValue(this.startsAt)!) {
      this.fields.set({ ends_at: 'Pick a time after the start.' });
      this.refusal.set('The end has to come after the start.');
      return;
    }
    this.fields.set({});
    this.working.set(true);
    this.refusal.set(null);
    this.api.createEvent({
      calendar_slug: this.calendarSlug,
      title: this.title().trim(),
      category: this.category,
      city: this.city.trim(),
      time_zone: this.timeZone,
      starts_at: fromLocalInputValue(this.startsAt),
      ends_at: fromLocalInputValue(this.endsAt),
      capacity: this.capacity,
      approval_required: this.approval,
      waitlist_enabled: this.waitlist,
      description: this.description.trim(),
    }).subscribe({
      next: (ev) => {
        this.working.set(false);
        if (ev.state === 'published') {
          this.toast.show(`${ev.title} is published at /${ev.slug}.`, 'success');
          this.router.navigate(['/', ev.slug]);
        } else {
          this.toast.show(`${ev.title} is saved as a draft. Finish it to publish.`, 'warning');
          this.router.navigate(['/event', ev.slug, 'manage', 'overview']);
        }
      },
      error: (err) => {
        this.working.set(false);
        this.fields.set(err?.error?.fields ?? {});
        this.refusal.set(err?.error?.message ?? 'We could not create that event. Try again in a moment.');
      },
    });
  }
}

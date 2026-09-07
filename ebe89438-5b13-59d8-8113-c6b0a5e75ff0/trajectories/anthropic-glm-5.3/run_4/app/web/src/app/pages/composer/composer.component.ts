import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { CoverService } from '../../core/cover.service';

@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="stage">
      <div class="art" aria-hidden="true">
        <div class="rotator"></div>
        <div class="glow"></div>
        <div class="backdrop"></div>
        <div class="art-card card-lg">
          <div class="cover-wrap cover-saturate preview">
            <img class="cover-img" [src]="previewCover()" alt="" />
            <div class="cover-glow"></div>
            <div class="cover-sheen"></div>
          </div>
        </div>
      </div>

      <form class="form" (submit)="submit($event)">
        <h1 class="screen-title">Create an event</h1>
        <p class="caption sub">One screen, no wizard. Publish when the details are ready.</p>

        <div class="field">
          <label for="c-cal">Calendar</label>
          <select id="c-cal" [(ngModel)]="draft.calendar_slug" required>
            @for (cal of calendars(); track cal.id) { <option [value]="cal.slug">{{ cal.name }}</option> }
          </select>
          <span class="caption">Events live on one of your calendars.</span>
        </div>

        <div class="switchrow">
          <span id="c-public">Public calendar listing</span>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="draft.public" aria-labelledby="c-public" (click)="draft.public = !draft.public"></button>
        </div>

        <div class="field">
          <label for="c-title">Name</label>
          <input id="c-title" type="text" [(ngModel)]="draft.title" placeholder="Event Name" required />
          @if (refusalField() === 'title') { <p class="refusal">{{ refusal() }}</p> }
        </div>

        <div class="two">
          <div class="field">
            <label for="c-start">Starts</label>
            <input id="c-start" type="datetime-local" [(ngModel)]="draft.starts" required />
          </div>
          <div class="field">
            <label for="c-end">Ends</label>
            <input id="c-end" type="datetime-local" [(ngModel)]="draft.ends" required />
          </div>
        </div>
        <span class="caption tz-note">Times are read in {{ zone() }} and stored as the same instant in UTC.</span>
        @if (refusalField() === 'starts_at' || refusalField() === 'ends_at') { <p class="refusal">{{ refusal() }}</p> }

        <div class="two">
          <div class="field">
            <label for="c-city">Where</label>
            <input id="c-city" type="text" [(ngModel)]="draft.city" placeholder="City" required />
          </div>
          <div class="field">
            <label for="c-zone">Time zone</label>
            <select id="c-zone" [(ngModel)]="draft.time_zone">
              @for (tz of zones; track tz) { <option [value]="tz">{{ tz }}</option> }
            </select>
          </div>
        </div>

        <div class="field">
          <label for="c-desc">About</label>
          <textarea id="c-desc" [(ngModel)]="draft.description" placeholder="What the evening is, in a sentence or two."></textarea>
        </div>

        <div class="setting">
          <div class="labels"><span class="l">Capacity</span><span class="caption u">Unlimited</span></div>
          <input class="step" id="c-cap" type="number" min="1" max="500" [(ngModel)]="draft.capacity" required aria-label="Capacity" />
          @if (refusalField() === 'capacity') { <p class="refusal">{{ refusal() }}</p> }
        </div>

        <div class="setting">
          <div class="labels"><span class="l">Waitlist Enabled</span></div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="draft.waitlist" aria-labelledby="wl-l" id="wl-btn" (click)="draft.waitlist = !draft.waitlist"></button>
          <span class="sr-only" id="wl-l">Waitlist Enabled</span>
        </div>

        <div class="setting">
          <div class="labels"><span class="l">Theme</span><span class="caption u">Seasonal</span></div>
          <div class="swatches" role="radiogroup" aria-label="Theme">
            @for (s of swatches; track s) {
              <button type="button" class="swatch" [class.on]="draft.theme === s" [style.background]="s" (click)="draft.theme = s" [attr.aria-label]="'Theme ' + s"></button>
            }
          </div>
        </div>

        <button class="btn btn-primary submit" type="submit" [disabled]="working()">
          @if (working()) { <span class="spinner"></span> } Create Event
        </button>
        <p class="caption note">A missing detail keeps the event as a draft you can finish later.</p>
      </form>
    </div>
  `,
  styles: [`
    .stage { display: grid; grid-template-columns: 520px 568px; gap: 48px; justify-content: center; padding: 96px 24px 64px; position: relative; }
    .art { position: relative; min-height: 480px; }
    .rotator, .glow, .backdrop { position: absolute; inset: 0; border-radius: 100%; pointer-events: none; }
    .rotator {
      background: radial-gradient(circle at 30% 30%, rgba(243,26,124,0.5), rgba(171,70,221,0.35));
      filter: brightness(1.3) saturate(0) blur(50px);
      mix-blend-mode: overlay;
      animation: shift-background 60000ms linear infinite;
      will-change: transform;
    }
    .glow { background: radial-gradient(circle at 70% 60%, rgba(214,151,18,0.45), transparent 60%); filter: blur(60px); }
    .backdrop { backdrop-filter: blur(100px) saturate(1.5); background: rgba(255,255,255,0.25); }
    .art-card { position: absolute; inset: 12% 18%; background: rgba(255,255,255,0.7); padding: 16px; display: flex; }
    .preview { flex: 1; border-radius: 12.8% / 5.7%; overflow: hidden; }
    .form { display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; }
    .sub { color: var(--muted); margin-bottom: 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .tz-note { color: var(--muted); margin-top: -8px; }
    .setting { border: 1px solid var(--ink-08); border-radius: var(--r-card); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .labels { display: flex; flex-direction: column; }
    .labels .l { font-size: 16px; line-height: 24px; }
    .labels .u { color: var(--muted); }
    .step { width: 110px; min-height: 44px; padding: 8px 12px; border-radius: var(--r-input); border: 1px solid var(--ink-08); }
    .swatches { display: flex; gap: 8px; }
    .swatch { width: 36px; height: 36px; border-radius: 100%; border: 2px solid transparent; }
    .swatch.on { border-color: var(--ink); }
    .submit { align-self: flex-start; min-width: 200px; margin-top: 8px; }
    .note { color: var(--muted); }
    .switchrow { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
    @media (max-width: 1000px) {
      .stage { grid-template-columns: minmax(0, 568px); }
      .art { min-height: 280px; }
    }
    @media (max-width: 450px) { .two { grid-template-columns: 1fr; } }
  `],
})
export class ComposerComponent implements OnInit {
  private api = inject(ApiService);
  private toasts = inject(ToastService);
  private router = inject(Router);
  private covers = inject(CoverService);

  calendars = signal<any[]>([]);
  working = signal(false);
  refusal = signal('');
  refusalField = signal('');

  zones = ['Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];
  swatches = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

  draft: any = {
    calendar_slug: '', public: true, title: '', starts: '', ends: '',
    city: '', time_zone: 'Europe/Berlin', description: '', capacity: 20,
    waitlist: true, theme: '#146aeb',
  };

  async ngOnInit(): Promise<void> {
    const cals = await this.api.myCalendars();
    this.calendars.set(cals);
    if (cals.length > 0) this.draft.calendar_slug = cals[0].slug;
  }

  zone(): string { return this.draft.time_zone; }

  /** datetime-local value in the chosen zone -> UTC instant with Z. */
  toUtc(local: string): string | null {
    if (!local) return null;
    // Interpret the wall time in the event's zone by offset lookup.
    const guess = new Date(`${local}:00Z`);
    if (Number.isNaN(guess.getTime())) return null;
    const offset = this.offsetFor(this.draft.time_zone, guess);
    return new Date(guess.getTime() - offset).toISOString();
  }

  offsetFor(zone: string, at: Date): number {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const parts = dtf.formatToParts(at).reduce((acc: any, p) => { acc[p.type] = p.value; return acc; }, {});
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === '24' ? 0 : parts.hour, parts.minute, parts.second);
      return asUtc - at.getTime();
    } catch {
      return 0;
    }
  }

  async submit(e: Event): Promise<void> {
    e.preventDefault();
    this.working.set(true);
    this.refusal.set('');
    this.refusalField.set('');
    const body = {
      calendar_slug: this.draft.calendar_slug,
      title: this.draft.title,
      category: this.calendars().find((c) => c.slug === this.draft.calendar_slug)?.category ?? 'running',
      city: this.draft.city,
      time_zone: this.draft.time_zone,
      starts_at: this.toUtc(this.draft.starts),
      ends_at: this.toUtc(this.draft.ends),
      capacity: Number(this.draft.capacity),
      approval_required: false,
      waitlist_enabled: this.draft.waitlist,
      description: this.draft.description,
      state: 'published',
    };
    const res = await this.api.createEvent(body);
    this.working.set(false);
    if (!res.ok) {
      this.refusal.set(res.error?.message ?? 'That did not go through.');
      this.refusalField.set(res.error?.field ?? '');
      return;
    }
    if (res.event?.state === 'draft') {
      this.toasts.show('Saved as a draft — a detail was missing. Finish it from the dashboard.', 'warning');
    } else {
      this.toasts.show('Event published.', 'success');
    }
    this.router.navigate([`/event/${res.event?.slug}/manage/overview`]);
  }

  previewCover(): string {
    const seed = (this.draft.title || 'event-name').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event-name';
    return this.covers.dataUri(seed, this.draft.title || 'Event Name');
  }
}

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Shell } from '../layout/shell';
import { Cover } from '../ui/cover';
import { Api, ApiError } from '../core/api';
import { CATEGORIES } from './discover';
import { FormsModule } from '@angular/forms';

/** One screen at /create, never a wizard. */
@Component({
  selector: 'cc-create',
  standalone: true,
  imports: [FormsModule, Shell, Cover],
  template: `
  <cc-shell>
    <div class="cols">
      <aside class="art" aria-hidden="true">
        <div class="rotate-bg"></div>
        <cc-cover [seed]="coverSeed" [size]="420" [title]="form.title"></cc-cover>
      </aside>
      <form class="form stack-16" (submit)="submit($event)">
        <h1 class="screen-title">Create an event</h1>

        <label><span class="field-label">Which calendar</span>
          <select class="field" [(ngModel)]="form.calendar_slug" name="calendar" required>
            @for (c of calendars; track c.id) { <option [value]="c.slug">{{ c.name }}</option> }
          </select>
          <label class="row spread sub"><span>Public calendar</span>
            <input type="checkbox" checked disabled aria-label="Public calendar (set on the calendar)">
          </label>
        </label>

        <label><span class="field-label">Name</span>
          <input class="field" type="text" placeholder="Event Name" [(ngModel)]="form.title" name="title" required>
          @if (errors['title']) { <span class="field-error" role="alert">{{ errors['title'] }}</span> }</label>

        <div class="two">
          <label><span class="field-label">Starts</span>
            <input class="field" type="datetime-local" [(ngModel)]="start" name="start" required></label>
          <label><span class="field-label">Ends</span>
            <input class="field" type="datetime-local" [(ngModel)]="end" name="end" required></label>
        </div>
        @if (errors['starts_at']) { <span class="field-error" role="alert">{{ errors['starts_at'] }}</span> }

        <label><span class="field-label">Where</span>
          <input class="field" type="text" placeholder="City or venue" [(ngModel)]="form.city" name="city" required>
          <select class="field zone" [(ngModel)]="form.time_zone" name="zone">
            @for (z of zones; track z) { <option [value]="z">{{ z.replace('_',' ') }}</option> }
          </select></label>

        <label><span class="field-label">About</span>
          <textarea class="field" rows="4" [(ngModel)]="form.description" name="about"
                    placeholder="What should guests expect?"></textarea></label>

        <div class="settings">
          <div class="spread set">
            <div><p class="set-label">Capacity</p></div>
            <div class="row">
              <button class="btn btn-sm btn-secondary" type="button" (click)="bump(-1)" aria-label="Decrease capacity">−</button>
              <input class="field cap" type="number" min="1" max="500" [(ngModel)]="form.capacity" name="capacity"
                     aria-label="Capacity">
              <button class="btn btn-sm btn-secondary" type="button" (click)="bump(1)" aria-label="Increase capacity">+</button>
            </div>
          </div>
          <div class="spread set">
            <p class="set-label">Unlimited</p>
            <input type="checkbox" [(ngModel)]="unlimited" name="unlimited" (ngModelChange)="onUnlimited()"
                   aria-label="Unlimited capacity">
          </div>
          <div class="spread set">
            <p class="set-label">Waitlist Enabled</p>
            <input type="checkbox" [(ngModel)]="form.waitlist_enabled" name="waitlist" aria-label="Waitlist enabled">
          </div>
          <div class="spread set">
            <p class="set-label">Approval required</p>
            <input type="checkbox" [(ngModel)]="form.approval_required" name="approval" aria-label="Approval required">
          </div>
          <div class="spread set">
            <p class="set-label">Theme</p>
            <span class="muted">Seasonal</span>
          </div>
        </div>

        <div class="row">
          <button class="btn btn-primary" type="submit" [disabled]="busy">
            {{ busy ? 'Creating…' : 'Create Event' }}
          </button>
        </div>
        @if (formError) { <p class="field-error" role="alert">{{ formError }}</p> }
      </form>
    </div>
  </cc-shell>`,
  styles: [`
    .cols { display: grid; grid-template-columns: 520px 568px; gap: 48px; align-items: start; }
    .art { position: relative; border-radius: 24px; overflow: hidden; }
    .rotate-bg { position: absolute; inset: -30%; z-index: 0;
      background: conic-gradient(from 0deg, rgba(171,70,221,0.5), rgba(214,151,18,0.5), rgba(20,106,235,0.5), rgba(171,70,221,0.5));
      filter: blur(60px); will-change: transform; animation: shift-background 60000ms linear infinite; }
    .art cc-cover { position: relative; z-index: 1; }
    .form { max-width: 568px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .zone { margin-top: 8px; }
    .sub { margin-top: 8px; }
    .settings { display: grid; gap: 0; border: 1px solid var(--divider); border-radius: 12px; }
    .set { padding: 14px 16px; border-bottom: 1px solid var(--divider); min-height: 52px; }
    .set:last-child { border-bottom: 0; }
    .set-label { font-size: 16px; line-height: 24px; margin: 0; }
    .cap { width: 90px; text-align: center; }
    @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .rotate-bg { animation: none; } }
  `],
})
export class Create implements OnInit {
  calendars: any[] = [];
  zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
  form = {
    calendar_slug: '', title: '', city: '', time_zone: 'Europe/Berlin',
    capacity: 20, approval_required: false, waitlist_enabled: true, description: '',
  };
  start = '';
  end = '';
  unlimited = false;
  busy = false;
  formError = '';
  errors: Record<string, string> = {};

  constructor(private api: Api, private router: Router) {}

  async ngOnInit(): Promise<void> {
    this.calendars = await this.api.request<any[]>('/calendars');
    if (this.calendars.length) this.form.calendar_slug = this.calendars[0].slug;
  }

  get coverSeed(): string { return this.form.title || 'Untitled'; }

  bump(d: number): void { this.form.capacity = Math.max(1, Math.min(500, this.form.capacity + d)); }
  onUnlimited(): void { if (this.unlimited) this.form.capacity = 500; }

  private utc(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async submit(e: Event): Promise<void> {
    e.preventDefault();
    this.errors = {}; this.formError = ''; this.busy = true;
    const body: any = { ...this.form, capacity: this.unlimited ? 500 : this.form.capacity };
    const s = this.utc(this.start);
    const en = this.utc(this.end);
    if (s) body.starts_at = s;
    if (en) body.ends_at = en;
    try {
      const created = await this.api.request<any>('/events', { method: 'POST', body: JSON.stringify(body) });
      this.router.navigate([`/event/${created.slug}/manage/overview`]);
    } catch (err) {
      const e2 = err as ApiError;
      this.formError = e2.message;
      this.errors = e2.fields ?? {};
    } finally { this.busy = false; }
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, ApiEvent } from '../api';
import { Auth } from '../auth';
import { CATEGORIES } from '../categories';

/** /create — one screen, never a wizard. */
@Component({
  selector: 'app-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (notPermitted()) {
      <div class="nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </div>
    } @else {
    <div class="composer">
      <div class="art" aria-hidden="true">
        <div class="art-field">
          <div class="rotor shift-anim"></div>
          <div class="glow-layer"></div>
          <div class="backdrop"></div>
        </div>
      </div>
      <form class="form" (submit)="submit($event)">
        <h1 class="h1">Create an event</h1>

        <div class="field">
          <label for="cal">Which calendar</label>
          <select id="cal" [(ngModel)]="form.calendar_slug" name="calendar_slug" required>
            <option value="" disabled>Choose a calendar</option>
            @for (c of calendars(); track c.slug) { <option [value]="c.slug">{{ c.name }}</option> }
          </select>
          @if (calRefusal) { <p class="refusal">{{ calRefusal }}</p> }
        </div>

        <label class="switch-row">
          <input type="checkbox" [(ngModel)]="form.is_public" name="is_public" />
          <span>Public calendar</span>
        </label>

        <div class="field">
          <label for="title">Event Name</label>
          <input id="title" type="text" [(ngModel)]="form.title" name="title" placeholder="Event Name" required />
        </div>

        <div class="two">
          <div class="field">
            <label for="starts">Starts</label>
            <input id="starts" type="datetime-local" [(ngModel)]="form.starts_at" name="starts_at" required />
          </div>
          <div class="field">
            <label for="ends">Ends</label>
            <input id="ends" type="datetime-local" [(ngModel)]="form.ends_at" name="ends_at" required />
          </div>
        </div>

        <div class="two">
          <div class="field">
            <label for="city">Where</label>
            <input id="city" type="text" [(ngModel)]="form.city" name="city" placeholder="Berlin" />
          </div>
          <div class="field">
            <label for="tz">Time zone</label>
            <select id="tz" [(ngModel)]="form.time_zone" name="time_zone">
              @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
            </select>
          </div>
        </div>

        <div class="field">
          <label for="desc">What it is about</label>
          <textarea id="desc" rows="4" [(ngModel)]="form.description" name="description" placeholder="What should guests expect?"></textarea>
        </div>

        <div class="setting-row">
          <div>
            <span class="setting-label">Capacity</span>
            <p class="caption">Unlimited</p>
          </div>
          <div class="stepper">
            <button type="button" class="btn btn-secondary btn-small" (click)="step(-1)" aria-label="Fewer seats">−</button>
            <input class="stepper-input" type="number" min="1" max="500" [(ngModel)]="form.capacity" name="capacity" aria-label="Capacity" />
            <button type="button" class="btn btn-secondary btn-small" (click)="step(1)" aria-label="More seats">+</button>
          </div>
        </div>

        <div class="setting-row">
          <div><span class="setting-label">Waitlist Enabled</span><p class="caption">Guests queue when the event fills.</p></div>
          <label class="switch">
            <input type="checkbox" [(ngModel)]="form.waitlist_enabled" name="waitlist_enabled" [attr.aria-checked]="form.waitlist_enabled" role="switch" />
            <span class="track" aria-hidden="true"><span class="thumb"></span></span>
          </label>
        </div>

        <div class="setting-row">
          <div><span class="setting-label">Approval</span><p class="caption">You decide who joins.</p></div>
          <label class="switch">
            <input type="checkbox" [(ngModel)]="form.approval_required" name="approval_required" [attr.aria-checked]="form.approval_required" role="switch" />
            <span class="track" aria-hidden="true"><span class="thumb"></span></span>
          </label>
        </div>

        <div class="setting-row">
          <div><span class="setting-label">Theme</span><p class="caption">Seasonal</p></div>
          <span class="theme-chip" aria-hidden="true"></span>
        </div>

        <button class="btn btn-primary submit" type="submit" [disabled]="working()">
          @if (working()) { Creating… } @else { Create Event }
        </button>
        @if (refusal) { <p class="refusal-line">{{ refusal }}</p> }
      </form>
    </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .composer { display: flex; gap: 48px; align-items: flex-start; }
    .art { width: 520px; flex: none; position: sticky; top: 32px; }
    .art-field { position: relative; aspect-ratio: 1; border-radius: 24px; overflow: hidden; background: linear-gradient(140deg, #f31a7c, #d69712, #ab46dd, #146aeb); }
    .rotor { position: absolute; inset: -20%; background: conic-gradient(from 0deg, #f31a7c, #d69712, #ab46dd, #146aeb, #f31a7c); filter: brightness(1.3) saturate(0) blur(50px); mix-blend-mode: overlay; animation: shift-background 60000ms linear infinite; will-change: transform; }
    .glow-layer { position: absolute; inset: 10%; background: radial-gradient(circle at 30% 30%, #ffffff88, transparent 60%); filter: blur(60px); }
    .backdrop { position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .form { width: 568px; max-width: 100%; display: flex; flex-direction: column; gap: 16px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0 0 8px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .setting-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid var(--divider); padding: 14px 0; }
    .setting-label { font-size: 16px; line-height: 24px; font-weight: 500; }
    .caption { font-size: 13px; line-height: 16px; color: var(--muted); margin: 2px 0 0; }
    .stepper { display: flex; gap: 8px; align-items: center; }
    .stepper-input { width: 76px; text-align: center; border-radius: 4px; border: 1px solid var(--ink-08); min-height: 44px; font-size: 16px; padding: 8px; background: var(--paper); color: var(--ink); }
    .switch-row { display: flex; gap: 10px; align-items: center; min-height: 44px; }
    .switch { position: relative; display: inline-flex; }
    .switch input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
    .track { width: 52px; height: 32px; border-radius: 100px; background: var(--fill-disabled); display: inline-flex; align-items: center; padding: 3px; }
    .thumb { width: 26px; height: 26px; border-radius: 100%; background: #ffffff; box-shadow: rgba(0,0,0,.2) 0 1px 3px; }
    .switch input:checked + .track { background: var(--ink); }
    .switch input:checked + .track .thumb { transform: translateX(20px); }
    .switch input:focus-visible + .track { outline: var(--focus-ring); outline-offset: 2px; }
    .theme-chip { width: 44px; height: 44px; border-radius: 11px; background: linear-gradient(135deg, #f31a7c, #d69712); }
    .submit { margin-top: 8px; }
    .refusal-line { font-size: 14px; color: #b3231c; margin: 0; }
    @media (max-width: 1000px) { .composer { flex-direction: column; } .art { width: 100%; position: static; } }
    @media (max-width: 484px) { .two { grid-template-columns: 1fr; } }
    .nf { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
  `],
})
export class ComposerComponent implements OnInit {
  zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'Europe/Oslo', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
  calendars = signal<{ name: string; slug: string }[]>([]);
  working = signal(false);
  notPermitted = signal(false);
  refusal: string | null = null;
  calRefusal: string | null = null;
  form = {
    calendar_slug: '', is_public: true, title: '', starts_at: '', ends_at: '',
    city: '', time_zone: 'Europe/Berlin', description: '', capacity: 20,
    approval_required: false, waitlist_enabled: true,
  };

  constructor(private api: Api, private auth: Auth, private router: Router) {}

  ngOnInit() {
    if (this.auth.account()?.role !== 'host') { this.notPermitted.set(true); return; }
    this.api.get<any>('/calendars').then(({ body }) => {
      const cals = (body as any) || [];
      this.calendars.set(cals.map((c: any) => ({ name: c.name, slug: c.slug })));
      if (cals[0]) this.form.calendar_slug = cals[0].slug;
    });
  }

  step(d: number) {
    const n = Number(this.form.capacity) + d;
    this.form.capacity = Math.max(1, Math.min(500, n));
  }

  toIso(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async submit(e: Event) {
    e.preventDefault();
    this.refusal = null; this.calRefusal = null;
    if (!this.form.calendar_slug) { this.calRefusal = `Choose one of your calendars first.`; return; }
    this.working.set(true);
    const { status, body } = await this.api.post<ApiEvent>('/events', {
      calendar_slug: this.form.calendar_slug,
      title: this.form.title,
      city: this.form.city,
      time_zone: this.form.time_zone,
      starts_at: this.toIso(this.form.starts_at) || '',
      ends_at: this.toIso(this.form.ends_at) || '',
      capacity: Number(this.form.capacity),
      approval_required: this.form.approval_required,
      waitlist_enabled: this.form.waitlist_enabled,
      description: this.form.description,
    });
    this.working.set(false);
    if (status === 201) {
      this.api.flash(`"${(body as any).title}" is live at /${(body as any).slug}.`, 'success');
      this.router.navigate(['/event', (body as any).slug, 'manage', 'overview']);
    } else {
      this.refusal = (body as any)?.message || `Something in the form needs another look.`;
    }
  }
}


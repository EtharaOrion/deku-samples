import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, Calendar, EventCard } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, kebab } from '../core/tokens';
import { SignedShellComponent } from '../shells/signed-shell';
import { CoverComponent } from '../ui/cover';

/** One screen, never a wizard: an art column and a form column. */
@Component({
  selector: 'app-create-event',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, FormsModule, CoverComponent],
  template: `
    <app-signed-shell>
      <div class="split">
        <div class="art" aria-hidden="true">
          <div class="rotor"></div>
          <div class="halo"></div>
          <div class="tile"><app-cover [seed]="previewSeed()" /></div>
        </div>

        <form class="form" (submit)="submit($event)" novalidate>
          <h1>Create an event</h1>

          <label class="field">
            <span class="fl">Which calendar</span>
            <select class="input" name="calendar_slug" [(ngModel)]="draft.calendar_slug">
              @for (c of calendars(); track c.id) { <option [value]="c.slug">{{ c.name }}</option> }
            </select>
            @if (!calendars().length) { <span class="refusal">Create a calendar first, then publish events on it.</span> }
          </label>

          <label class="switch-row">
            <span class="fl">Public calendar</span>
            <input type="checkbox" name="is_public" [(ngModel)]="draft.is_public" />
          </label>

          <label class="field">
            <span class="fl">Name</span>
            <input class="input" name="title" placeholder="Event Name" [(ngModel)]="draft.title" />
            @if (refusal() === 'title') { <span class="refusal">Give the event a name.</span> }
          </label>

          <div class="two">
            <label class="field">
              <span class="fl">Starts</span>
              <input class="input" type="datetime-local" name="starts_at" [(ngModel)]="draft.starts_at" />
            </label>
            <label class="field">
              <span class="fl">Ends</span>
              <input class="input" type="datetime-local" name="ends_at" [(ngModel)]="draft.ends_at" />
            </label>
          </div>
          @if (refusal() === 'times') { <span class="refusal">The end has to come after the start, in UTC.</span> }

          <label class="field">
            <span class="fl">Where</span>
            <input class="input" name="city" placeholder="City" [(ngModel)]="draft.city" />
          </label>

          <label class="field">
            <span class="fl">What it is about</span>
            <textarea class="input" name="description" rows="4" placeholder="A sentence or two about the evening"
                      [(ngModel)]="draft.description"></textarea>
          </label>

          <div class="setting">
            <div><span class="fl">Capacity</span><span class="caption">Unlimited</span></div>
            <input class="input num" type="number" min="1" max="500" name="capacity" [(ngModel)]="draft.capacity" />
          </div>

          <div class="setting">
            <div><span class="fl">Waitlist Enabled</span></div>
            <input type="checkbox" name="waitlist_enabled" [(ngModel)]="draft.waitlist_enabled" />
          </div>

          <div class="setting">
            <div><span class="fl">Theme</span><span class="caption">Seasonal</span></div>
            <span class="swatch" [style.background]="swatch()"></span>
          </div>

          <button class="btn btn-primary wide" type="submit" [disabled]="working()">
            @if (working()) { Creating } @else { Create Event }
          </button>
          @if (refusal() && refusal() !== 'title' && refusal() !== 'times') {
            <p class="refusal" role="alert">{{ refusal() }}</p>
          }
        </form>
      </div>
    </app-signed-shell>
  `,
  styles: [`
    .split { display: grid; grid-template-columns: 520px 568px; gap: 48px; align-items: start; }
    .art { position: relative; border-radius: var(--r-card-lg); overflow: hidden; min-height: 420px;
      display: flex; align-items: center; justify-content: center; }
    .rotor, .halo { position: absolute; border-radius: 50%; }
    .rotor {
      inset: -20%; background: conic-gradient(from 0deg, #f31a7c, #146aeb, #3cbd2c, #d69712, #f31a7c);
      filter: brightness(1.3) saturate(0) blur(50px); mix-blend-mode: overlay;
      animation: shift-background 60000ms linear infinite; will-change: transform;
    }
    .halo { inset: -10%; background: radial-gradient(circle, rgba(255,255,255,0.5), transparent 60%); filter: blur(60px); }
    .art::after { content: ''; position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .tile { position: relative; z-index: 1; width: 60%; border-radius: var(--r-media); overflow: hidden;
      box-shadow: var(--shadow-primary); }
    .form { display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1;
      background: color-mix(in srgb, var(--paper) 82%, transparent); padding: 24px; border-radius: var(--r-card-lg);
      box-shadow: var(--shadow-card), var(--ring-onboard); }
    h1 { font: 700 22px/26px var(--sans); }
    .field { display: block; }
    .fl { display: block; font: 500 16px/24px var(--sans); margin-bottom: 6px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .setting { display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 12px 0; border-top: 1px solid var(--divider); }
    .setting .caption { color: var(--muted); font-size: 13px; }
    .num { max-width: 120px; text-align: right; }
    .swatch { width: 44px; height: 44px; border-radius: var(--r-media); display: inline-block;
      box-shadow: var(--shadow-card); }
    .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; }
    .switch-row input, .setting input[type='checkbox'] { width: 22px; height: 22px; }
    .refusal { color: var(--danger); font-size: 13px; display: block; }
    .wide { width: 100%; margin-top: 8px; }
    @media (max-width: 999px) { .split { grid-template-columns: 1fr; } .art { min-height: 260px; } }
    @media (max-width: 483px) { .two { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .rotor { animation: none; } }
  `],
})
export class CreateEventComponent {
  private api = inject(Api);
  private router = inject(Router);
  calendars = signal<Calendar[]>([]);
  working = signal(false);
  refusal = signal('');

  draft = {
    calendar_slug: '', is_public: true, title: '', starts_at: '', ends_at: '',
    city: '', description: '', capacity: 20, waitlist_enabled: true,
  };

  ngOnInit() {
    this.api.calendars().subscribe({
      next: (c) => {
        this.calendars.set(c);
        if (c.length) this.draft.calendar_slug = c[0].slug;
      },
    });
  }

  label(c: string) { return CATEGORY_LABELS[c]; }

  previewSeed = computed(() => kebab(this.draft.title || 'new-event') || 'new-event');
  swatch = computed(() => {
    const s = this.previewSeed();
    const hues = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return hues[(h >>> 0) % hues.length];
  });

  submit(e: Event) {
    e.preventDefault();
    if (this.working()) return;
    const d = this.draft;
    if (!d.title.trim()) { this.refusal.set('title'); return; }
    const start = toIso(d.starts_at);
    const end = toIso(d.ends_at);
    if (!start || !end || new Date(end) <= new Date(start)) { this.refusal.set('times'); return; }
    const cal = this.calendars().find((c) => c.slug === d.calendar_slug);

    this.working.set(true);
    this.refusal.set('');
    this.api.createEvent({
      calendar_slug: d.calendar_slug,
      title: d.title.trim(),
      category: cal?.category ?? 'running',
      city: d.city.trim() || cal?.city || 'Berlin',
      time_zone: 'UTC',
      starts_at: start,
      ends_at: end,
      capacity: Number(d.capacity) || 20,
      approval_required: false,
      waitlist_enabled: d.waitlist_enabled,
      description: d.description,
    }).subscribe({
      next: (ev: EventCard) => {
        this.working.set(false);
        this.api.notify(`${ev.title} is published.`, 'success');
        this.router.navigateByUrl(`/${ev.slug}`);
      },
      error: (err) => { this.working.set(false); this.refusal.set(this.api.messageFor(err)); },
    });
  }
}

/** datetime-local carries no zone, so it is read as UTC and written with a Z. */
function toIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

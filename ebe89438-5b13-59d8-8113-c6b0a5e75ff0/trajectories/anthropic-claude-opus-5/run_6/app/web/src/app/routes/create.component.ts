import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CoverComponent } from '../ui/cover.component';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';
import { visitorZone } from '../core/time';

/** One screen, never a wizard: an art column and a form column. */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, CoverComponent],
  template: `
    <main id="main" class="composer">
      <div class="art">
        <div class="rotating shift-bg" aria-hidden="true"></div>
        <div class="glow" aria-hidden="true"></div>
        <div class="backdrop" aria-hidden="true"></div>
        <div class="preview">
          <app-cover [seed]="form.title || 'new-event'" [title]="form.title || 'Event Name'" radius="11px" />
        </div>
      </div>

      <div class="form-col">
        <h1 class="t-screen-title">Create an event</h1>
        <form (ngSubmit)="submit()">
          <label class="field">
            <span class="label">Calendar</span>
            <select class="control" name="calendar" [(ngModel)]="form.calendar_slug">
              @for (c of calendars(); track c.slug) { <option [value]="c.slug">{{ c.name }}</option> }
            </select>
          </label>

          <label class="row toggle">
            <input type="checkbox" name="is_public" [(ngModel)]="isPublic" />
            <span class="t-body">Anyone can find this event</span>
          </label>

          <label class="field" [class.refused]="field() === 'title'">
            <span class="label">Name</span>
            <input class="control" name="title" [(ngModel)]="form.title" placeholder="Event Name" />
          </label>

          <div class="two">
            <label class="field">
              <span class="label">Starts</span>
              <input class="control" type="datetime-local" name="starts" [(ngModel)]="startsLocal" />
            </label>
            <label class="field" [class.refused]="field() === 'ends_at'">
              <span class="label">Ends</span>
              <input class="control" type="datetime-local" name="ends" [(ngModel)]="endsLocal" />
            </label>
          </div>

          <label class="field">
            <span class="label">Time zone</span>
            <input class="control" name="tz" [(ngModel)]="form.time_zone" />
          </label>

          <label class="field">
            <span class="label">City</span>
            <input class="control" name="city" [(ngModel)]="form.city" />
          </label>

          <label class="field">
            <span class="label">Category</span>
            <select class="control" name="category" [(ngModel)]="form.category">
              @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
            </select>
          </label>

          <label class="field">
            <span class="label">About</span>
            <textarea class="control" name="description" [(ngModel)]="form.description"></textarea>
          </label>

          <div class="setting">
            <div class="grow">
              <span class="t-body">Capacity</span>
              <p class="t-caption muted">{{ unlimited ? 'Unlimited' : 'Waitlist Enabled' }}</p>
            </div>
            <input class="control cap" type="number" min="1" max="500" name="capacity"
                   [(ngModel)]="form.capacity" aria-label="Capacity" />
          </div>

          <div class="setting">
            <div class="grow">
              <span class="t-body">Theme</span>
              <p class="t-caption muted">Seasonal</p>
            </div>
            <span class="swatch" aria-hidden="true"></span>
          </div>

          <div class="setting">
            <div class="grow">
              <span class="t-body">Approval</span>
              <p class="t-caption muted">You read each request before a seat is given.</p>
            </div>
            <input type="checkbox" name="approval" [(ngModel)]="form.approval_required"
                   aria-label="Require approval" />
          </div>

          @if (refusal()) { <p class="refusal-line" role="alert">{{ refusal() }}</p> }

          <button type="submit" class="btn btn-solid btn-block" [disabled]="busy()">
            @if (busy()) { <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28"/></svg> }
            Create Event
          </button>
        </form>
      </div>
    </main>
  `,
  styles: [`
    .composer { display: grid; grid-template-columns: 520px 568px; gap: 48px; padding: 32px 24px 64px; justify-content: center; }
    .art { position: relative; border-radius: var(--r-card-lg); overflow: hidden; min-height: 420px;
           display: flex; align-items: center; justify-content: center; padding: 48px; }
    .rotating {
      position: absolute; inset: -40%; will-change: transform;
      background: conic-gradient(#f31a7c, #146aeb, #3cbd2c, #d69712, #f31a7c);
      filter: brightness(1.3) saturate(0) blur(50px); mix-blend-mode: overlay;
      animation: shift-background 60000ms linear infinite;
    }
    .glow {
      position: absolute; inset: 10%; filter: blur(60px); opacity: 0.5;
      background: radial-gradient(circle, #146aeb, transparent 70%);
    }
    .backdrop { position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .preview { position: relative; width: 100%; max-width: 320px; }
    .form-col { min-width: 0; }
    h1 { margin-bottom: 24px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .toggle { gap: 8px; margin-bottom: 16px; min-height: 44px; }
    .setting { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid var(--divider); }
    .cap { width: 100px; }
    .swatch { width: 28px; height: 28px; border-radius: 100%; background: linear-gradient(135deg, #146aeb, #ab46dd); }
    .refusal-line { color: var(--danger); font-size: 13px; margin: 12px 0; }
    input[type="datetime-local"] { min-height: 44px; }
    @media (max-width: 999px) { .composer { grid-template-columns: min(568px, 100%); } .art { order: -1; } }
    @media (max-width: 449px) { .two { grid-template-columns: 1fr; } }
  `],
})
export class CreateComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private notices = inject(NoticeService);

  categories = CATEGORIES;
  label = (c: string) => CATEGORY_LABELS[c];

  calendars = signal<Calendar[]>([]);
  busy = signal(false);
  refusal = signal('');
  field = signal<string | undefined>(undefined);

  isPublic = true;
  unlimited = false;
  startsLocal = '';
  endsLocal = '';

  form = {
    calendar_slug: '', title: '', category: 'running', city: '',
    time_zone: visitorZone(), capacity: 20, approval_required: false,
    waitlist_enabled: true, description: '',
  };

  ngOnInit() {
    this.api.myCalendars().subscribe({
      next: (c) => {
        this.calendars.set(c);
        if (c.length) {
          this.form.calendar_slug = c[0].slug;
          this.form.category = c[0].category;
          this.form.city = c[0].city;
        }
      },
    });
  }

  private toUtc(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  submit() {
    this.busy.set(true);
    this.refusal.set('');
    this.field.set(undefined);
    this.api.createEvent({
      ...this.form,
      capacity: Number(this.form.capacity),
      starts_at: this.toUtc(this.startsLocal),
      ends_at: this.toUtc(this.endsLocal),
    }).subscribe({
      next: (e) => {
        this.busy.set(false);
        this.notices.show(
          e.state === 'draft'
            ? `${e.title} is saved as a draft until it has everything it needs.`
            : `${e.title} is published.`,
          'success');
        this.router.navigate(['/event', e.slug, 'manage', 'overview']);
      },
      error: (err: Refusal) => {
        this.busy.set(false);
        this.field.set(err.field);
        this.refusal.set(err.message);
      },
    });
  }
}

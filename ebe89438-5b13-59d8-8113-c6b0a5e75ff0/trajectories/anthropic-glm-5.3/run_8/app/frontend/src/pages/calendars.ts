import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, Calendar } from '../api';
import { CATEGORIES, Toast, categoryMeta } from '../domain';
import { Icon } from '../ui/icon';
import { Dialog } from '../ui/dialog';

/** Calendars owned. Host only; a guest meets the not-found page. */
@Component({
  selector: 'g-calendars',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="spread">
        <div>
          <h1 class="t-h1">Calendars</h1>
          <p class="t-row secondary">A calendar is where your events live.</p>
        </div>
        <button class="btn btn-primary" (click)="openNew()">New Calendar</button>
      </div>

      @if (loading()) {
        <div class="stack" aria-hidden="true">
          @for (i of [1,2]; track i) { <span class="skeleton skeleton-block"></span> }
        </div>
      } @else if (mine().length === 0) {
        <div class="empty card card-lg">
          <h2>No Calendars Yet</h2>
          <p>A calendar is where your events live. Create one to get started.</p>
          <button class="btn btn-primary" (click)="openNew()">New Calendar</button>
        </div>
      } @else {
        <ul class="grid">
          @for (c of mine(); track c.id) {
            <li class="card cal">
              <div class="spread">
                <div class="row">
                  <g-icon [name]="c.category" [size]="20" [colour]="categoryMeta(c.category).hue" />
                  <span class="t-row title">{{ c.name }}</span>
                </div>
                @if (!c.is_public) { <span class="pill pill-info">Private</span> }
              </div>
              <a class="t-caption slug" [routerLink]="['/', c.slug]">/{{ c.slug }}</a>
              <span class="t-caption muted">{{ c.city }} · {{ c.published_count ?? 0 }} published events</span>
              <div class="row-wrap">
                <a class="btn btn-secondary btn-sm" [routerLink]="['/create']" [queryParams]="{ calendar: c.slug }">New event</a>
                <a class="btn btn-quiet btn-sm" [routerLink]="['/', c.slug]">View calendar</a>
              </div>
            </li>
          }
        </ul>
      }
    </div>

    @if (dialogOpen()) {
      <g-dialog title="New Calendar" (closed)="dialogOpen.set(false)">
        <form (ngSubmit)="create()" [class.shake]="shake()">
          <div class="stack">
            <label class="field">
              <span>Name</span>
              <input type="text" [(ngModel)]="form.name" name="name" placeholder="Riverside Run Club" required />
            </label>
            <label class="field">
              <span>Address</span>
              <input type="text" [(ngModel)]="form.slug" name="slug" placeholder="riverside-run-club" required />
              <span class="field-hint">This becomes the calendar address.</span>
              @if (slugError(); as m) { <span class="field-error">{{ m }}</span> }
            </label>
            <label class="field">
              <span>Category</span>
              <select [(ngModel)]="form.category" name="category" required>
                @for (c of categories; track c.key) { <option [value]="c.key">{{ c.label }}</option> }
              </select>
            </label>
            <label class="field">
              <span>City</span>
              <input type="text" [(ngModel)]="form.city" name="city" placeholder="Berlin" required />
            </label>
            <label class="field">
              <span>Visibility</span>
              <button type="button" class="switch" role="switch" [attr.aria-checked]="form.is_public" (click)="form.is_public = !form.is_public">
                <span class="track"><span class="knob"></span></span>
                <span>{{ form.is_public ? 'Public calendar' : 'Private calendar' }}</span>
              </button>
              <span class="field-hint">A private calendar is reachable only by its address.</span>
            </label>
            @if (refusal(); as r) { <p class="refusal t-row" role="alert">{{ r }}</p> }
            <div class="dialog-actions">
              <button type="button" class="btn btn-secondary btn-sm" (click)="dialogOpen.set(false)">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="working()">
                @if (working()) { <span class="rotator" aria-hidden="true"></span> } Create calendar
              </button>
            </div>
          </div>
        </form>
      </g-dialog>
    }
  `,
  imports: [RouterLink, FormsModule, Icon, Dialog],
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 24px; }
    .secondary { color: var(--ink-64); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
    .cal { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .title { font-weight: 500; }
    .slug { color: var(--muted); text-decoration: none; }
    @media (hover: hover) { .slug:hover { text-decoration: underline; } }
    .refusal { color: #c4150e; }
  `],
})
export class CalendarsPage {
  private api = inject(Api);
  private toast = inject(Toast);
  categories = CATEGORIES;
  categoryMeta = categoryMeta;

  mine = signal<Calendar[]>([]);
  loading = signal(true);
  dialogOpen = signal(false);
  working = signal(false);
  refusal = signal<string | null>(null);
  slugError = signal<string | null>(null);
  shake = signal(false);
  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  constructor() {
    this.load();
  }

  load(): void {
    this.api.calendars().subscribe({
      next: (rows) => { this.mine.set(rows); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.refusal.set(null);
    this.slugError.set(null);
    this.dialogOpen.set(true);
  }

  create(): void {
    if (this.working()) return;
    this.working.set(true);
    this.refusal.set(null);
    this.slugError.set(null);
    this.api.createCalendar({ ...this.form }).subscribe({
      next: (c) => {
        this.working.set(false);
        this.dialogOpen.set(false);
        this.toast.show(`${c.name} is live at /${c.slug}.`, 'success');
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        const fields = err?.error?.fields ?? {};
        if (fields.slug) this.slugError.set(fields.slug.includes('taken') ? 'That address is already taken.' : fields.slug);
        this.refusal.set(err?.error?.message ?? 'We could not create that calendar. Try again in a moment.');
        this.shake.set(false);
        setTimeout(() => this.shake.set(true), 0);
      },
    });
  }
}

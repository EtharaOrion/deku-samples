import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Notices } from '../core/notices';
import { CATEGORIES, CATEGORY_LABELS, type Calendar, type Refusal } from '../core/models';
import { Shell } from '../ui/chrome';
import { CategoryIcon } from '../ui/icons';
import { Dialog } from '../ui/shared';

@Component({
  selector: 'app-calendars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Shell, CategoryIcon, Dialog],
  template: `
    <app-shell>
      <header class="head">
        <h1 class="t-screen-title">Your Calendars</h1>
        <button type="button" class="btn btn-primary" (click)="openDialog()">New Calendar</button>
      </header>

      @if (loading()) {
        <ul class="grid" aria-busy="true">
          @for (n of [1, 2]; track n) {
            <li><div class="sk sk-card" style="height: 150px"></div></li>
          }
        </ul>
      } @else if (calendars().length) {
        <ul class="grid">
          @for (c of calendars(); track c.slug) {
            <li>
              <a class="card lift cal interactive" [routerLink]="['/', c.slug]">
                <span class="cal-top">
                  <app-category-icon [name]="c.category" [size]="24" />
                  @if (!c.is_public) {
                    <span class="pill pill-pink">Private</span>
                  }
                </span>
                <span class="cal-name t-card-title">{{ c.name }}</span>
                <span class="t-caption muted">/{{ c.slug }}</span>
                <span class="t-caption muted">{{ c.city }} &middot; {{ label(c.category) }}</span>
                <span class="t-caption count">{{ c.published_event_count }} published</span>
              </a>
            </li>
          }
        </ul>
      } @else {
        <div class="empty">
          <h2>No Calendars Yet</h2>
          <p>A calendar is where your events live. Create one to get started.</p>
          <button type="button" class="btn btn-primary" (click)="openDialog()">New Calendar</button>
        </div>
      }

      @if (dialogOpen()) {
        <app-dialog heading="New Calendar" (closed)="dialogOpen.set(false)">
          <form (ngSubmit)="create()">
            <label class="field">
              <span class="field-label">Name</span>
              <input class="field-control" name="name" [(ngModel)]="form.name" (ngModelChange)="suggest()" />
            </label>
            <label class="field">
              <span class="field-label">Address</span>
              <input
                class="field-control"
                name="slug"
                [(ngModel)]="form.slug"
                [attr.aria-invalid]="refusalField() === 'slug' ? 'true' : null"
                [attr.aria-describedby]="'slug-note'"
              />
              <span class="field-caption" id="slug-note">This becomes the calendar address.</span>
              @if (refusalField() === 'slug') {
                <span class="field-refusal">{{ refusal() }}</span>
              }
            </label>
            <label class="field">
              <span class="field-label">Category</span>
              <select class="field-control" name="category" [(ngModel)]="form.category">
                @for (c of categories; track c) {
                  <option [value]="c">{{ label(c) }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field-label">City</span>
              <input class="field-control" name="city" [(ngModel)]="form.city" />
            </label>
            <label class="switch-row">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span class="t-body">Public calendar</span>
            </label>
            @if (refusal() && refusalField() !== 'slug') {
              <p class="field-refusal">{{ refusal() }}</p>
            }
            <div class="dialog-actions">
              <button type="button" class="btn" (click)="dialogOpen.set(false)">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy()">Create Calendar</button>
            </div>
          </form>
        </app-dialog>
      }
    </app-shell>
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        margin-bottom: var(--s5);
        flex-wrap: wrap;
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
        max-width: 900px;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s1);
        padding: var(--s4);
        color: var(--ink);
        height: 100%;
      }
      .cal-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--s2);
      }
      .cal-name {
        font-size: 16px;
        line-height: 24px;
      }
      .muted {
        color: var(--text-muted);
      }
      .count {
        color: var(--ink-secondary);
        margin-top: var(--s2);
      }
      .switch-row {
        display: flex;
        align-items: center;
        gap: var(--s2);
        min-height: 44px;
      }
    `,
  ],
})
export class CalendarsRoute {
  private api = inject(Api);
  private notices = inject(Notices);

  readonly categories = CATEGORIES;
  readonly loading = signal(true);
  readonly calendars = signal<Calendar[]>([]);
  readonly dialogOpen = signal(false);
  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly refusalField = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };
  private slugTouched = false;

  constructor() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.calendars().subscribe({
      next: (c) => {
        this.calendars.set(c);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openDialog() {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.slugTouched = false;
    this.refusal.set(null);
    this.refusalField.set(null);
    this.dialogOpen.set(true);
  }

  suggest() {
    if (this.slugTouched) return;
    this.form.slug = this.form.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  create() {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.refusalField.set(null);
    this.api.createCalendar({ ...this.form, slug: this.form.slug.trim() }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.dialogOpen.set(false);
        this.calendars.update((list) => [...list, c]);
        this.notices.success(`${c.name} is live at /${c.slug}.`);
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        // the dialog stays open with what was typed
        this.refusal.set(e.message);
        this.refusalField.set((e.field as string) ?? null);
      },
    });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }
}

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../models';
import { ShellComponent } from '../shared/shell.component';
import { DialogComponent } from '../shared/dialog.component';
import { CategoryIconComponent } from '../shared/icons.component';
import {
  EmptyStateComponent, SkeletonComponent, SpinnerComponent,
} from '../shared/ui.components';
import { clearTheme } from '../core/theme';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [
    FormsModule, RouterLink, ShellComponent, DialogComponent, CategoryIconComponent,
    EmptyStateComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <main id="main" class="page" role="main">
        <div class="head">
          <h1 class="screen-title">Your calendars</h1>
          <button type="button" class="btn btn-primary" (click)="openDialog()">New Calendar</button>
        </div>

        @if (loading()) {
          <ul class="grid">
            @for (i of [1,2]; track i) { <li><app-skeleton w="100%" h="140px" radius="12px" /></li> }
          </ul>
        } @else if (calendars().length === 0) {
          <app-empty-state
            heading="No Calendars Yet"
            body="A calendar is where your events live. Create one to get started."
            actionLabel="New Calendar"
            (action)="openDialog()" />
        } @else {
          <ul class="grid">
            @for (c of calendars(); track c.slug) {
              <li>
                <a class="card card-lift cal" [routerLink]="['/', c.slug]">
                  <div class="cal-head">
                    <h2 class="card-title">{{ c.name }}</h2>
                    @if (!c.is_public) { <span class="pill private">Private</span> }
                  </div>
                  <p class="caption slug">/{{ c.slug }}</p>
                  <p class="meta caption">
                    <app-category-icon [name]="c.category" [size]="16" />
                    <span>{{ label(c.category) }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ c.city }}</span>
                  </p>
                  <p class="caption tertiary count">
                    {{ c.published_count }} published
                    {{ c.published_count === 1 ? 'event' : 'events' }}
                  </p>
                </a>
              </li>
            }
          </ul>
        }
      </main>
    </app-shell>

    @if (dialogOpen()) {
      <app-dialog heading="New Calendar" (closed)="closeDialog()">
        <form (ngSubmit)="create()" novalidate>
          <label class="field">
            <span class="field-label">Name</span>
            <input class="field-input" name="name" [(ngModel)]="form.name" required />
          </label>
          <label class="field" [class.field-invalid]="refusedField() === 'slug'">
            <span class="field-label">Address</span>
            <input class="field-input" name="slug" [(ngModel)]="form.slug" required
                   [attr.aria-describedby]="refusedField() === 'slug' ? 'slug-msg' : 'slug-cap'" />
            <span class="field-caption" id="slug-cap">This becomes the calendar address.</span>
            @if (refusedField() === 'slug') {
              <span class="field-refusal" id="slug-msg" role="alert">{{ refusal() }}</span>
            }
          </label>
          <label class="field">
            <span class="field-label">Category</span>
            <select class="field-input" name="category" [(ngModel)]="form.category">
              @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
            </select>
          </label>
          <label class="field">
            <span class="field-label">City</span>
            <input class="field-input" name="city" [(ngModel)]="form.city" required />
          </label>
          <label class="switch-row">
            <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
            <span>Public calendar</span>
          </label>
          @if (refusal() && refusedField() !== 'slug') {
            <p class="field-refusal" role="alert">{{ refusal() }}</p>
          }
        </form>
        <ng-container dialogActions>
          <button type="button" class="btn btn-secondary" (click)="closeDialog()">Cancel</button>
          <button type="button" class="btn btn-solid" (click)="create()" [disabled]="working()">
            @if (working()) { <app-spinner /> }
            Create Calendar
          </button>
        </ng-container>
      </app-dialog>
    }
  `,
  styles: [`
    .page { padding: var(--s6) var(--s5) var(--s8); max-width: 900px; }
    .head { display: flex; align-items: center; justify-content: space-between;
      gap: var(--s3); margin-bottom: var(--s5); flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: 1fr; gap: var(--s4); }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    .cal { display: block; padding: var(--s4); color: inherit; }
    .cal:hover { color: inherit; }
    .cal-head { display: flex; align-items: center; gap: var(--s2); justify-content: space-between; }
    .private { color: var(--pink); border-color: rgba(243, 26, 124, 0.3);
      background: rgba(243, 26, 124, 0.08); }
    .slug { color: var(--muted-text); margin-top: 2px; }
    .meta { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2);
      color: var(--ink-secondary); }
    .count { margin-top: var(--s2); }
    .switch-row { display: flex; align-items: center; gap: var(--s2); min-height: 44px; }
  `],
})
export class CalendarsComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  categories = CATEGORIES;
  calendars = signal<Calendar[]>([]);
  loading = signal(true);
  dialogOpen = signal(false);
  working = signal(false);
  refusal = signal<string | null>(null);
  refusedField = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  label(c: string) { return CATEGORY_LABELS[c] ?? c; }

  ngOnInit() {
    clearTheme();
    this.load();
  }

  private load() {
    this.api.myCalendars().subscribe({
      next: (rows) => { this.calendars.set(rows); this.loading.set(false); },
      error: () => { this.calendars.set([]); this.loading.set(false); },
    });
  }

  openDialog() {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.refusal.set(null);
    this.refusedField.set(null);
    this.dialogOpen.set(true);
  }

  closeDialog() { this.dialogOpen.set(false); }

  create() {
    if (this.working()) return;
    this.working.set(true);
    this.refusal.set(null);
    this.refusedField.set(null);
    this.api.createCalendar({ ...this.form, slug: this.form.slug.trim().toLowerCase() }).subscribe({
      next: (cal) => {
        this.working.set(false);
        this.dialogOpen.set(false);
        this.calendars.update((rows) => [...rows, cal]);
        this.notices.show(`${cal.name} is ready.`, 'success');
      },
      error: (r: Refusal) => {
        // A refused slug names the reason under that field and the dialog
        // stays open with what was typed.
        this.working.set(false);
        this.refusal.set(r.message);
        this.refusedField.set(r.field ?? null);
      },
    });
  }
}

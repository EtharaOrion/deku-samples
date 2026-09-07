import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';
import { Notices } from '../core/notices';
import { IconComponent } from '../ui/icons';
import {
  DialogComponent,
  EmptyStateComponent,
  PillComponent,
  SkeletonComponent,
} from '../ui/kit';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IconComponent,
    PillComponent,
    SkeletonComponent,
    EmptyStateComponent,
    DialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="screen-title">Calendars</h1>
      <button type="button" class="btn btn-primary" (click)="openDialog()">New Calendar</button>
    </header>

    @if (loading()) {
      <ul class="grid">
        @for (n of [1, 2]; track n) {
          <li class="card sk"><app-skeleton height="90px"></app-skeleton></li>
        }
      </ul>
    } @else if (calendars().length === 0) {
      <app-empty-state
        heading="No Calendars Yet"
        body="A calendar is where your events live. Create one to get started."
      >
        <button type="button" class="btn" (click)="openDialog()">New Calendar</button>
      </app-empty-state>
    } @else {
      <ul class="grid">
        @for (c of calendars(); track c.slug) {
          <li>
            <a class="cal card" [routerLink]="'/' + c.slug">
              <span class="cal-head">
                <app-icon [name]="c.category" [size]="24"></app-icon>
                @if (!c.is_public) {
                  <app-pill word="Private" tone="danger"></app-pill>
                }
              </span>
              <span class="name">{{ c.name }}</span>
              <span class="slug">/{{ c.slug }}</span>
              <span class="meta">
                {{ label(c.category) }} · {{ c.city }} · {{ c.published_count }} published
              </span>
            </a>
          </li>
        }
      </ul>
    }

    @if (dialogOpen()) {
      <app-dialog heading="New Calendar" (closed)="closeDialog()">
        <form (ngSubmit)="create()" novalidate>
          <div class="field">
            <label class="field-label" for="c-name">Name</label>
            <input id="c-name" name="name" class="field-input" [(ngModel)]="form.name" required />
          </div>

          <div class="field">
            <label class="field-label" for="c-slug">Address</label>
            <input
              id="c-slug"
              name="slug"
              class="field-input"
              [(ngModel)]="form.slug"
              [attr.aria-invalid]="refusalField() === 'slug' ? 'true' : null"
              [attr.aria-describedby]="refusalField() === 'slug' ? 'slug-refusal' : 'slug-caption'"
              required
            />
            @if (refusalField() === 'slug') {
              <span class="field-refusal" id="slug-refusal">{{ refusal() }}</span>
            } @else {
              <span class="field-caption" id="slug-caption">This becomes the calendar address.</span>
            }
          </div>

          <div class="field">
            <label class="field-label" for="c-category">Category</label>
            <select id="c-category" name="category" class="field-input" [(ngModel)]="form.category">
              @for (c of categories; track c) {
                <option [value]="c">{{ label(c) }}</option>
              }
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="c-city">City</label>
            <input id="c-city" name="city" class="field-input" [(ngModel)]="form.city" required />
          </div>

          <label class="switch-row">
            <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
            <span>Anyone can find this calendar</span>
          </label>

          @if (refusal() && refusalField() !== 'slug') {
            <p class="field-refusal">{{ refusal() }}</p>
          }

          <div class="dialog-actions">
            <button type="button" class="btn" (click)="closeDialog()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="working()">
              {{ working() ? 'Creating…' : 'Create Calendar' }}
            </button>
          </div>
        </form>
      </app-dialog>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 32px;
        flex-wrap: wrap;
      }
      .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
      .cal { display: block; padding: 20px; color: var(--ink); }
      .cal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .name { display: block; font-size: 16px; line-height: 24px; font-weight: 500; }
      .slug { display: block; font-size: 13px; line-height: 16px; color: var(--muted); }
      .meta { display: block; font-size: 13px; line-height: 16px; color: var(--ink-36); margin-top: 8px; }
      .sk { padding: 20px; }
      @media (hover: hover) { .cal:hover { box-shadow: var(--shadow-fine); } }
      .switch-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        font-size: 15px;
      }
      .dialog-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
      @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    `,
  ],
})
export class CalendarsComponent implements OnDestroy {
  private api = inject(Api);
  private notices = inject(Notices);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly dialogOpen = signal(false);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };
  private controller = new AbortController();

  constructor() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api
      .myCalendars(this.controller.signal)
      .then((rows) => {
        this.calendars.set(rows);
        this.loading.set(false);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') this.loading.set(false);
      });
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  openDialog() {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.refusal.set('');
    this.refusalField.set(null);
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
  }

  async create() {
    this.working.set(true);
    this.refusal.set('');
    this.refusalField.set(null);
    try {
      const created = await this.api.createCalendar({
        name: this.form.name.trim(),
        slug: this.form.slug.trim().toLowerCase(),
        category: this.form.category,
        city: this.form.city.trim(),
        is_public: this.form.is_public,
      });
      this.calendars.update((rows) => [...rows, created]);
      this.dialogOpen.set(false);
      this.notices.success(`${created.name} is ready at /${created.slug}.`);
    } catch (err) {
      // The dialog stays open with what was typed.
      if (err instanceof ApiError) {
        this.refusal.set(err.message);
        this.refusalField.set(err.field);
      } else {
        this.refusal.set('That did not go through. Try again in a moment.');
      }
    } finally {
      this.working.set(false);
    }
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

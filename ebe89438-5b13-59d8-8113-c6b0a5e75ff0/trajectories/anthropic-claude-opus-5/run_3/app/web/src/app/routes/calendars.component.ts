import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiRefusal, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';
import { CategoryIconComponent } from '../shared/icons.component';
import { DialogComponent } from '../shared/ui';

/** The calendars owned. Host only; a guest gets the not-found page. */
@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [RouterLink, FormsModule, CategoryIconComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <h1 class="t-screen-title">Calendars</h1>
      <button type="button" class="btn btn-primary btn-pill" (click)="openDialog()">New Calendar</button>
    </div>

    @if (loading()) {
      <ul class="grid">
        @for (n of [1, 2]; track n) {
          <li><div class="skeleton" style="height: 148px; border-radius: 12px"></div></li>
        }
      </ul>
    } @else if (calendars().length === 0) {
      <div class="empty-state">
        <h2>No Calendars Yet</h2>
        <p>A calendar is where your events live. Create one to get started.</p>
        <button type="button" class="btn btn-primary btn-pill" (click)="openDialog()">New Calendar</button>
      </div>
    } @else {
      <ul class="grid">
        @for (cal of calendars(); track cal.slug) {
          <li>
            <a [routerLink]="'/' + cal.slug" class="cal-card lift">
              <div class="cal-head">
                <app-category-icon [category]="cal.category" [size]="22" [label]="labelFor(cal.category)" />
                @if (!cal.is_public) {
                  <span class="private-badge">Private</span>
                }
              </div>
              <span class="cal-name t-card-title">{{ cal.name }}</span>
              <span class="cal-slug t-caption">/{{ cal.slug }}</span>
              <span class="cal-meta t-caption">
                {{ cal.city }} &middot; {{ publishedLine(cal) }}
              </span>
            </a>
          </li>
        }
      </ul>
    }

    @if (dialogOpen()) {
      <app-dialog heading="New Calendar" (closed)="closeDialog()">
        <form (submit)="create($event)" novalidate class="form">
          <div class="field">
            <label for="cal-name">Name</label>
            <input id="cal-name" name="name" type="text" [(ngModel)]="form.name" />
          </div>

          <div class="field" [class.is-refused]="refusalField() === 'slug'">
            <label for="cal-slug">Address</label>
            <input id="cal-slug" name="slug" type="text" [(ngModel)]="form.slug" aria-describedby="slug-caption" />
            <span id="slug-caption" class="caption">This becomes the calendar address.</span>
            @if (refusalField() === 'slug') {
              <span class="refusal" role="alert">{{ refusal() }}</span>
            }
          </div>

          <div class="field">
            <label for="cal-category">Category</label>
            <select id="cal-category" name="category" [(ngModel)]="form.category">
              @for (c of categories; track c) {
                <option [value]="c">{{ labelFor(c) }}</option>
              }
            </select>
          </div>

          <div class="field">
            <label for="cal-city">City</label>
            <input id="cal-city" name="city" type="text" [(ngModel)]="form.city" />
          </div>

          <label class="switch-row">
            <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
            <span>Public calendar</span>
          </label>

          @if (refusal() && refusalField() !== 'slug') {
            <p class="refusal" role="alert">{{ refusal() }}</p>
          }

          <div class="dialog-actions">
            <button type="button" class="btn btn-pill" (click)="closeDialog()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-pill" [disabled]="working()">Create Calendar</button>
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
        margin-bottom: 24px;
        flex-wrap: wrap;
      }

      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }

      .cal-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 16px;
        border-radius: var(--r-card);
        background: var(--paper);
        box-shadow: var(--elev-card);
        height: 100%;
      }

      .cal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .private-badge {
        color: var(--pink);
        font-size: 11px;
        line-height: 16px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: var(--r-round);
        background: rgba(243, 26, 124, 0.1);
      }

      .cal-slug, .cal-meta { color: var(--muted); }

      .form { display: flex; flex-direction: column; gap: 16px; }

      .switch-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        font-size: 15px;
      }

      .switch-row input { width: 20px; height: 20px; min-height: 20px; }

      .refusal {
        color: var(--danger);
        font-size: 13px;
        line-height: 16px;
      }

      .dialog-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `,
  ],
})
export class CalendarsComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly dialogOpen = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.calendars().subscribe({
      next: (list) => {
        this.calendars.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.calendars.set([]);
        this.loading.set(false);
      },
    });
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

  create(event: Event) {
    event.preventDefault();
    this.refusal.set('');
    this.refusalField.set(null);
    this.working.set(true);

    this.api.createCalendar({ ...this.form }).subscribe({
      next: (cal) => {
        this.calendars.update((list) => [...list, cal]);
        this.working.set(false);
        this.dialogOpen.set(false);
        this.notices.success(`${cal.name} is ready at /${cal.slug}.`);
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        // A refused slug names the reason under that field and the dialog stays
        // open with what was typed.
        this.refusal.set(err.message);
        this.refusalField.set(err.field ?? null);
      },
    });
  }

  labelFor(category: string) {
    return CATEGORY_LABELS[category] ?? category;
  }

  publishedLine(cal: Calendar) {
    const n = cal.published_count ?? 0;
    return n === 1 ? '1 published event' : `${n} published events`;
  }
}

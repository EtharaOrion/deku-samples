import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ApiError } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';
import { clearTheme } from '../core/theme';
import { AppShellComponent } from '../ui/app-shell.component';
import { DialogComponent } from '../ui/dialog.component';
import { CategoryIconComponent, SpinnerComponent } from '../ui/icons.component';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [FormsModule, RouterLink, AppShellComponent, DialogComponent, CategoryIconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <div class="head">
        <h1 class="t-screen-title">Your Calendars</h1>
        <button type="button" class="btn btn-primary btn-pill" (click)="openDialog()">New Calendar</button>
      </div>

      @if (loading()) {
        <ul class="grid">
          @for (i of [1, 2]; track i) {
            <li><div class="skeleton skeleton-card" style="height: 160px"></div></li>
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
          @for (c of calendars(); track c.slug) {
            <li>
              <a class="card card-lift cal" [routerLink]="['/', c.slug]">
                <span class="top">
                  <app-category-icon [name]="c.category" [size]="24" />
                  @if (!c.is_public) {
                    <span class="pill pill-private">Private</span>
                  }
                </span>
                <span class="t-card-title name">{{ c.name }}</span>
                <span class="t-caption slug">/{{ c.slug }}</span>
                <span class="t-caption meta">{{ label(c.category) }} · {{ c.city }} · {{ c.published_count }} published</span>
              </a>
            </li>
          }
        </ul>
      }
    </app-shell>

    @if (dialogOpen()) {
      <app-dialog heading="New Calendar" blurb="A calendar holds your events and takes its own address in the namespace." (dismissed)="closeDialog()">
        <div class="field" [class.invalid]="field() === 'name'">
          <label for="cal-name">Name</label>
          <input id="cal-name" type="text" [(ngModel)]="form.name" />
        </div>
        <div class="field" [class.invalid]="field() === 'slug'">
          <label for="cal-slug">Address</label>
          <input id="cal-slug" type="text" [(ngModel)]="form.slug" aria-describedby="cal-slug-caption" />
          <span class="caption" id="cal-slug-caption">This becomes the calendar address.</span>
          @if (field() === 'slug' && refusal()) {
            <span class="refusal" role="alert">{{ refusal() }}</span>
          }
        </div>
        <div class="field" [class.invalid]="field() === 'category'">
          <label for="cal-category">Category</label>
          <select id="cal-category" [(ngModel)]="form.category">
            @for (c of categories; track c) {
              <option [value]="c">{{ label(c) }}</option>
            }
          </select>
        </div>
        <div class="field" [class.invalid]="field() === 'city'">
          <label for="cal-city">City</label>
          <input id="cal-city" type="text" [(ngModel)]="form.city" />
        </div>
        <div class="switch-row">
          <label for="cal-public">Public calendar</label>
          <input id="cal-public" type="checkbox" role="switch" [(ngModel)]="form.is_public" [attr.aria-checked]="form.is_public" />
        </div>
        @if (refusal() && field() !== 'slug') {
          <p class="refusal t-caption" role="alert">{{ refusal() }}</p>
        }
        <ng-container dialogActions>
          <button type="button" class="btn" (click)="closeDialog()">Cancel</button>
          <button type="button" class="btn btn-primary" (click)="create()" [disabled]="working()">
            @if (working()) {
              <app-spinner [size]="18" />
            }
            Create Calendar
          </button>
        </ng-container>
      </app-dialog>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        margin-bottom: var(--s6);
        flex-wrap: wrap;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s4);
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        padding: var(--s4);
        height: 100%;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .slug {
        color: var(--muted);
      }
      .meta {
        color: var(--muted);
      }
      .switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s3);
        min-height: 44px;
      }
      .switch-row input {
        width: 44px;
        height: 26px;
      }
      .refusal {
        color: var(--danger);
        font-weight: 500;
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
  readonly dialogOpen = signal(false);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  ngOnInit(): void {
    clearTheme();
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.calendars.set(await this.api.calendars());
    } catch (e) {
      this.notices.show((e as ApiError).message, 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  openDialog() {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.refusal.set('');
    this.field.set(null);
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
  }

  async create() {
    if (this.working()) return;
    this.refusal.set('');
    this.field.set(null);
    if (!this.form.name.trim()) {
      this.refusal.set('Give the calendar a name.');
      this.field.set('name');
      return;
    }
    if (!this.form.slug.trim()) {
      this.refusal.set('Choose an address for this calendar.');
      this.field.set('slug');
      return;
    }
    if (!this.form.city.trim()) {
      this.refusal.set('Name the city this calendar is based in.');
      this.field.set('city');
      return;
    }
    this.working.set(true);
    try {
      const created = await this.api.createCalendar({
        name: this.form.name.trim(),
        slug: this.form.slug.trim().toLowerCase(),
        category: this.form.category,
        city: this.form.city.trim(),
        is_public: this.form.is_public,
      });
      this.calendars.update((list) => [...list, created]);
      this.notices.show(`${created.name} is live at /${created.slug}.`, 'success');
      this.dialogOpen.set(false);
    } catch (e) {
      const err = e as ApiError;
      // The dialog stays open with what was typed and names the reason.
      this.refusal.set(err.message);
      this.field.set(err.field ?? 'slug');
    } finally {
      this.working.set(false);
    }
  }
}

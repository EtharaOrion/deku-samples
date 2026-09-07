import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';
import { NoticeService } from '../core/notice.service';
import { SessionService } from '../core/session.service';
import { DialogComponent } from '../ui/dialog.component';
import { IconComponent, categoryHue } from '../ui/icon.component';
import { ShellComponent } from '../ui/shell.component';
import { NotFoundComponent } from './not-found.component';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [FormsModule, RouterLink, ShellComponent, IconComponent, DialogComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- A guest at /calendars gets the ordinary not-found page. -->
    @if (!session.isHost()) {
      <app-not-found />
    } @else {
      <app-shell>
        <div class="head">
          <h1 class="t-screen-title">Your calendars</h1>
          <button type="button" class="btn btn-primary btn-pill" (click)="openDialog()">New Calendar</button>
        </div>

        @if (loading()) {
          <ul class="grid">
            @for (i of [1, 2]; track i) {
              <li><div class="sk" style="height:150px;border-radius:12px"></div></li>
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
                <a class="cal card card-lift" [routerLink]="['/', c.slug]">
                  <span class="top">
                    <app-icon [name]="c.category" [size]="24" [color]="hue(c.category)" />
                    @if (!c.is_public) {
                      <span class="private t-badge">Private</span>
                    }
                  </span>
                  <span class="t-card-title name">{{ c.name }}</span>
                  <span class="t-caption slug">/{{ c.slug }}</span>
                  <span class="t-caption muted">{{ label(c.category) }} · {{ c.city }}</span>
                  <span class="t-caption muted">{{ c.published_event_count ?? 0 }} published events</span>
                </a>
              </li>
            }
          </ul>
        }
      </app-shell>

      @if (dialogOpen()) {
        <app-dialog heading="New calendar" (closed)="dialogOpen.set(false)">
          <form (ngSubmit)="create()" novalidate>
            <div class="field" [class.invalid]="refusedField() === 'name'">
              <label for="cal-name">Name</label>
              <input id="cal-name" name="name" [(ngModel)]="form.name" />
            </div>

            <div class="field" [class.invalid]="refusedField() === 'slug'">
              <label for="cal-slug">Address</label>
              <input
                id="cal-slug"
                name="slug"
                [(ngModel)]="form.slug"
                [attr.aria-describedby]="refusedField() === 'slug' ? 'slug-refusal' : 'slug-caption'"
              />
              <span class="caption" id="slug-caption">This becomes the calendar address.</span>
              @if (refusedField() === 'slug') {
                <span class="refusal" id="slug-refusal">{{ refusal() }}</span>
              }
            </div>

            <div class="field" [class.invalid]="refusedField() === 'category'">
              <label for="cal-cat">Category</label>
              <select id="cal-cat" name="category" [(ngModel)]="form.category">
                @for (c of categories; track c) {
                  <option [value]="c">{{ label(c) }}</option>
                }
              </select>
            </div>

            <div class="field" [class.invalid]="refusedField() === 'city'">
              <label for="cal-city">City</label>
              <input id="cal-city" name="city" [(ngModel)]="form.city" />
            </div>

            <label class="switch-row">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span>Public calendar</span>
            </label>

            @if (refusal() && refusedField() !== 'slug') {
              <p class="refusal">{{ refusal() }}</p>
            }

            <div class="dialog-actions">
              <button type="button" class="btn btn-pill" (click)="dialogOpen.set(false)">Cancel</button>
              <button type="submit" class="btn btn-primary btn-pill" [disabled]="working()">Create Calendar</button>
            </div>
          </form>
        </app-dialog>
      }
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--s4);
        margin-bottom: var(--s6);
        flex-wrap: wrap;
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: var(--s4);
        color: inherit;
        background: var(--paper);
        height: 100%;
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--s2);
      }
      .name {
        font-size: 16px;
        line-height: 24px;
      }
      .slug {
        color: var(--muted);
      }
      .muted {
        color: var(--muted);
      }
      .private {
        padding: 3px 10px;
        border-radius: var(--r-round);
        background: rgba(243, 26, 124, 0.12);
        color: #f31a7c;
        font-weight: 600;
      }
      .switch-row {
        display: flex;
        align-items: center;
        gap: var(--s2);
        min-height: 44px;
        cursor: pointer;
      }
      .switch-row input {
        width: 20px;
        height: 20px;
      }
      .dialog-actions {
        display: flex;
        gap: var(--s2);
        justify-content: flex-end;
        margin-top: var(--s5);
        flex-wrap: wrap;
      }
    `,
  ],
})
export class CalendarsComponent {
  private api = inject(ApiService);
  private notices = inject(NoticeService);
  session = inject(SessionService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly dialogOpen = signal(false);
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusedField = signal('');

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  hue = categoryHue;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  constructor() {
    void this.load();
  }

  private async load() {
    if (!this.session.isHost()) {
      this.loading.set(false);
      return;
    }
    try {
      this.calendars.set(await this.api.myCalendars());
    } finally {
      this.loading.set(false);
    }
  }

  openDialog() {
    this.refusal.set('');
    this.refusedField.set('');
    this.dialogOpen.set(true);
  }

  /** A refused slug names the reason under the field and the dialog stays open. */
  async create() {
    this.working.set(true);
    this.refusal.set('');
    this.refusedField.set('');
    try {
      const slug = this.form.slug.trim() || this.form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const made = await this.api.createCalendar({
        name: this.form.name.trim(),
        slug,
        category: this.form.category,
        city: this.form.city.trim(),
        is_public: this.form.is_public,
      });
      this.calendars.update((list) => [...list, made]);
      this.notices.success(`${made.name} is live at /${made.slug}.`);
      this.dialogOpen.set(false);
      this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    } catch (err) {
      const e = err as ApiError;
      this.refusal.set(e.message);
      this.refusedField.set(e.field ?? '');
    } finally {
      this.working.set(false);
    }
  }
}

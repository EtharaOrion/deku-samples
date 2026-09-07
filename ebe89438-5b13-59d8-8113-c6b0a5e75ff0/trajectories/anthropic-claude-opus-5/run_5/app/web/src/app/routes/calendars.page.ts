import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ApiFailure } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { NoticeService } from '../core/notice.service';
import { AppShellComponent } from '../ui/app-shell.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import { DialogComponent } from '../ui/dialog.component';
import { EmptyStateComponent, SpinnerComponent } from '../ui/bits';
import { CATEGORIES, CATEGORY_LABELS, type Calendar } from '../core/models';

/**
 * A grid of calendar cards two-up from 484px, each carrying the name, the slug
 * in the muted grey, the category glyph, the city, the count of published events
 * and a private badge in the pink accent when is_public is off.
 */
@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    AppShellComponent,
    IconComponent,
    PillComponent,
    DialogComponent,
    EmptyStateComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <header class="head">
        <h1 class="t-screen-title head__title">Your calendars</h1>
        <span class="spacer"></span>
        <button type="button" class="btn btn--primary" (click)="openDialog()">New Calendar</button>
      </header>

      @if (loading()) {
        <div class="grid" aria-busy="true">
          @for (n of [1, 2]; track n) {
            <div class="skeleton card-skeleton"></div>
          }
        </div>
      } @else if (calendars().length === 0) {
        <app-empty-state
          title="No Calendars Yet"
          body="A calendar is where your events live. Create one to get started."
          actionLabel="New Calendar"
          (action)="openDialog()"
        />
      } @else {
        <ul class="grid">
          @for (c of calendars(); track c.slug) {
            <li>
              <a class="card card--lift cal" [routerLink]="'/' + c.slug">
                <span class="cal__top">
                  <span class="cal__glyph">
                    <app-icon [name]="anyIcon(c.category)" [size]="24" />
                  </span>
                  <span class="cal__lines">
                    <span class="t-card-title">{{ c.name }}</span>
                    <span class="t-caption cal__slug">/{{ c.slug }}</span>
                  </span>
                  @if (!c.is_public) {
                    <app-pill word="Private" tone="pink" />
                  }
                </span>
                <span class="cal__foot t-caption">
                  {{ label(c.category) }} · {{ c.city }} ·
                  {{ c.published_event_count ?? 0 }} published
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </app-shell>

    @if (dialogOpen()) {
      <app-dialog heading="New calendar" (closed)="closeDialog()">
        <div class="field" [class.field--refused]="field() === 'name'">
          <label class="field__label" for="cal-name">Name</label>
          <input id="cal-name" class="input" name="name" [(ngModel)]="form.name" />
        </div>

        <div class="field" [class.field--refused]="field() === 'slug'">
          <label class="field__label" for="cal-slug">Address</label>
          <input
            id="cal-slug"
            class="input"
            name="slug"
            [(ngModel)]="form.slug"
            aria-describedby="cal-slug-caption"
          />
          <p class="field__caption" id="cal-slug-caption">This becomes the calendar address.</p>
          @if (field() === 'slug' && refusal()) {
            <p class="field__refusal" role="alert">{{ refusal() }}</p>
          }
        </div>

        <div class="field" [class.field--refused]="field() === 'category'">
          <label class="field__label" for="cal-category">Category</label>
          <select id="cal-category" class="input" name="category" [(ngModel)]="form.category">
            @for (c of categories; track c) {
              <option [value]="c">{{ label(c) }}</option>
            }
          </select>
        </div>

        <div class="field" [class.field--refused]="field() === 'city'">
          <label class="field__label" for="cal-city">City</label>
          <input id="cal-city" class="input" name="city" [(ngModel)]="form.city" />
        </div>

        <label class="switch">
          <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
          <span>Anyone can find this calendar</span>
        </label>

        @if (refusal() && field() !== 'slug') {
          <p class="field__refusal" role="alert">{{ refusal() }}</p>
        }

        <div dialogActions>
          <button type="button" class="btn" (click)="closeDialog()">Cancel</button>
          <button type="button" class="btn btn--primary" (click)="create()" [disabled]="working()">
            @if (working()) {
              <app-spinner />
            }
            Create Calendar
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: [
    `
      .head { display: flex; align-items: center; gap: var(--s3); margin-bottom: var(--s5); flex-wrap: wrap; }
      .head__title { font-family: var(--serif); font-weight: 400; }
      .grid { display: grid; gap: var(--s4); grid-template-columns: 1fr; }
      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .card-skeleton { height: 132px; border-radius: var(--r-card); }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        padding: var(--s4);
        color: inherit;
        height: 100%;
      }
      .cal__top { display: flex; align-items: flex-start; gap: var(--s3); }
      .cal__glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--r-menu);
        background: var(--paper-inset);
        flex: none;
      }
      .cal__lines { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .cal__slug { color: var(--muted); }
      .cal__foot { color: var(--ink-64); margin-top: auto; }
      .switch { display: flex; align-items: center; gap: var(--s2); min-height: 44px; cursor: pointer; }
      .switch input { width: 20px; height: 20px; }
    `,
  ],
})
export class CalendarsPage implements OnInit {
  private api = inject(ApiService);
  private themeService = inject(ThemeService);
  private notices = inject(NoticeService);

  readonly categories = CATEGORIES;
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(true);
  readonly dialogOpen = signal(false);
  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly field = signal<string | null>(null);

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  ngOnInit(): void {
    this.themeService.clear();
    this.api.myCalendars().subscribe({
      next: (list) => {
        this.calendars.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  anyIcon(name: string): any {
    return name;
  }

  openDialog(): void {
    this.refusal.set(null);
    this.field.set(null);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  create(): void {
    this.refusal.set(null);
    this.field.set(null);
    this.working.set(true);
    this.api
      .createCalendar({
        name: this.form.name,
        slug: this.form.slug.trim().toLowerCase(),
        category: this.form.category,
        city: this.form.city,
        is_public: this.form.is_public,
      })
      .subscribe({
        next: (cal) => {
          this.working.set(false);
          this.calendars.update((list) => [...list, cal]);
          this.dialogOpen.set(false);
          this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
          this.notices.success(`${cal.name} is ready at /${cal.slug}.`);
        },
        error: (e: ApiFailure) => {
          this.working.set(false);
          // The dialog stays open with what was typed.
          this.refusal.set(e.message);
          this.field.set(e.field ?? null);
        },
      });
  }
}

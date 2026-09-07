import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CategoryIconComponent } from '../ui/category-icon.component';
import { PillComponent } from '../ui/pill.component';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { CATEGORIES, CATEGORY_LABELS, Calendar } from '../core/models';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [FormsModule, RouterLink, CategoryIconComponent, PillComponent],
  template: `
    <main id="main" class="col">
      <header class="head">
        <h1 class="t-screen-title">Calendars</h1>
        <button type="button" class="btn btn-solid" (click)="openDialog()">New Calendar</button>
      </header>

      @if (loading()) {
        <ul class="grid">
          @for (i of [1,2]; track i) {
            <li class="card"><div class="skeleton skeleton-title"></div>
              <div class="skeleton skeleton-text"></div></li>
          }
        </ul>
      } @else if (calendars().length === 0) {
        <div class="empty">
          <h2>No Calendars Yet</h2>
          <p>A calendar is where your events live. Create one to get started.</p>
          <button type="button" class="btn btn-primary" (click)="openDialog()">New Calendar</button>
        </div>
      } @else {
        <ul class="grid">
          @for (c of calendars(); track c.slug) {
            <li class="card cal">
              <div class="row" style="gap:8px">
                <app-category-icon [name]="c.category" [size]="24" />
                <a class="t-card-title name" [routerLink]="['/', c.slug]">{{ c.name }}</a>
                @if (!c.is_public) { <app-pill text="Private" toneOverride="danger" /> }
              </div>
              <p class="t-caption slug">/{{ c.slug }}</p>
              <p class="t-caption">{{ c.city }}</p>
              <p class="t-caption count">
                {{ c.published_event_count || 0 }} published
                {{ c.published_event_count === 1 ? 'event' : 'events' }}
              </p>
            </li>
          }
        </ul>
      }
    </main>

    @if (dialogOpen()) {
      <div class="scrim" (click)="closeDialog()">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="new-cal-title"
             (click)="$event.stopPropagation()">
          <h2 id="new-cal-title">New calendar</h2>
          <form (ngSubmit)="create()">
            <label class="field">
              <span class="label">Name</span>
              <input class="control" name="name" [(ngModel)]="form.name" #nameInput />
            </label>
            <label class="field" [class.refused]="!!slugRefusal()">
              <span class="label">Address</span>
              <input class="control" name="slug" [(ngModel)]="form.slug"
                     [attr.aria-describedby]="slugRefusal() ? 'slug-refusal' : 'slug-caption'" />
              @if (slugRefusal()) {
                <span class="refusal" id="slug-refusal">{{ slugRefusal() }}</span>
              } @else {
                <span class="caption" id="slug-caption">This becomes the calendar address.</span>
              }
            </label>
            <label class="field">
              <span class="label">Category</span>
              <select class="control" name="category" [(ngModel)]="form.category">
                @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
              </select>
            </label>
            <label class="field">
              <span class="label">City</span>
              <input class="control" name="city" [(ngModel)]="form.city" />
            </label>
            <label class="row" style="gap:8px">
              <input type="checkbox" name="is_public" [(ngModel)]="form.is_public" />
              <span class="t-body">Anyone can find this calendar</span>
            </label>
            <div class="dialog-actions">
              <button type="button" class="btn btn-primary" (click)="closeDialog()">Cancel</button>
              <button type="submit" class="btn btn-solid" [disabled]="busy()">Create Calendar</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .col { max-width: 900px; padding: 32px 24px 64px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
    .cal { display: flex; flex-direction: column; gap: 6px; }
    .name { color: inherit; }
    .slug { color: var(--muted); }
    .count { color: var(--ink-64); }
  `],
})
export class CalendarsComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  categories = CATEGORIES;
  label = (c: string) => CATEGORY_LABELS[c];

  calendars = signal<Calendar[]>([]);
  loading = signal(true);
  dialogOpen = signal(false);
  busy = signal(false);
  slugRefusal = signal('');
  private opener: HTMLElement | null = null;

  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  ngOnInit() { this.load(); }

  private load() {
    this.loading.set(true);
    this.api.myCalendars().subscribe({
      next: (c) => { this.calendars.set(c); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openDialog() {
    this.opener = document.activeElement as HTMLElement;
    this.slugRefusal.set('');
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.opener?.focus();
  }

  create() {
    this.busy.set(true);
    this.slugRefusal.set('');
    this.api.createCalendar(this.form).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.calendars.update((list) => [...list, c]);
        this.notices.show(`${c.name} is ready.`, 'success');
        this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
        this.closeDialog();
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        // the dialog stays open with what was typed
        if (e.field === 'slug' || e.code === 'refused') this.slugRefusal.set(e.message);
        else this.notices.show(e.message, 'danger');
      },
    });
  }
}

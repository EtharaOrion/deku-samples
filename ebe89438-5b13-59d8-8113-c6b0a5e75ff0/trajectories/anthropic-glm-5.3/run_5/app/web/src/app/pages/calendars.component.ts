import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { CATEGORIES, categoryLabel } from '../categories';
import { CatGlyphComponent } from '../ui/cat-glyph.component';
import type { Calendar } from '../types';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [RouterLink, CatGlyphComponent, FormsModule],
  template: `
    <div class="row between">
      <h1 class="screen-title">Calendars</h1>
      <button class="btn primary" type="button" (click)="openNew()">New Calendar</button>
    </div>

    @if (loading()) {
      <ul class="grid two" aria-busy="true">
        @for (i of [1, 2]; track i) {
          <li class="card cal-card"><div class="skeleton title"></div><div class="skeleton line"></div></li>
        }
      </ul>
    } @else if (calendars().length === 0) {
      <div class="empty card big">
        <h2 class="modal-title">No Calendars Yet</h2>
        <p class="caption">A calendar is where your events live. Create one to get started.</p>
        <button class="btn primary" type="button" (click)="openNew()">New Calendar</button>
      </div>
    } @else {
      <ul class="grid two">
        @for (cal of calendars(); track cal.slug) {
          <li class="card cal-card lift-hover">
            <div class="cal-head">
              <app-cat-glyph [slug]="cal.category" [size]="22"></app-cat-glyph>
              <div class="cal-names">
                <p class="cal-name">{{ cal.name }}</p>
                <p class="caption">/{{ cal.slug }}</p>
              </div>
              @if (!cal.is_public) {
                <span class="pill private">Private</span>
              }
            </div>
            <p class="cal-meta caption">{{ cal.city }} · {{ cal.published_count ?? 0 }} published events</p>
          </li>
        }
      </ul>
    }

    @if (dialogOpen()) {
      <div class="scrim" (click)="closeNew()" role="presentation">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cal-dlg" (click)="$event.stopPropagation()">
          <h2 class="modal-title" id="cal-dlg">New Calendar</h2>
          <form class="stack-16" (submit)="create($event)" novalidate>
            <div class="field" [class.refused]="refusalField === 'name'">
              <label for="c-name">Name</label>
              <input id="c-name" type="text" [(ngModel)]="form.name" name="name" [ngModelOptions]="{ standalone: true }" required />
              @if (refusalField === 'name') { <p class="refusal">{{ refusal }}</p> }
            </div>
            <div class="field" [class.refused]="refusalField === 'slug'">
              <label for="c-slug">Address</label>
              <input id="c-slug" type="text" [(ngModel)]="form.slug" name="slug" [ngModelOptions]="{ standalone: true }" required />
              <p class="caption">This becomes the calendar address.</p>
              @if (refusalField === 'slug') { <p class="refusal" [attr.aria-live]="'polite'">{{ refusal }}</p> }
            </div>
            <div class="field">
              <label for="c-category">Category</label>
              <select id="c-category" [(ngModel)]="form.category" name="category" [ngModelOptions]="{ standalone: true }">
                @for (cat of categories; track cat.slug) { <option [value]="cat.slug">{{ cat.label }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="c-city">City</label>
              <input id="c-city" type="text" [(ngModel)]="form.city" name="city" [ngModelOptions]="{ standalone: true }" required />
            </div>
            <div class="row between switch-row">
              <label for="c-public">Public calendar</label>
              <button id="c-public" type="button" class="switch" role="switch" [attr.aria-checked]="form.is_public"
                      (click)="form.is_public = !form.is_public" aria-label="Public calendar"></button>
            </div>
            <div class="dlg-actions">
              <button class="btn secondary" type="button" (click)="closeNew()">Cancel</button>
              <button class="btn primary" type="submit" [disabled]="working()">Create Calendar</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .cal-card { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .cal-head { display: flex; align-items: center; gap: 12px; }
    .cal-names { flex: 1; min-width: 0; }
    .cal-name { margin: 0; font-size: 16px; font-weight: 500; }
    .pill.private { background: rgba(243, 26, 124, 0.12); color: #c21560; }
    .empty { margin-top: 24px; padding: 48px 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
    .switch-row { border-top: 1px solid var(--divider); padding-top: 16px; }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 12px; }
  `],
})
export class CalendarsComponent {
  readonly categories = CATEGORIES;
  calendars = signal<Calendar[]>([]);
  loading = signal(true);
  dialogOpen = signal(false);
  working = signal(false);
  refusal = '';
  refusalField: string | null = null;
  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  constructor(private api: ApiService, private notice: NoticeService) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .calendars()
      .then((rows) => {
        this.calendars.set(rows);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  openNew() {
    this.form = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.refusal = '';
    this.refusalField = null;
    this.dialogOpen.set(true);
  }

  closeNew() {
    this.dialogOpen.set(false);
  }

  async create(event: Event) {
    event.preventDefault();
    this.refusal = '';
    this.refusalField = null;
    this.working.set(true);
    try {
      await this.api.createCalendar({ ...this.form, slug: this.form.slug.trim().toLowerCase() });
      this.notice.success('Calendar created.');
      this.closeNew();
      this.load();
    } catch (e) {
      const failure = e as ApiFailure;
      this.refusal = failure.message;
      this.refusalField = failure.field ?? null;
    } finally {
      this.working.set(false);
    }
  }

  label(slug: string): string {
    return categoryLabel(slug);
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { CATEGORY_GLYPHS } from '../../core/visuals';

@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="head">
        <div>
          <h1 class="screen-title">Calendars</h1>
          <p class="caption sub">Each calendar holds its own events at its own address.</p>
        </div>
        <button class="btn btn-primary" (click)="openNew()">New Calendar</button>
      </header>

      @if (loading()) {
        <ul class="grid">
          @for (i of [1,2]; track i) { <li><div class="card" style="height:140px"></div></li> }
        </ul>
      } @else if (calendars().length === 0) {
        <div class="empty-state">
          <h2>No Calendars Yet</h2>
          <p>A calendar is where your events live. Create one to get started.</p>
          <button class="btn btn-primary" (click)="openNew()">New Calendar</button>
        </div>
      } @else {
        <ul class="grid">
          @for (cal of calendars(); track cal.id) {
            <li>
              <div class="card cal">
                <div class="top">
                  <span class="name">{{ cal.name }}</span>
                  @if (!cal.is_public) { <span class="pill private">Private</span> }
                </div>
                <span class="caption slug">/{{ cal.slug }}</span>
                <div class="meta">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" [attr.stroke]="glyph(cal.category).hue" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path [attr.d]="glyph(cal.category).path" />
                  </svg>
                  <span class="caption">{{ glyph(cal.category).label }} · {{ cal.city }}</span>
                </div>
                <a class="caption count link" [routerLink]="['/', cal.slug]">{{ cal.event_count }} published event{{ cal.event_count === 1 ? '' : 's' }}</a>
              </div>
            </li>
          }
        </ul>
      }
    </div>

    @if (dialogOpen()) {
      <div class="scrim" (click)="closeNew()" role="dialog" aria-modal="true" aria-labelledby="nc-h">
        <form class="dialog" (click)="$event.stopPropagation()" (submit)="create($event)">
          <h2 id="nc-h">New Calendar</h2>
          <div class="field">
            <label for="nc-name">Name</label>
            <input id="nc-name" type="text" [(ngModel)]="draft.name" required placeholder="Calendar name" />
          </div>
          <div class="field" [class.invalid]="!!slugRefusal()">
            <label for="nc-slug">Address</label>
            <input id="nc-slug" type="text" [(ngModel)]="draft.slug" required placeholder="calendar-address" />
            <span class="caption">This becomes the calendar address.</span>
            @if (slugRefusal()) { <p class="refusal">{{ slugRefusal() }}</p> }
          </div>
          <div class="two">
            <div class="field">
              <label for="nc-category">Category</label>
              <select id="nc-category" [(ngModel)]="draft.category" required>
                @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="nc-city">City</label>
              <input id="nc-city" type="text" [(ngModel)]="draft.city" required placeholder="City" />
            </div>
          </div>
          <div class="switchrow">
            <span id="nc-public">Public calendar</span>
            <button type="button" class="switch" role="switch" [attr.aria-checked]="draft.is_public" aria-labelledby="nc-public" (click)="draft.is_public = !draft.is_public"></button>
          </div>
          <div class="row">
            <button type="button" class="btn btn-secondary" (click)="closeNew()">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="working()">
              @if (working()) { <span class="spinner"></span> } Create Calendar
            </button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    .sub { color: var(--muted); }
    .grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
    .cal { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .name { font-size: 17px; line-height: 22px; font-weight: 600; }
    .pill.private { color: #b01461; background: rgba(243, 26, 124, 0.10); border-color: rgba(243, 26, 124, 0.3); }
    .slug { color: var(--muted); }
    .meta { display: flex; align-items: center; gap: 8px; color: var(--muted); }
    .count { align-self: flex-start; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .switchrow { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
    @media (min-width: 484px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `],
})
export class CalendarsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toasts = inject(ToastService);

  categories = Object.keys(CATEGORY_GLYPHS);
  calendars = signal<any[]>([]);
  loading = signal(true);
  working = signal(false);
  dialogOpen = signal(false);
  slugRefusal = signal('');
  draft: any = { name: '', slug: '', category: 'running', city: '', is_public: true };

  async ngOnInit(): Promise<void> {
    const list = await this.api.myCalendars();
    const withCounts = await Promise.all(list.map(async (cal: any) => {
      const { total } = await this.api.listEvents({ category: cal.category, city: cal.city, limit: 1 });
      return { ...cal, event_count: total };
    }));
    this.calendars.set(withCounts);
    this.loading.set(false);
  }

  openNew(): void {
    this.draft = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.slugRefusal.set('');
    this.dialogOpen.set(true);
  }

  closeNew(): void { this.dialogOpen.set(false); }

  async create(e: Event): Promise<void> {
    e.preventDefault();
    this.working.set(true);
    this.slugRefusal.set('');
    const res = await this.api.createCalendar(this.draft);
    this.working.set(false);
    if (!res.ok) {
      if (res.error?.field === 'slug') this.slugRefusal.set(res.error.message);
      else this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger');
      return;
    }
    this.dialogOpen.set(false);
    this.toasts.show('Calendar created.', 'success');
    const list = await this.api.myCalendars();
    const withCounts = await Promise.all(list.map(async (cal: any) => {
      const { total } = await this.api.listEvents({ category: cal.category, city: cal.city, limit: 1 });
      return { ...cal, event_count: total };
    }));
    this.calendars.set(withCounts);
  }

  glyph(cat: string) { return CATEGORY_GLYPHS[cat] ?? { hue: '#146aeb', label: cat, path: '' }; }
  label(c: string): string { return this.glyph(c).label; }
}

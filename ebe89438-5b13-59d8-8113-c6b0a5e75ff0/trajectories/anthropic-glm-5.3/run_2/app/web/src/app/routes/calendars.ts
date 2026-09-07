import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Shell } from '../layout/shell';
import { Api, ApiError } from '../core/api';
import { CATEGORY_HUES } from '../ui/icons';
import { CATEGORIES } from './discover';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'cc-calendars',
  standalone: true,
  imports: [FormsModule, Shell, RouterLink],
  template: `
  <cc-shell>
    <div class="spread">
      <h1 class="screen-title">Your calendars</h1>
      <button class="btn btn-primary" type="button" (click)="open()">New Calendar</button>
    </div>

    @if (loading) {
      <div class="grid">@for (s of [1,2]; track s) { <div class="skeleton skeleton-card"></div> }</div>
    } @else if (!calendars.length) {
      <div class="empty">
        <h2>No Calendars Yet</h2>
        <p>A calendar is where your events live. Create one to get started.</p>
        <button class="btn btn-primary" type="button" (click)="open()">New Calendar</button>
      </div>
    } @else {
      <ul class="grid">
        @for (c of calendars; track c.id) {
          <li><a class="card card-lift cal" [routerLink]="['/', c.slug]">
            <div class="spread">
              <p class="card-title big">{{ c.name }}</p>
              @if (!c.is_public) { <span class="pill pill-private"><span class="pill-dot"></span>Private</span> }
            </div>
            <p class="caption mono">/{{ c.slug }}</p>
            <div class="row meta">
              <span class="cat-dot" [style.background]="hue(c.category)"></span>
              <span class="caption">{{ c.category }} · {{ c.city }} · {{ c.published_count }} published</span>
            </div>
          </a></li>
        }
      </ul>
    }

    @if (dialog) {
      <div class="scrim" (click)="close()"></div>
      <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="cal-h">
        <h2 id="cal-h" class="screen-title">New Calendar</h2>
        <form class="stack-16" (submit)="create($event)">
          <label><span class="field-label">Name</span>
            <input class="field" [(ngModel)]="form.name" name="name" required></label>
          <label><span class="field-label">Address</span>
            <input class="field" [(ngModel)]="form.slug" name="slug" (ngModelChange)="slugTouched = true" required>
            @if (slugTouched) { <span class="field-caption">This becomes the calendar address.</span> }
            @if (slugError) { <span class="field-error" role="alert">{{ slugError }}</span> }</label>
          <label><span class="field-label">Category</span>
            <select class="field" [(ngModel)]="form.category" name="category" required>
              @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
            </select></label>
          <label><span class="field-label">City</span>
            <input class="field" [(ngModel)]="form.city" name="city" required></label>
          <label class="row spread"><span>Public calendar</span>
            <input type="checkbox" [(ngModel)]="form.is_public" name="is_public"></label>
          <div class="row spread">
            <button class="btn btn-secondary" type="button" (click)="close()">Cancel</button>
            <button class="btn btn-primary" type="submit" [disabled]="busy">
              {{ busy ? 'Creating…' : 'Create Calendar' }}
            </button>
          </div>
        </form>
      </div>
    }
  </cc-shell>`,
  styles: [`
    .grid { list-style: none; margin: 24px 0; padding: 0; display: grid;
      grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .cal { padding: 18px; display: grid; gap: 10px; align-content: start; }
    .big { font-size: 17px; }
    .mono { font-family: var(--mono); font-size: 13px; }
    .cat-dot { width: 12px; height: 12px; border-radius: 100%; }
    .pill-private { background: rgba(243,26,124,0.10); color: #b31360; }
    .scrim { position: fixed; inset: 0; background: rgba(21,21,21,0.8); z-index: 9901; }
    .dialog { position: fixed; z-index: 9999; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px)); padding: 28px; border-radius: 24px;
      animation: dialog-in 0.3s var(--ease-out) both; }
    @keyframes dialog-in { from { opacity: 0; transform: translate(-50%, -46%); } }
    @media (max-width: 484px) {
      .dialog { top: auto; bottom: 0; left: 0; right: 0; transform: none;
        border-radius: 24px 24px 0 0; animation: sheet-in 0.3s var(--ease-out) both; }
      @keyframes sheet-in { from { transform: translateY(40px); } }
    }
  `],
})
export class Calendars implements OnInit {
  loading = true;
  calendars: any[] = [];
  dialog = false;
  busy = false;
  slugError = '';
  slugTouched = false;
  categories = CATEGORIES;
  form = { name: '', slug: '', category: 'running', city: '', is_public: true };

  constructor(private api: Api) {}
  ngOnInit(): void { this.load(); }

  async load(): Promise<void> {
    this.calendars = await this.api.request<any[]>('/calendars');
    this.loading = false;
  }

  hue(c: string): string { return CATEGORY_HUES[c] ?? '#48484a'; }
  open(): void { this.dialog = true; this.slugError = ''; }
  close(): void { this.dialog = false; }

  async create(e: Event): Promise<void> {
    e.preventDefault();
    this.busy = true; this.slugError = '';
    try {
      await this.api.request('/calendars', { method: 'POST', body: JSON.stringify(this.form) });
      this.dialog = false;
      await this.load();
    } catch (err) {
      const e2 = err as ApiError;
      this.slugError = e2.fields?.['slug'] ?? e2.message;
    } finally { this.busy = false; }
  }
}

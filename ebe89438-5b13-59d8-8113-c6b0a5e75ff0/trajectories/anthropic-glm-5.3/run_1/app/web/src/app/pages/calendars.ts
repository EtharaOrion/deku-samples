import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../icon';
import { Api } from '../api';
import { Auth } from '../auth';
import { CATEGORIES } from '../categories';

interface Calendar { id: string; name: string; slug: string; category: string; city: string; is_public: boolean; published_count?: number; }

/** /calendars — the calendars the signed-in host owns. */
@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [IconComponent, RouterLink, CommonModule, FormsModule],
  template: `
    <div class="head">
      <h1 class="h1">Calendars</h1>
      <button class="btn btn-primary" type="button" (click)="open()">New Calendar</button>
    </div>

    @if (notPermitted()) {
      <div class="nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </div>
    } @else if (loading()) {
      <div class="grid"><div class="skeleton" style="height:160px"></div><div class="skeleton" style="height:160px"></div></div>
    } @else if (cals().length === 0) {
      <div class="empty">
        <h2>No Calendars Yet</h2>
        <p>A calendar is where your events live. Create one to get started.</p>
        <button class="btn btn-primary" type="button" (click)="open()">New Calendar</button>
      </div>
    } @else {
      <ul class="grid">
        @for (cal of cals(); track cal.id) {
          <li>
            <div class="card cal-card">
              <div class="cal-top">
                <app-icon [name]="cal.category" [size]="24"></app-icon>
                @if (!cal.is_public) { <span class="pill pill-danger">Private</span> }
              </div>
              <a class="cal-name" [routerLink]="['/' + cal.slug]">{{ cal.name }}</a>
              <span class="cal-slug">/{{ cal.slug }}</span>
              <span class="cal-meta">{{ cal.city }} · {{ cal.published_count ?? 0 }} published events</span>
            </div>
          </li>
        }
      </ul>
    }

    @if (showDialog()) {
      <div class="scrim" (click)="close()" (keydown.escape)="close()">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cal-title" (click)="$event.stopPropagation()">
          <h2 class="dialog-h" id="cal-title">New Calendar</h2>
          <div class="field">
            <label for="cal-name">Name</label>
            <input id="cal-name" type="text" [(ngModel)]="draft.name" placeholder="Riverside Run Club" />
          </div>
          <div class="field" [class.refused]="!!slugRefusal">
            <label for="cal-slug">Address</label>
            <input id="cal-slug" type="text" [(ngModel)]="draft.slug" placeholder="riverside-run-club" aria-describedby="cal-slug-cap" />
            <span class="caption" id="cal-slug-cap">This becomes the calendar address.</span>
            @if (slugRefusal) { <p class="refusal">{{ slugRefusal }}</p> }
          </div>
          <div class="field">
            <label for="cal-cat">Category</label>
            <select id="cal-cat" [(ngModel)]="draft.category">
              @for (c of categories; track c.slug) { <option [value]="c.slug">{{ c.label }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="cal-city">City</label>
            <input id="cal-city" type="text" [(ngModel)]="draft.city" placeholder="Berlin" />
          </div>
          <label class="switch-row">
            <input type="checkbox" [(ngModel)]="draft.is_public" />
            <span>Public calendar</span>
          </label>
          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" (click)="close()">Cancel</button>
            <button class="btn btn-primary" type="button" (click)="create()" [disabled]="working()">
              @if (working()) { Creating… } @else { Create Calendar }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .cal-card { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .cal-top { display: flex; justify-content: space-between; align-items: center; }
    .cal-name { font-size: 16px; line-height: 24px; font-weight: 500; text-decoration: none; color: var(--ink); }
    .cal-name:hover { text-decoration: underline; }
    .cal-slug { font-size: 13px; line-height: 16px; color: var(--muted); }
    .cal-meta { font-size: 13px; line-height: 16px; color: var(--muted); }
    .empty { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .empty h2 { font-family: var(--serif); font-weight: 400; font-size: 26px; margin: 0; }
    .empty p { color: var(--muted); margin: 0; }
    .nf { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; grid-column: 1 / -1; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
    .dialog-h { font-size: 17px; line-height: 22px; margin: 0 0 16px; font-weight: 600; }
    .dialog { display: flex; flex-direction: column; gap: 14px; }
    .switch-row { display: flex; gap: 10px; align-items: center; font-size: 15px; min-height: 44px; }
    .switch-row input { width: 20px; height: 20px; }
    .dialog-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
    @media (max-width: 484px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class CalendarsComponent implements OnInit {
  categories = CATEGORIES;
  cals = signal<Calendar[]>([]);
  loading = signal(true);
  notPermitted = signal(false);
  showDialog = signal(false);
  working = signal(false);
  slugRefusal: string | null = null;
  draft = { name: '', slug: '', category: 'running', city: '', is_public: true };

  constructor(private api: Api, private auth: Auth, private router: Router) {}

  ngOnInit() {
    if (this.auth.account()?.role !== 'host') { this.notPermitted.set(true); return; }
    this.load();
  }

  async load() {
    this.loading.set(true);
    const { body } = await this.api.get<Calendar[]>('/calendars');
    this.cals.set((body as any) || []);
    this.loading.set(false);
  }

  open() { this.showDialog.set(true); this.slugRefusal = null; }
  close() { this.showDialog.set(false); }

  async create() {
    this.working.set(true);
    this.slugRefusal = null;
    const { status, body } = await this.api.post<Calendar>('/calendars', this.draft);
    this.working.set(false);
    if (status === 201) {
      this.showDialog.set(false);
      this.api.flash(`${this.draft.name} is ready.`, 'success');
      this.draft = { name: '', slug: '', category: 'running', city: '', is_public: true };
      await this.load();
    } else {
      const b: any = body;
      if (b?.field === 'slug') this.slugRefusal = b.message;
      else this.api.flash(b?.message || `That didn't work. Try once more.`, 'danger');
    }
  }
}

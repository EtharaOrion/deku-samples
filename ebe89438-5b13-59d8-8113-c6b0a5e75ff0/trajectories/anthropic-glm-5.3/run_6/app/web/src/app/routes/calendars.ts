import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError, CalendarRecord } from '../api.service';
import { NoticeService } from '../notice.service';
import { AppShellComponent, DialogComponent } from '../shell';
import { CatIconComponent } from '../widgets';
import { CATEGORIES, CATEGORY_LABELS } from '../shared';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-calendars', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AppShellComponent, CatIconComponent, DialogComponent, NotFoundComponent],
  template: `
    @if (!allowed()) {
      <route-not-found></route-not-found>
    } @else {
      <app-shell>
        <div class="spread">
          <h1 class="t-screen">Your calendars</h1>
          <button type="button" class="btn btn-primary pill-btn" (click)="openNew()">New Calendar</button>
        </div>

        @if (loading()) {
          <div class="grid grid-2">@for (i of [1,2]; track i) { <div class="skeleton" style="height:120px;border-radius:12px"></div> }</div>
        } @else if (cals().length === 0) {
          <div class="card empty-card">
            <h2 class="t-screen">No Calendars Yet</h2>
            <p class="t-para">A calendar is where your events live. Create one to get started.</p>
            <button type="button" class="btn btn-primary" (click)="openNew()">New Calendar</button>
          </div>
        } @else {
          <ul class="grid grid-2">
            @for (c of cals(); track c.id) {
              <li class="card card-lift cal-card">
                <div class="row gap-12">
                  <cat-icon [category]="c.category" [size]="24" [label]="true"></cat-icon>
                  <div class="stack" style="gap:2px;flex:1;min-width:0">
                    <span class="t-card-title">{{ c.name }}</span>
                    <span class="t-caption">/{{ c.slug }} · {{ c.city }}</span>
                  </div>
                  @if (!c.is_public) { <span class="badge-private">Private</span> }
                </div>
                <span class="t-caption">{{ c.published_events }} published events</span>
                <a class="link" [routerLink]="['/create']" [queryParams]="{ calendar: c.slug }">Create an event</a>
              </li>
            }
          </ul>
        }
      </app-shell>

      @if (showNew()) {
        <cc-dialog title="New Calendar" (closed)="showNew.set(false)">
          <form (ngSubmit)="create()" novalidate class="stack gap-16">
            <div class="field" [class.invalid]="errField() === 'name'">
              <label for="nc-name">Name</label>
              <input id="nc-name" name="name" [(ngModel)]="draft.name" required>
            </div>
            <div class="field" [class.invalid]="errField() === 'slug'">
              <label for="nc-slug">Address</label>
              <input id="nc-slug" name="slug" [(ngModel)]="draft.slug" required>
              <span class="field-hint">This becomes the calendar address.</span>
              @if (errField() === 'slug') { <p class="field-error">{{ err() }}</p> }
            </div>
            <div class="field">
              <label for="nc-cat">Category</label>
              <select id="nc-cat" name="category" [(ngModel)]="draft.category" required>
                @for (c of categoryList; track c) { <option [value]="c">{{ labelOf(c) }}</option> }
              </select>
            </div>
            <div class="field" [class.invalid]="errField() === 'city'">
              <label for="nc-city">City</label>
              <input id="nc-city" name="city" [(ngModel)]="draft.city" required>
            </div>
            <label class="row" style="gap:12px">
              <input type="checkbox" name="is_public" [(ngModel)]="draft.is_public" style="width:20px;height:20px;min-height:0">
              <span>Public calendar</span>
            </label>
            @if (err() && errField() !== 'slug') { <p class="field-error" role="alert">{{ err() }}</p> }
            <div class="dialog-actions">
              <button type="button" class="btn btn-ghost" type="button" (click)="showNew.set(false)">Cancel</button>
              <button class="btn btn-primary" type="submit" [disabled]="busy()">Create Calendar</button>
            </div>
          </form>
        </cc-dialog>
      }
    }
  `,
  styles: [`
    :host{display:block}
    .cal-card{padding:20px;display:flex;flex-direction:column;gap:12px}
    .badge-private{font-size:11px;line-height:16px;font-weight:600;color:var(--pink);border:1px solid currentColor;border-radius:100px;padding:2px 10px}
    .empty-card{padding:48px 32px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;max-width:480px;margin:24px auto}
    .dialog-actions{display:flex;gap:12px;justify-content:flex-end}
  `],
})
export class CalendarsComponent implements OnInit {
  api = inject(ApiService);
  private notice = inject(NoticeService);
  cals = signal<CalendarRecord[]>([]);
  loading = signal(true);
  allowed = signal(true);
  showNew = signal(false);
  busy = signal(false);
  err = signal(''); errField = signal<string | null>(null);
  categoryList = CATEGORIES;
  labelOf = (c: string) => CATEGORY_LABELS[c] || c;
  draft = { name: '', slug: '', category: 'running', city: '', is_public: true };

  ngOnInit() {
    if (!this.api.account || this.api.account.role !== 'host') { this.allowed.set(false); return; }
    this.load();
  }

  async load() {
    this.loading.set(true);
    try { this.cals.set(await this.api.get<CalendarRecord[]>('/calendars')); }
    catch { this.cals.set([]); }
    this.loading.set(false);
  }

  openNew() {
    this.draft = { name: '', slug: '', category: 'running', city: '', is_public: true };
    this.err.set(''); this.errField.set(null);
    this.showNew.set(true);
  }

  async create() {
    this.busy.set(true); this.err.set(''); this.errField.set(null);
    try {
      await this.api.post('/calendars', this.draft);
      this.notice.say(`${this.draft.name} is ready.`, 'success');
      this.showNew.set(false);
      await this.load();
    } catch (e) {
      const err = e as ApiError;
      this.err.set(err.message);
      this.errField.set(err.field ?? null);
    } finally { this.busy.set(false); }
  }
}

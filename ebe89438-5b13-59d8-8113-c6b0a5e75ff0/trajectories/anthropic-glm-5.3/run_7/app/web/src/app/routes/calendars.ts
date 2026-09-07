import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Calendar } from '../core/api';
import { CATEGORIES, CATEGORY_LABELS } from '../core/tokens';
import { CategoryIconComponent } from '../ui/category-icon';
import { SignedShellComponent } from '../shells/signed-shell';
import { SkeletonComponent } from '../ui/skeleton';
import { DialogComponent } from '../ui/dialog';

@Component({
  selector: 'app-calendars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, CategoryIconComponent, SkeletonComponent, DialogComponent, FormsModule],
  template: `
    <app-signed-shell>
      <div class="head">
        <h1>Your calendars</h1>
        <button type="button" class="btn btn-primary" (click)="open.set(true)">New Calendar</button>
      </div>

      @if (loading()) {
        <app-skeleton [count]="2" [height]="96" [art]="64" />
      } @else if (!list().length) {
        <div class="empty">
          <h2>No Calendars Yet</h2>
          <p>A calendar is where your events live. Create one to get started.</p>
          <button type="button" class="btn btn-primary" (click)="open.set(true)">New Calendar</button>
        </div>
      } @else {
        <ul class="grid">
          @for (c of list(); track c.id) {
            <li class="card">
              <div class="top">
                <span class="glyph"><app-category-icon [name]="c.category" [size]="22" /></span>
                <span class="name">{{ c.name }}</span>
                @if (!c.is_public) { <span class="pill private">Private</span> }
              </div>
              <p class="slug">/{{ c.slug }}</p>
              <p class="meta">{{ c.city }} · {{ label(c.category) }}</p>
              <p class="count">{{ c.published_events ?? 0 }} published events</p>
            </li>
          }
        </ul>
      }
    </app-signed-shell>

    <app-dialog [open]="open()" title="New calendar"
                body="A calendar holds your events and gives them an address."
                [closed]="close">
      <form (submit)="submit($event)" novalidate>
        <label class="field">
          <span class="fl">Name</span>
          <input class="input" name="name" [(ngModel)]="draft.name" required />
        </label>
        <label class="field">
          <span class="fl">Address</span>
          <input class="input" name="slug" [(ngModel)]="draft.slug" aria-describedby="slugcap" />
          <span class="caption" id="slugcap">This becomes the calendar address.</span>
          @if (slugRefusal()) { <span class="refusal" role="alert">{{ slugRefusal() }}</span> }
        </label>
        <label class="field">
          <span class="fl">Category</span>
          <select class="input" name="category" [(ngModel)]="draft.category">
            @for (c of cats; track c) { <option [value]="c">{{ label(c) }}</option> }
          </select>
        </label>
        <label class="field">
          <span class="fl">City</span>
          <input class="input" name="city" [(ngModel)]="draft.city" />
        </label>
        <label class="check">
          <input type="checkbox" name="is_public" [(ngModel)]="draft.is_public" />
          <span>Public calendar</span>
        </label>
        <div class="actions">
          <button type="button" class="btn btn-quiet" (click)="open.set(false)">Cancel</button>
          <button type="submit" class="btn btn-primary" [disabled]="working()">
            @if (working()) { Creating } @else { Create calendar }
          </button>
        </div>
      </form>
    </app-dialog>
  `,
  styles: [`
    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    h1 { font: 700 22px/26px var(--sans); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
    .card { padding: 20px; border-radius: var(--r-card); background: var(--paper); box-shadow: var(--shadow-card), var(--ring-onboard);
      display: flex; flex-direction: column; gap: 6px; }
    .top { display: flex; align-items: center; gap: 10px; }
    .glyph { display: inline-flex; color: var(--muted-icon); }
    .name { font: 500 16px/24px var(--sans); flex: 1; }
    .private { color: var(--pink); border-color: rgba(243, 26, 124, 0.4); }
    .slug { font-size: 13px; line-height: 16px; color: var(--muted); margin: 0; }
    .meta { font-size: 13px; color: var(--muted); margin: 0; }
    .count { font-size: 13px; color: var(--ink-64); margin: 0; }
    .empty { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .empty h2 { font: 700 20px/26px var(--sans); }
    .empty p { color: var(--muted); margin-bottom: 8px; }
    .field { display: block; margin-bottom: 14px; }
    .fl { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    .refusal { display: block; font-size: 13px; color: var(--danger); margin-top: 6px; }
    .check { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; min-height: 44px; }
    .check input { width: 20px; height: 20px; }
    .actions { display: flex; gap: 12px; justify-content: flex-end; }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class CalendarsComponent {
  private api = inject(Api);
  list = signal<Calendar[]>([]);
  loading = signal(true);
  open = signal(false);
  working = signal(false);
  slugRefusal = signal('');
  cats = CATEGORIES;

  draft = { name: '', slug: '', category: 'running', city: '', is_public: true };

  ngOnInit() {
    this.api.calendars().subscribe({
      next: (c) => { this.list.set(c); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  label(c: string) { return CATEGORY_LABELS[c]; }

  close = () => this.open.set(false);

  submit(e: Event) {
    e.preventDefault();
    if (this.working()) return;
    this.working.set(true);
    this.slugRefusal.set('');
    this.api.createCalendar({ ...this.draft }).subscribe({
      next: (c) => {
        this.working.set(false);
        this.open.set(false);
        this.list.update((l) => [...l, c]);
        this.api.notify(`Calendar ${c.name} is ready.`, 'success');
        this.draft = { name: '', slug: '', category: 'running', city: '', is_public: true };
      },
      error: (err) => {
        this.working.set(false);
        const msg = this.api.messageFor(err);
        this.slugRefusal.set(msg);
      },
    });
  }
}

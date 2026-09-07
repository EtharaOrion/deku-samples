import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Api, AuthService, CATEGORIES, Calendar, EventItem, Registration } from '../api';
import { NoticeService } from '../notice';
import { SideRailComponent } from '../chrome';
import { IconDirective } from '../icons';
import { StatusPillComponent, NotFoundComponent } from './bits';
import { fmtInZone } from './event';

const GUEST_ITEMS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/discover', label: 'Discover', icon: 'search' },
  { path: '/settings/profile', label: 'Settings', icon: 'settings' },
];
const HOST_ITEMS = [
  { path: '/calendars', label: 'Calendars', icon: 'calendar' },
  { path: '/create', label: 'Create', icon: 'plus' },
  { path: '/discover', label: 'Discover', icon: 'search' },
  { path: '/settings/profile', label: 'Settings', icon: 'settings' },
];

@Component({
  selector: 'app-signed-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SideRailComponent],
  template: `
    <div class="shell">
      <app-side-rail [items]="items" />
      <div class="shell-content"><router-outlet /></div>
    </div>
  `,
})
export class SignedShellComponent {
  items = GUEST_ITEMS;
  constructor(private auth: AuthService) {
    this.auth.account$.subscribe(a => { this.items = a?.role === 'host' ? HOST_ITEMS : GUEST_ITEMS; });
  }
}

/** /home: the guest's registrations. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, IconDirective, StatusPillComponent],
  template: `
    <h1 class="screen-title">Your registrations</h1>
    @if (loading) {
      <div class="skeleton" style="height:80px;margin-top:16px"></div>
      <div class="skeleton" style="height:80px;margin-top:8px"></div>
    } @else if (rows.length === 0) {
      <div class="empty card card-24">
        <h2 class="empty-title">No Upcoming Events</h2>
        <p class="empty-body">Events you register for will appear here.</p>
        <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
      </div>
    } @else {
      <section>
        <h2 class="group">Upcoming</h2>
        <ul class="rows">
          @for (r of upcoming; track r.id) {
            <li class="row-item">
              <span class="thumb" [style.background]="r.theme_hex"></span>
              <div class="row-main">
                <a [routerLink]="['/', r.event_slug]" class="row-title">{{ r.event_title }}</a>
                <span class="caption">{{ when(r) }}</span>
              </div>
              <app-status [status]="r.status" />
              <div class="row-action">
                @if (r.status === 'confirmed' || r.status === 'checked_in') {
                  <a class="btn btn-secondary btn-small" [routerLink]="['/t', r.ticket_code!]">View Ticket</a>
                  <button type="button" class="btn btn-ghost btn-small" (click)="confirmCancel(r)">Cancel</button>
                } @else if (r.status === 'waitlisted') {
                  <button type="button" class="btn btn-ghost btn-small" (click)="confirmCancel(r)">Leave Waiting List</button>
                }
              </div>
            </li>
          }
        </ul>
      </section>
      @if (past.length) {
        <section>
          <h2 class="group">Past</h2>
          <ul class="rows">
            @for (r of past; track r.id) {
              <li class="row-item">
                <span class="thumb" [style.background]="r.theme_hex"></span>
                <div class="row-main">
                  <span class="row-title">{{ r.event_title }}</span>
                  <span class="caption">{{ when(r) }}</span>
                </div>
                <app-status [status]="r.status" />
              </li>
            }
          </ul>
        </section>
      }
    }
    @if (cancelling) {
      <div class="scrim" (click)="cancelling = null" role="presentation">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h" (click)="$event.stopPropagation()">
          <h2 id="dlg-h" class="dlg-title">Cancel your place?</h2>
          <p class="dlg-body">One seat is released and the next person on the waiting list is offered it straight away.</p>
          <div class="dlg-actions">
            <button type="button" class="btn btn-secondary" (click)="cancelling = null">Keep my place</button>
            <button type="button" class="btn btn-danger" (click)="doCancel()">Cancel my place</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .group { font-size: 16px; line-height: 25.6px; font-weight: 600; margin: 24px 0 8px; }
    .rows { display: flex; flex-direction: column; }
    .row-item { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--divider); font-size: 15px; line-height: 22px; }
    .thumb { width: 44px; height: 44px; border-radius: 11px; flex: none; }
    .row-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .row-title { font-size: 15px; line-height: 22px; font-weight: 500; }
    .row-action { display: flex; gap: 8px; }
    .empty { margin-top: 32px; padding: 48px; display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
    .empty-title { font-family: var(--serif); font-weight: 400; font-size: 22px; }
    .empty-body { color: var(--muted); }
    .dlg-title { font-size: 17px; line-height: 22px; font-weight: 600; margin-bottom: 8px; }
    .dlg-body { font-size: 15px; line-height: 22px; color: var(--ink-64); margin-bottom: 20px; }
    .dlg-actions { display: flex; gap: 12px; justify-content: flex-end; }
    @media (max-width: 649px) { .row-action { flex-direction: column; } .row-item { flex-wrap: wrap; } }
  `],
})
export class HomeComponent implements OnInit {
  rows: Registration[] = [];
  loading = true;
  cancelling: Registration | null = null;
  private api = inject(Api);
  private notice = inject(NoticeService);
  get upcoming() { return this.rows.filter(r => new Date(r.ends_at!).getTime() >= Date.now()); }
  get past() { return this.rows.filter(r => new Date(r.ends_at!).getTime() < Date.now()); }
  ngOnInit() { this.load(); }
  load() {
    this.api.myRegistrations().subscribe((r: Registration[]) => { this.rows = r; this.loading = false; },
      () => { this.rows = []; this.loading = false; });
  }
  when(r: Registration) { return fmtInZone(r.starts_at!, r.ends_at!, r.time_zone!); }
  confirmCancel(r: Registration) { this.cancelling = r; }
  async doCancel() {
    const r = this.cancelling;
    if (!r) return;
    try {
      const out = await this.api.pr(this.api.cancelRegistration(r.id));
      Object.assign(r, out);
      this.notice.polite('Your place is released.', 'info');
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
    this.cancelling = null;
  }
}

/** /calendars: the calendars owned. */
@Component({
  selector: 'app-calendars',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconDirective, NotFoundComponent],
  template: `
    @if (isGuest) { <app-not-found /> } @else {
      <h1 class="screen-title">Calendars</h1>
      <div class="top"><button type="button" class="btn btn-primary" (click)="open = true">New Calendar</button></div>
      @if (loading) {
        <ul class="grid"><li class="skeleton" style="height:160px"></li><li class="skeleton" style="height:160px"></li></ul>
      } @else if (cals.length === 0) {
        <div class="empty card card-24">
          <h2 class="empty-title">No Calendars Yet</h2>
          <p class="empty-body">A calendar is where your events live. Create one to get started.</p>
          <button type="button" class="btn btn-primary" (click)="open = true">New Calendar</button>
        </div>
      } @else {
        <ul class="grid">
          @for (c of cals; track c.id) {
            <li class="card cal">
              <div class="cal-head">
                <svg [appIcon]="c.category" [size]="22" [hue]="hueOf(c.category)"></svg>
                <span class="cal-name">{{ c.name }}</span>
                @if (!c.is_public) { <span class="badge">Private</span> }
              </div>
              <span class="slug caption">/{{ c.slug }}</span>
              <span class="caption">{{ c.city }} · {{ c.published_events }} published</span>
            </li>
          }
        </ul>
      }
      @if (open) {
        <div class="scrim" (click)="open = false" role="presentation">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="nc-h" (click)="$event.stopPropagation()">
            <h2 id="nc-h" class="dlg-title">New Calendar</h2>
            <form (ngSubmit)="create()" novalidate>
              <div class="field"><label for="c-name">Name</label>
                <input id="c-name" name="name" [(ngModel)]="form.name" required /></div>
              <div class="field"><label for="c-slug">Address</label>
                <input id="c-slug" name="slug" [(ngModel)]="form.slug" />
                <span class="field-hint">This becomes the calendar address.</span>
                @if (slugError) { <p class="field-error" role="alert">{{ slugError }}</p> }
              </div>
              <div class="field"><label for="c-cat">Category</label>
                <select id="c-cat" name="category" [(ngModel)]="form.category">
                  @for (c of cats; track c.slug) { <option [value]="c.slug">{{ c.label }}</option> }
                </select></div>
              <div class="field"><label for="c-city">City</label>
                <input id="c-city" name="city" [(ngModel)]="form.city" /></div>
              <div class="field switch">
                <label for="c-pub">Public calendar</label>
                <input id="c-pub" type="checkbox" [(ngModel)]="form.is_public" />
              </div>
              <div class="dlg-actions">
                <button type="button" class="btn btn-secondary" (click)="open = false">Cancel</button>
                <button type="submit" class="btn btn-primary" [disabled]="working">Create Calendar</button>
              </div>
            </form>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .top { display: flex; justify-content: flex-end; margin: 16px 0 24px; }
    .grid { list-style: none; display: grid; grid-template-columns: repeat(2,1fr); gap: 24px; }
    .cal { padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .cal-head { display: flex; align-items: center; gap: 10px; }
    .cal-name { font-size: 16px; line-height: 24px; font-weight: 500; }
    .slug { font-family: inherit; }
    .badge { margin-left: auto; border-radius: 100px; padding: 2px 10px; font-size: 11px; line-height: 16px; font-weight: 600; background: rgba(243,26,124,.12); color: #c2186f; border: 1px solid rgba(243,26,124,.35); }
    .empty { padding: 48px; display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
    .empty-title { font-family: var(--serif); font-weight: 400; font-size: 22px; }
    .empty-body { color: var(--muted); }
    .dlg-title { font-size: 17px; line-height: 22px; font-weight: 600; margin-bottom: 16px; }
    .dlg-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    .switch { flex-direction: row; align-items: center; gap: 10px; }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class CalendarsComponent implements OnInit {
  cals: Calendar[] = [];
  loading = true;
  open = false;
  working = false;
  slugError = '';
  cats = CATEGORIES;
  form = { name: '', slug: '', category: 'running', city: '', is_public: true };
  private api = inject(Api);
  private auth = inject(AuthService);
  private notice = inject(NoticeService);
  isGuest = false;
  ngOnInit() {
    this.auth.account$.subscribe(a => (this.isGuest = a?.role === 'guest'));
    this.api.myCalendars().subscribe((c: Calendar[]) => { this.cals = c; this.loading = false; },
      () => { this.cals = []; this.loading = false; });
  }
  hueOf(cat: string) { return CATEGORIES.find(c => c.slug === cat)?.hue ?? '#146aeb'; }
  async create() {
    this.slugError = '';
    this.working = true;
    try {
      await this.api.pr(this.api.createCalendar({ ...this.form, slug: this.form.slug.trim().toLowerCase() }));
      this.notice.polite('Calendar created.', 'success');
      this.open = false;
      this.api.myCalendars().subscribe((c: Calendar[]) => (this.cals = c));
    } catch (e: any) {
      if (e?.field === 'address' || /address|taken|reserved/i.test(e?.message ?? '')) this.slugError = e.message;
      else this.notice.show(e?.message ?? 'That did not go through.', 'danger');
    } finally { this.working = false; }
  }
}

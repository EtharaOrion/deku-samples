import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, AuthService, CATEGORIES, Calendar, EventItem, Registration } from '../api';
import { NoticeService } from '../notice';
import { IconDirective } from '../icons';
import { StatusPillComponent, NotFoundComponent } from './bits';
import { fmtInZone } from './event';

/** /create: one screen, never a wizard. */
@Component({
  selector: 'app-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconDirective, NotFoundComponent],
  template: `
    @if (isGuest) { <app-not-found /> } @else {
      <div class="composer">
        <div class="art" aria-hidden="true">
          <div class="art-rotor"></div>
          <div class="art-glow"></div>
          <div class="art-backdrop"></div>
        </div>
        <div class="form-col">
          <h1 class="screen-title">Create an event</h1>
          <form (ngSubmit)="submit()" novalidate>
            <div class="field"><label for="cal">Calendar</label>
              <select id="cal" name="calendar_slug" [(ngModel)]="f.calendar_slug">
                @for (c of cals; track c.id) { <option [value]="c.slug">{{ c.name }}</option> }
              </select>
              @if (calError) { <p class="field-error">{{ calError }}</p> }
            </div>
            <div class="field"><label for="pub">Public</label>
              <select id="pub" name="is_public" [(ngModel)]="f.is_public">
                <option [value]="true">Public</option><option [value]="false">Private</option>
              </select>
            </div>
            <div class="field"><label for="title">Name</label>
              <input id="title" name="title" placeholder="Event Name" [(ngModel)]="f.title" />
              @if (titleError) { <p class="field-error">{{ titleError }}</p> }
            </div>
            <div class="two">
              <div class="field"><label for="starts">Starts</label>
                <input id="starts" name="starts_at" type="datetime-local" [(ngModel)]="f.starts_at" /></div>
              <div class="field"><label for="ends">Ends</label>
                <input id="ends" name="ends_at" type="datetime-local" [(ngModel)]="f.ends_at" /></div>
            </div>
            @if (timeError) { <p class="field-error">{{ timeError }}</p> }
            <div class="field"><label for="city">Where</label>
              <input id="city" name="city" placeholder="City" [(ngModel)]="f.city" /></div>
            <div class="field"><label for="cat">Category</label>
              <select id="cat" name="category" [(ngModel)]="f.category">
                @for (c of cats; track c.slug) { <option [value]="c.slug">{{ c.label }}</option> }
              </select></div>
            <div class="field"><label for="tz">Time zone</label>
              <select id="tz" name="time_zone" [(ngModel)]="f.time_zone">
                @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
              </select></div>
            <div class="field"><label for="desc">About</label>
              <textarea id="desc" name="description" rows="4" [(ngModel)]="f.description"></textarea></div>

            <div class="setting"><div class="setting-text"><span class="setting-label">Capacity</span>
              <span class="field-hint">Unlimited</span></div>
              <input class="stepper" type="number" min="1" max="500" [(ngModel)]="f.capacity" name="capacity" [attr.aria-label]="'Capacity'" /></div>
            <div class="setting"><div class="setting-text"><span class="setting-label">Waitlist Enabled</span></div>
              <input id="wl" type="checkbox" [(ngModel)]="f.waitlist_enabled" name="waitlist_enabled" /></div>
            <div class="setting"><div class="setting-text"><span class="setting-label">Theme</span>
              <span class="field-hint">Seasonal</span></div>
              <span class="swatch" [style.background]="swatch"></span></div>
            <button class="btn btn-primary" type="submit" [disabled]="working">Create Event</button>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    .composer { position: relative; display: grid; grid-template-columns: 520px 568px; gap: 48px; align-items: start; }
    .art { position: relative; height: 520px; border-radius: 24px; overflow: hidden; background: var(--panel); }
    .art-rotor { position: absolute; inset: -30%; background: conic-gradient(from 0deg, #f31a7c, #d69712, #ab46dd, #146aeb, #f31a7c); filter: brightness(1.3) saturate(0) blur(50px); mix-blend-mode: overlay; animation: shift-background 60000ms linear infinite; will-change: transform; }
    .art-glow { position: absolute; inset: 20%; background: radial-gradient(circle, #146aeb66, transparent 70%); filter: blur(60px); }
    .art-backdrop { position: absolute; inset: 0; backdrop-filter: blur(100px) saturate(1.5); }
    .form-col form { display: flex; flex-direction: column; gap: 16px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .setting { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--divider); padding-top: 16px; }
    .setting-text { display: flex; flex-direction: column; flex: 1; }
    .setting-label { font-size: 16px; line-height: 24px; }
    .stepper { width: 90px; border-radius: 4px; border: 1px solid var(--ink-08); padding: 10px 12px; min-height: 44px; }
    .swatch { width: 44px; height: 44px; border-radius: 11px; }
    @media (max-width: 999px) { .composer { grid-template-columns: 1fr; } .art { height: 240px; } }
    @media (prefers-reduced-motion: reduce) { .art-rotor { animation: none !important; } }
  `],
})
export class CreateComponent implements OnInit {
  cals: Calendar[] = [];
  cats = CATEGORIES;
  zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];
  f: any = { calendar_slug: '', is_public: true, title: '', starts_at: '', ends_at: '', city: '', category: 'running', time_zone: 'UTC', description: '', capacity: 20, waitlist_enabled: true };
  working = false;
  calError = ''; titleError = ''; timeError = '';
  isGuest = false;
  private api = inject(Api);
  private auth = inject(AuthService);
  private router = inject(Router);
  private notice = inject(NoticeService);

  get swatch() {
    const hue = CATEGORIES.find(c => c.slug === this.f.category)?.hue ?? '#146aeb';
    return `linear-gradient(135deg, ${hue}, #d69712)`;
  }

  ngOnInit() {
    this.auth.account$.subscribe(a => (this.isGuest = a?.role === 'guest'));
    this.api.myCalendars().subscribe(c => {
      this.cals = c;
      if (c.length) this.f.calendar_slug = c[0].slug;
    });
  }

  async submit() {
    this.calError = this.titleError = this.timeError = '';
    if (!this.f.calendar_slug) { this.calError = 'Pick one of your calendars.'; return; }
    if (!this.f.title.trim()) { this.titleError = 'Add a name so guests know what they are joining.'; return; }
    const starts = this.f.starts_at ? new Date(this.f.starts_at + 'Z').toISOString() : undefined;
    const ends = this.f.ends_at ? new Date(this.f.ends_at + 'Z').toISOString() : undefined;
    if (starts && ends && ends <= starts) { this.timeError = 'The end time has to come after the start time.'; return; }
    this.working = true;
    try {
      const ev = await this.api.pr(this.api.createEvent({
        calendar_slug: this.f.calendar_slug, title: this.f.title.trim(), category: this.f.category,
        city: this.f.city, time_zone: this.f.time_zone, starts_at: starts, ends_at: ends,
        capacity: Number(this.f.capacity) || 20, approval_required: false,
        waitlist_enabled: !!this.f.waitlist_enabled, description: this.f.description,
      }));
      this.notice.polite('Event created.', 'success');
      this.router.navigate(['/event', ev.slug, 'manage', 'overview']);
    } catch (e: any) {
      this.notice.show(e?.message ?? 'That did not go through.', 'danger');
    } finally { this.working = false; }
  }
}

/** Manage shell: dashboard, guests, registration settings. */
@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, IconDirective, StatusPillComponent, NotFoundComponent],
  template: `
    @if (denied) { <app-not-found /> } @else if (event) {
      <div class="head">
        <h1 class="screen-title">{{ event!.title }}</h1>
        <app-status [status]="event!.state" />
      </div>
      <div class="addr card">
        <span class="mono addr-text">{{ address }}</span>
        <button type="button" class="btn btn-secondary btn-small" (click)="copy()">Copy Link</button>
      </div>
      @if (event!.state === 'cancelled') {
        <div class="cancelled card"><p class="overline">Cancelled</p><p class="reason">{{ event!.cancel_reason }}</p></div>
      } @else {
        <div class="counters">
          <div class="counter"><span class="overline">Confirmed</span><span class="num">{{ confirmed }} / {{ event!.capacity }}</span></div>
          <div class="counter"><span class="overline">Waiting</span><span class="num">{{ waiting }}</span></div>
          <div class="counter"><span class="overline">Awaiting approval</span><span class="num">{{ pending }}</span></div>
          <div class="counter"><span class="overline">Arrived</span><span class="num">{{ arrived }}</span></div>
        </div>
        <ul class="todo">
          @if (pending > 0) { <li><a [routerLink]="['/event', slug, 'manage', 'guests']">Approve {{ pending }} waiting request{{ pending === 1 ? '' : 's' }}</a></li> }
          @if (waiting > 0) { <li>{{ waiting }} on the waiting list. Raise capacity to seat them.</li> }
          <li><a [routerLink]="['/event', slug, 'manage', 'guests']">Work the guest list and the door</a></li>
          <li><a [routerLink]="['/event', slug, 'manage', 'registration']">Change capacity, approval or registration</a></li>
        </ul>
      }
    } @else {
      <div class="skeleton" style="height:120px"></div>
    }
  `,
  styles: [`
    .head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .addr { margin: 16px 0; padding: 12px 16px; display: flex; align-items: center; gap: 12px; }
    .addr-text { font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .counters { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin: 24px 0; }
    .counter { display: flex; flex-direction: column; gap: 4px; padding: 20px; border: 1px solid var(--divider); border-radius: 12px; }
    .num { font-size: 22px; line-height: 26px; font-weight: 700; }
    .todo { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; font-size: 15px; line-height: 22px; }
    .cancelled { padding: 20px; display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .reason { font-size: 16px; line-height: 24px; font-style: italic; }
    @media (max-width: 649px) { .counters { grid-template-columns: repeat(2,1fr); } }
  `],
})
export class ManageOverviewComponent implements OnInit {
  event: EventItem | null = null;
  denied = false;
  slug = '';
  confirmed = 0; waiting = 0; pending = 0; arrived = 0;
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private notice = inject(NoticeService);
  get address() { return `${location.origin}/${this.slug}`; }
  ngOnInit() {
    this.slug = this.route.parent?.snapshot.paramMap.get('slug') ?? this.route.snapshot.paramMap.get('slug') ?? '';
    this.api.getEvent(this.slug).subscribe(e => {
      this.event = e;
      this.confirmed = e.confirmed_count ?? 0;
    }, () => (this.denied = true));
    this.api.eventRegistrations(this.slug).subscribe(rs => {
      this.waiting = rs.filter(r => r.status === 'waitlisted').length;
      this.pending = rs.filter(r => r.status === 'pending_approval').length;
      this.arrived = rs.filter(r => r.status === 'checked_in').length;
      this.confirmed = rs.filter(r => r.status === 'confirmed' || r.status === 'checked_in').length;
    }, () => {});
  }
  async copy() {
    try { await navigator.clipboard.writeText(this.address); this.notice.polite('Link copied.', 'success'); }
    catch { this.notice.show('Copy it from the address line instead.', 'info'); }
  }
}

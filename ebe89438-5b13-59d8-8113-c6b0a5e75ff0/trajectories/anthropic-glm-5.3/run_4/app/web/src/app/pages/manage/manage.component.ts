import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService, type EventItem, type Registration } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { stateLabel, statusLabel, statusTone } from '../../core/visuals';
import { NotFoundComponent } from '../not-found/not-found.component';
import { STAR_PATH } from '../../core/visuals';
import { eventWhen, eventZoneTag } from '../../core/time';

@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NotFoundComponent],
  template: `
    @if (denied()) {
      <app-not-found />
    } @else {
      @if (event(); as ev) {
      <div class="manage">
        <aside class="rail" aria-label="Manage">
          <a class="brand" routerLink="/" aria-label="Gatherline home">
            <svg width="22" height="22" viewBox="0 0 133 134" aria-hidden="true"><path [attr.d]="star" fill="currentColor"/></svg>
            <span class="word">Gatherline</span>
          </a>
          <nav class="nav" aria-label="Event management">
            <a routerLink="/home" class="nav-item">Home</a>
            <a routerLink="/calendars" class="nav-item">Calendars</a>
            <a routerLink="/create" class="nav-item">Create</a>
            <a routerLink="/discover" class="nav-item">Discover</a>
            <a routerLink="/settings/profile" class="nav-item">Settings</a>
            <span class="nav-sep"></span>
            <a [routerLink]="['/event', slug, 'manage', 'overview']" class="nav-item" [class.current]="tab() === 'overview'">Overview</a>
            <a [routerLink]="['/event', slug, 'manage', 'guests']" class="nav-item" [class.current]="tab() === 'guests'">Guests</a>
            <a [routerLink]="['/event', slug, 'manage', 'registration']" class="nav-item" [class.current]="tab() === 'registration'">Registration</a>
          </nav>
          <div class="account">
            <span class="avatar">{{ initial }}</span>
            <div class="who"><span class="caption name">{{ account()?.display_name }}</span>
            <button class="caption out" (click)="logout()">Sign out</button></div>
          </div>
        </aside>

        <div class="content">
          @switch (tab()) {
            @case ('overview') {
              <header class="mast">
                <h1 class="screen-title">{{ ev.title }}</h1>
                <span class="pill with-dot" [class]="'pill with-dot tone-' + stateTone(ev)">{{ stateLabel(ev.state) }}</span>
                <div class="addr">
                  <code>{{ origin }}/{{ ev.slug }}</code>
                  <button class="btn-text" (click)="copyLink()">Copy Link</button>
                </div>
              </header>

              @if (ev.state === 'cancelled') {
                <div class="notice">
                  <h2 class="overline">Cancelled</h2>
                  <p class="reason">“{{ ev.cancel_reason }}”</p>
                  <p class="caption">Every guest still holding a place was mailed your words.</p>
                </div>
              } @else {
                <div class="counters">
                  <div class="counter"><span class="n">{{ confirmed() }}</span><span class="overline l">Confirmed of {{ ev.capacity }}</span></div>
                  <div class="counter"><span class="n">{{ waiting() }}</span><span class="overline l">Waiting</span></div>
                  <div class="counter"><span class="n">{{ pending() }}</span><span class="overline l">Awaiting approval</span></div>
                  <div class="counter"><span class="n">{{ arrived() }}</span><span class="overline l">Arrived</span></div>
                </div>

                <section class="todo">
                  <h2 class="overline">Next things to do</h2>
                  <ol class="list">
                    @if (pending() > 0) { <li><a [routerLink]="['/event', slug, 'manage', 'guests']">{{ pending() }} request{{ pending() === 1 ? '' : 's' }} waiting for your decision</a></li> }
                    @if (ev.state === 'draft') { <li><a [routerLink]="['/event', slug, 'manage', 'registration']">Finish the details and publish</a></li> }
                    @if (ev.state === 'published' && ev.approval_required) { <li><a [routerLink]="['/event', slug, 'manage', 'registration']">Review the approval settings</a></li> }
                    @if (waiting() > 0) { <li><a [routerLink]="['/event', slug, 'manage', 'registration']">{{ waiting() }} on the waiting list — raise capacity to seat them</a></li> }
                    @if (arrived() < confirmed() && ev.state !== 'draft') { <li><a [routerLink]="['/event', slug, 'manage', 'guests']">Check tickets in at the door</a></li> }
                    @if (todoList().length === 0) { <li class="caption">Nothing needs you right now.</li> }
                  </ol>
                </section>
              }

              <nav class="links">
                <a class="btn btn-secondary" [routerLink]="['/event', slug, 'manage', 'guests']">Guests, queue and door</a>
                <a class="btn btn-secondary" [routerLink]="['/event', slug, 'manage', 'registration']">Capacity and approval</a>
                @if (ev.state !== 'cancelled' && ev.state !== 'draft') {
                  <button class="btn btn-danger" (click)="askCancel()">Cancel Event</button>
                }
              </nav>
            }

            @case ('guests') {
              <header class="mast">
                <h1 class="screen-title">Guests</h1>
                <span class="caption">{{ ev.title }} · {{ when(ev) }}</span>
              </header>

              @if (queue().length > 0) {
                <section class="panel-block">
                  <h2 class="overline">Approval queue</h2>
                  <ul class="rows">
                    @for (r of queue(); track r.id) {
                      <li class="row">
                        <div class="who"><span class="name">{{ r.display_name }}</span><span class="caption">{{ r.email }}</span></div>
                        <div class="acts">
                          <button class="btn btn-secondary btn-sm" (click)="approve(r)" [disabled]="busy()">Approve</button>
                          <button class="btn-text danger" (click)="decline(r)" [disabled]="busy()">Decline</button>
                        </div>
                      </li>
                    }
                  </ul>
                </section>
              }

              <section class="panel-block">
                <div class="toolbar">
                  <h2 class="overline">Guest list</h2>
                  <div class="tools">
                    <label class="sr-only" for="status-filter">Filter by status</label>
                    <select id="status-filter" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)">
                      <option value="">All statuses</option>
                      @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                    </select>
                    <a class="btn btn-secondary btn-sm" [href]="csvUrl()" download>Export CSV</a>
                  </div>
                </div>

                @if (guests().length === 0) {
                  <div class="empty-state">
                    <h2>No Guests Yet</h2>
                    <p>Share your event link and registrations will appear here.</p>
                    <button class="btn btn-secondary" (click)="copyLink()">Copy Link</button>
                  </div>
                } @else {
                  <div class="table-wrap">
                    <table class="table">
                      <thead><tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Position</th><th scope="col">Ticket</th></tr></thead>
                      <tbody>
                        @for (g of filteredGuests(); track g.id) {
                          <tr>
                            <td>{{ g.display_name }}</td>
                            <td class="email">{{ g.email }}</td>
                            <td><span class="pill with-dot" [class]="'pill with-dot tone-' + statusTone(g.status)">{{ statusLabel(g.status) }}</span></td>
                            <td>{{ g.waitlist_position ?? '' }}</td>
                            <td><code class="mini">{{ g.ticket_code ?? '' }}</code></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="cards">
                    @for (g of filteredGuests(); track g.id) {
                      <div class="gcard card">
                        <span class="kv"><span class="k">Guest</span><span>{{ g.display_name }}</span></span>
                        <span class="kv"><span class="k">Email</span><span>{{ g.email }}</span></span>
                        <span class="kv"><span class="k">Status</span><span class="pill with-dot" [class]="'pill with-dot tone-' + statusTone(g.status)">{{ statusLabel(g.status) }}</span></span>
                        <span class="kv"><span class="k">Position</span><span>{{ g.waitlist_position ?? '—' }}</span></span>
                        <span class="kv"><span class="k">Ticket</span><span><code class="mini">{{ g.ticket_code ?? '—' }}</code></span></span>
                      </div>
                    }
                  </div>
                }
              </section>

              <section class="panel-block">
                <h2 class="overline">The door</h2>
                <form class="door" (submit)="checkIn($event)">
                  <label class="sr-only" for="door-code">Ticket code</label>
                  <input id="door-code" type="text" placeholder="TKT-" [value]="doorCode()" (input)="doorCode.set($any($event.target).value)" />
                  <button class="btn btn-primary" type="submit" [disabled]="busy()">
                    @if (busy()) { <span class="spinner"></span> } Check In
                  </button>
                </form>
                <p class="caption door-answer" aria-live="polite">{{ doorAnswer() }}</p>
              </section>
            }

            @case ('registration') {
              <header class="mast">
                <h1 class="screen-title">Registration</h1>
                <span class="caption">{{ ev.title }}</span>
              </header>

              <section class="settings">
                <div class="setting">
                  <div class="labels"><span class="l">Capacity</span></div>
                  <div class="step-wrap">
                    <button class="btn btn-secondary btn-sm" (click)="bump(-1)" aria-label="Lower capacity">−</button>
                    <span class="value">{{ ev.capacity }}</span>
                    <button class="btn btn-secondary btn-sm" (click)="bump(1)" aria-label="Raise capacity">+</button>
                  </div>
                  <span class="caption cap-note" aria-live="polite">{{ capNote() }}</span>
                </div>

                <div class="setting">
                  <div class="labels"><span class="l">Approval required</span><span class="caption">Requests wait for your decision</span></div>
                  <button class="switch" role="switch" [attr.aria-checked]="ev.approval_required" aria-label="Approval required" (click)="toggleApproval()"></button>
                </div>

                <div class="setting">
                  <div class="labels"><span class="l">Waiting list</span><span class="caption">Full events take a queue</span></div>
                  <button class="switch" role="switch" [attr.aria-checked]="ev.waitlist_enabled" aria-label="Waiting list" (click)="toggleWaitlist()"></button>
                </div>

                <div class="setting">
                  <div class="labels"><span class="l">Registration Open</span><span class="caption">Off means the public panel reads closed</span></div>
                  <button class="switch" role="switch" [attr.aria-checked]="ev.state === 'published'" aria-label="Registration open" (click)="toggleRegistration()"></button>
                </div>

                @if (promotedNote()) {
                  <p class="caption promoted" role="status" aria-live="polite">{{ promotedNote() }}</p>
                }
              </section>
            }
          }
        </div>
      </div>
      } @else {
        <div class="page" aria-busy="true">
          <div class="skeleton" style="height:32px;width:40%"></div>
          <div class="skeleton" style="height:80px;margin-top:16px"></div>
          <div class="skeleton" style="height:200px;margin-top:16px"></div>
        </div>
      }
    }

    @if (cancelOpen()) {
      <div class="scrim" (click)="cancelOpen.set(false)" role="dialog" aria-modal="true" aria-labelledby="cx-h">
        <div class="dialog" (click)="$event.stopPropagation()">
          <h2 id="cx-h">Cancel this event?</h2>
          <p class="body">Every guest still holding a place is mailed, carrying your reason word for word. This cannot be undone.</p>
          <div class="field">
            <label for="cx-reason">Reason</label>
            <textarea id="cx-reason" [(ngModel)]="cancelReason" placeholder="Tell the guests why"></textarea>
          </div>
          <div class="row">
            <button class="btn btn-secondary" (click)="cancelOpen.set(false)">Keep the event</button>
            <button class="btn btn-danger" [disabled]="!cancelReason().trim() || busy()" (click)="confirmCancel()">
              @if (busy()) { <span class="spinner"></span> } Cancel Event
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .manage { display: grid; grid-template-columns: 260px minmax(0, 860px); gap: 32px; padding: 24px; max-width: 1160px; margin: 0 auto; }
    .rail { position: sticky; top: 24px; align-self: start; display: flex; flex-direction: column; gap: 20px; min-height: 60vh; }
    .nav { display: flex; flex-direction: column; gap: 2px; }
    .nav-item { padding: 10px 12px; border-radius: var(--r-nav); font-size: 14px; line-height: 20px; color: var(--ink-64); min-height: 44px; display: flex; align-items: center; }
    .nav-item:hover { background: var(--ink-04); color: var(--ink); }
    .nav-item.current { background: var(--ink); color: var(--paper); }
    .nav-sep { height: 1px; background: var(--divider); margin: 8px 0; }
    .account { margin-top: auto; display: flex; gap: 10px; align-items: center; }
    .avatar { width: 32px; height: 32px; border-radius: 100%; background: var(--ink-08); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }
    .who { display: flex; flex-direction: column; }
    .name { font-weight: 500; }
    .out { color: var(--muted); text-align: left; }
    .content { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
    .mast { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .addr { display: flex; align-items: center; gap: 8px; width: 100%; }
    .addr code { font-family: ui-monospace, monospace; font-size: 13px; color: var(--muted); }
    .counters { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .counter { display: flex; flex-direction: column; gap: 4px; }
    .counter .n { font-size: 22px; line-height: 26px; font-weight: 700; }
    .counter .l { color: var(--muted); }
    .todo .list { display: flex; flex-direction: column; gap: 8px; }
    .todo a { color: var(--link-blue); }
    .links { display: flex; gap: 12px; flex-wrap: wrap; }
    .notice { border-left: 4px solid var(--danger); background: var(--inset); border-radius: var(--r-card); padding: 16px 20px; display: flex; flex-direction: column; gap: 6px; }
    .reason { font-size: 18px; line-height: 26px; font-style: italic; }
    .panel-block { display: flex; flex-direction: column; gap: 10px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .tools { display: flex; gap: 8px; align-items: center; }
    .tools select { min-height: 44px; padding: 8px 12px; border-radius: var(--r-input); border: 1px solid var(--ink-08); background: var(--paper); }
    .rows { display: flex; flex-direction: column; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--divider); }
    .who { display: flex; flex-direction: column; }
    .acts { display: flex; gap: 8px; align-items: center; }
    .danger { color: #a31710; }
    .table-wrap { overflow-x: auto; }
    .email { color: var(--muted); }
    .mini { font-family: ui-monospace, monospace; font-size: 12px; }
    .cards { display: none; }
    .door { display: flex; gap: 8px; }
    .door input { flex: 1; min-height: 44px; padding: 10px 14px; border-radius: var(--r-input); border: 1px solid var(--ink-08); font-family: ui-monospace, monospace; }
    .door-answer { color: var(--muted); min-height: 18px; }
    .settings { display: flex; flex-direction: column; gap: 12px; }
    .setting { border: 1px solid var(--ink-08); border-radius: var(--r-card); padding: 14px 16px; display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; align-items: center; }
    .labels { display: flex; flex-direction: column; gap: 2px; }
    .labels .l { font-size: 16px; line-height: 24px; }
    .step-wrap { display: flex; align-items: center; gap: 12px; }
    .value { font-size: 18px; line-height: 24px; font-weight: 600; min-width: 40px; text-align: center; }
    .cap-note { grid-column: 1 / -1; color: var(--muted); }
    .promoted { color: #0a7a24; }
    .body { color: var(--muted); font-size: 14px; line-height: 21px; }
    @media (max-width: 1000px) {
      .manage { grid-template-columns: 1fr; }
      .rail { position: static; min-height: 0; flex-direction: row; align-items: center; overflow-x: auto; }
      .nav { flex-direction: row; }
      .nav-sep { width: 1px; height: auto; margin: 0 8px; }
      .account { margin-top: 0; margin-left: auto; }
      .who { display: none; }
    }
    @media (max-width: 650px) { .table-wrap { display: none; } .cards { display: grid; gap: 12px; } }
    @media (min-width: 651px) { .cards { display: none; } }
    @media (max-width: 484px) { .counters { grid-template-columns: 1fr 1fr; } }
    .gcard { padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .kv { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .k { font-size: 11px; line-height: 16px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
  `],
})
export class ManageComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toasts = inject(ToastService);

  star = STAR_PATH;

  slug = '';
  event = signal<EventItem | null>(null);
  guests = signal<Registration[]>([]);
  denied = signal(false);
  busy = signal(false);
  statusFilter = signal('');
  doorCode = signal('');
  doorAnswer = signal('');
  promotedNote = signal('');
  cancelOpen = signal(false);
  cancelReason = signal('');
  origin = window.location.origin;
  statuses = ['pending_approval', 'confirmed', 'waitlisted', 'checked_in', 'declined', 'cancelled_by_guest', 'cancelled_by_host'];

  account = this.auth.account;
  tab = signal('overview');

  queue = computed(() => this.guests().filter((g) => g.status === 'pending_approval'));
  filteredGuests = computed(() => {
    const f = this.statusFilter();
    return f ? this.guests().filter((g) => g.status === f) : this.guests();
  });
  confirmed = computed(() => this.guests().filter((g) => g.status === 'confirmed' || g.status === 'checked_in').length);
  arrived = computed(() => this.guests().filter((g) => g.status === 'checked_in').length);
  waiting = computed(() => this.guests().filter((g) => g.status === 'waitlisted').length);
  pending = computed(() => this.queue().length);
  capNote = computed(() => `You already have ${this.confirmed()} guests confirmed.`);
  todoList = computed(() => []);
  get initial(): string { return (this.account()?.display_name ?? '?').slice(0, 1).toUpperCase(); }

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      this.slug = params.get('slug') ?? '';
      this.tab.set(params.get('tab') ?? 'overview');
      await this.load();
    });
  }

  async load(): Promise<void> {
    await this.auth.whenAccount();
    const ev = await this.api.getEvent(this.slug);
    const acc = this.auth.account();
    if (!ev || !acc || acc.role !== 'host' || !ev.calendar || ev.calendar.owner_account_id !== acc.id) {
      this.denied.set(true);
      return;
    }
    this.event.set(ev);
    const list = await this.api.guestList(this.slug);
    this.guests.set(list ?? []);
  }

  copyLink(): void {
    const url = `${this.origin}/${this.slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toasts.show('Link copied.', 'success'),
      () => this.toasts.show('Copy this address: ' + url, 'info'),
    );
  }

  csvUrl(): string { return `/api/events/${this.slug}/registrations.csv`; }

  async approve(r: Registration): Promise<void> {
    this.busy.set(true);
    const res = await this.api.approve(r.id);
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    await this.load();
    this.toasts.show('Request approved. The guest is mailed.', 'success');
  }

  async decline(r: Registration): Promise<void> {
    this.busy.set(true);
    const res = await this.api.decline(r.id);
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    await this.load();
    this.toasts.show('Request declined. The guest is mailed.', 'info');
  }

  async checkIn(e: Event): Promise<void> {
    e.preventDefault();
    const code = this.doorCode().trim().toUpperCase();
    if (!code) return;
    this.busy.set(true);
    const res = await this.api.checkIn(code);
    this.busy.set(false);
    if (!res.ok) {
      this.doorAnswer.set(res.error?.message ?? 'That code did not work.');
      return;
    }
    if ((res.registration as any)?.already_checked_in) {
      this.doorAnswer.set(`Already arrived at ${new Date((res.registration as any).checked_in_at).toUTCString()}.`);
    } else {
      this.doorAnswer.set('Arrival recorded.');
      this.toasts.show('Ticket checked in.', 'success');
    }
    this.doorCode.set('');
    await this.load();
  }

  async bump(delta: number): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    const next = ev.capacity + delta;
    if (next < 1 || next > 500) return;
    this.busy.set(true);
    this.promotedNote.set('');
    const res = await this.api.patchEvent(this.slug, { capacity: next });
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    const moved = (res.event as any)?.promoted_from_waitlist;
    await this.load();
    if (moved > 0) this.promotedNote.set(`${moved} ${moved === 1 ? 'person was' : 'people were'} moved from the waiting list to a seat.`);
  }

  async toggleApproval(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.busy.set(true);
    const res = await this.api.patchEvent(this.slug, { approval_required: !ev.approval_required });
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    await this.load();
  }

  async toggleWaitlist(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.busy.set(true);
    const res = await this.api.patchEvent(this.slug, { waitlist_enabled: !ev.waitlist_enabled });
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    await this.load();
  }

  async toggleRegistration(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    const target = ev.state === 'published' ? 'registration_closed' : 'published';
    this.busy.set(true);
    const res = await this.api.patchEvent(this.slug, { state: target });
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    await this.load();
    this.toasts.show(target === 'registration_closed' ? 'Registration is closed.' : 'Registration is open again.', 'info');
  }

  askCancel(): void { this.cancelOpen.set(true); }

  async confirmCancel(): Promise<void> {
    this.busy.set(true);
    const res = await this.api.cancelEvent(this.slug, this.cancelReason().trim());
    this.busy.set(false);
    if (!res.ok) { this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger'); return; }
    this.cancelOpen.set(false);
    await this.load();
    this.toasts.show('Event cancelled. Every guest holding a place is mailed.', 'info');
  }

  logout(): void { this.auth.logout(); }

  when(ev: EventItem): string { return `${eventWhen(ev.starts_at, ev.time_zone)} (${eventZoneTag(ev.starts_at, ev.time_zone)})`; }
  stateTone(ev: EventItem): string {
    switch (ev.state) {
      case 'published': return 'success';
      case 'registration_closed': return 'warning';
      case 'cancelled': return 'danger';
      default: return 'info';
    }
  }
  stateLabel = stateLabel;
  statusLabel = statusLabel;
  statusTone = statusTone;
}

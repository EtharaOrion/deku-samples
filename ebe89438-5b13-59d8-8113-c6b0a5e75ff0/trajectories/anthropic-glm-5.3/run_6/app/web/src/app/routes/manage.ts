import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError, EventRecord, Registration } from '../api.service';
import { NoticeService } from '../notice.service';
import { AppShellComponent, DialogComponent } from '../shell';
import { StatusPillComponent } from '../widgets';
import { inZone, timeInZone, STATUS_LABELS, shortDate } from '../shared';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-manage', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AppShellComponent, StatusPillComponent, DialogComponent, NotFoundComponent],
  template: `
    @if (!allowed()) {
      <route-not-found></route-not-found>
    } @else {
      <app-shell>
        @if (loading()) {
          <div class="stack gap-16">
            <div class="skeleton" style="height:40px;width:50%"></div>
            <div class="skeleton" style="height:20px;width:30%"></div>
            <div class="skeleton" style="height:120px"></div>
          </div>
        } @else if (ev()) {
          <header class="stack gap-12">
            <div class="spread wrap">
              <div class="stack gap-4">
                <h1 class="t-screen">{{ ev()!.title }}</h1>
                <div class="row gap-8">
                  <status-pill [status]="ev()!.state"></status-pill>
                  <span class="t-caption">{{ whenOf() }}</span>
                </div>
              </div>
              <nav class="row gap-8" aria-label="Manage">
                <a class="nav-tab" [routerLink]="['/event', ev()!.slug, 'manage', 'overview']" routerLinkActive="active">Overview</a>
                <a class="nav-tab" [routerLink]="['/event', ev()!.slug, 'manage', 'guests']" routerLinkActive="active">Guests</a>
                <a class="nav-tab" [routerLink]="['/event', ev()!.slug, 'manage', 'registration']" routerLinkActive="active">Registration</a>
              </nav>
            </div>
            <div class="row gap-8">
              <span class="t-caption address" id="ev-address">{{ address() }}</span>
              <button type="button" class="btn btn-sm btn-ghost" (click)="copyAddress()">Copy Link</button>
              <a class="btn btn-sm btn-ghost" [routerLink]="['/' + ev()!.slug]">View public page</a>
            </div>
          </header>

          @switch (tab()) {
            @case ('overview') {
              @if (ev()!.state === 'cancelled') {
                <section class="card notice-card">
                  <h2 class="t-h-long">This event was called off</h2>
                  <p class="t-para">{{ ev()!.cancel_reason }}</p>
                </section>
              } @else {
                <section aria-label="Counters">
                  <div class="counters">
                    <div class="counter"><span class="count">{{ ev()!.confirmed_count }}/{{ ev()!.capacity }}</span><span class="t-overline">Confirmed</span></div>
                    <div class="counter"><span class="count">{{ waiting() }}</span><span class="t-overline">Waiting</span></div>
                    <div class="counter"><span class="count">{{ pending() }}</span><span class="t-overline">Awaiting approval</span></div>
                    <div class="counter"><span class="count">{{ arrived() }}</span><span class="t-overline">Arrived</span></div>
                  </div>
                </section>
                <section class="card todo-card" aria-label="Next things to do">
                  <h2 class="t-h-long">Next three things</h2>
                  <ol class="todos">
                    @for (t of todos(); track $index) { <li class="t-body">{{ t }}</li> }
                  </ol>
                  <div class="row gap-8">
                    <a class="btn btn-sm btn-secondary" [routerLink]="['/event', ev()!.slug, 'manage', 'guests']">Work the guest list</a>
                    <a class="btn btn-sm btn-secondary" [routerLink]="['/event', ev()!.slug, 'manage', 'registration']">Registration settings</a>
                  </div>
                </section>
              }
            }
            @case ('guests') {
              @if (pendingRows().length) {
                <section class="card panel-card" aria-label="Approval queue">
                  <h2 class="t-h-long">Requests waiting for you</h2>
                  <ul class="queue">
                    @for (r of pendingRows(); track r.id) {
                      <li class="spread">
                        <div class="stack gap-4">
                          <span class="t-row">{{ r.display_name }}</span>
                          <span class="t-caption">{{ r.email }}</span>
                        </div>
                        <div class="row gap-8">
                          <button type="button" class="btn btn-sm btn-primary" (click)="act(r, 'approve')" [disabled]="busyId() === r.id">Approve</button>
                          <button type="button" class="btn btn-sm btn-danger" (click)="act(r, 'decline')" [disabled]="busyId() === r.id">Decline</button>
                        </div>
                      </li>
                    }
                  </ul>
                </section>
              }

              <section class="card panel-card" aria-label="Guest list">
                <div class="spread wrap">
                  <h2 class="t-h-long">Guests</h2>
                  <div class="row gap-8">
                    <label class="sr-only" for="status-filter">Filter by status</label>
                    <select id="status-filter" [ngModel]="filter()" (ngModelChange)="filter.set($event)" name="filter">
                      <option value="">All statuses</option>
                      @for (s of statusList; track s) { <option [value]="s">{{ labelOf(s) }}</option> }
                    </select>
                    <a class="btn btn-sm btn-secondary" [href]="csvHref()" [download]="ev()!.slug + '.csv'">Export CSV</a>
                  </div>
                </div>
                @if (regs().length === 0) {
                  <div class="empty-inline">
                    <h3 class="t-h-long">No Guests Yet</h3>
                    <p class="t-para">Share your event link and registrations will appear here.</p>
                    <button type="button" class="btn btn-secondary" (click)="copyAddress()">Copy Link</button>
                  </div>
                } @else {
                  <div class="table-wrap">
                    <table class="data">
                      <thead><tr>
                        <th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th>
                        <th scope="col">Waiting list</th><th scope="col">Ticket</th>
                      </tr></thead>
                      <tbody>
                        @for (r of shownRows(); track r.id) {
                          <tr>
                            <td>{{ r.display_name }}</td>
                            <td class="email-cell">{{ r.email }}</td>
                            <td><status-pill [status]="r.status"></status-pill></td>
                            <td>@if (r.waitlist_position) { {{ r.waitlist_position }} }</td>
                            <td>@if (r.ticket_code) { <a class="code link" [routerLink]="['/t', r.ticket_code]">{{ r.ticket_code }}</a> }</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (shownRows().length < filtered().length) {
                    <button type="button" class="btn btn-ghost" (click)="pageSize.set(pageSize() + 40)">Show more guests</button>
                  }
                }
              </section>

              <section class="card panel-card" aria-label="The door">
                <h2 class="t-h-long">The door</h2>
                <form class="row gap-8" (submit)="checkIn($event)">
                  <label class="sr-only" for="door-code">Ticket code</label>
                  <input id="door-code" placeholder="TKT-" [(ngModel)]="door" name="door" class="door-input"
                         autocomplete="off" [attr.aria-describedby]="'door-answer'">
                  <button class="btn btn-primary" type="submit" [disabled]="doorBusy()">Check In</button>
                </form>
                <p class="t-body" id="door-answer" role="status" aria-live="polite">{{ doorAnswer() }}</p>
              </section>
            }
            @case ('registration') {
              <section class="card panel-card" aria-label="Registration settings">
                <h2 class="t-h-long">Capacity and approval</h2>

                <div class="setting">
                  <div class="setting-copy">
                    <span>Capacity</span>
                    @if (capNotice()) { <span class="field-hint">{{ capNotice() }}</span> }
                    @else { <span class="field-hint">Between 1 and 500 seats.</span> }
                  </div>
                  <div class="stepper">
                    <button type="button" (click)="setCapacity(ev()!.capacity - 1)" aria-label="Fewer seats">−</button>
                    <span class="value" aria-live="polite">{{ ev()!.capacity }}</span>
                    <button type="button" (click)="setCapacity(ev()!.capacity + 1)" aria-label="More seats">+</button>
                  </div>
                </div>

                <div class="setting">
                  <div class="setting-copy"><span>Approval required</span>
                    <span class="field-hint">Every new registration waits for you.</span></div>
                  <label class="row switch-line">
                    <input type="checkbox" class="sr-only" role="switch" [attr.aria-checked]="ev()!.approval_required"
                           [ngModel]="ev()!.approval_required" (ngModelChange)="setFlag('approval_required', $event)" name="approval">
                    <span class="switch" [attr.aria-checked]="ev()!.approval_required"></span>
                  </label>
                </div>

                <div class="setting">
                  <div class="setting-copy"><span>Waiting list</span>
                    <span class="field-hint">Guests queue in order when the event fills.</span></div>
                  <label class="row switch-line">
                    <input type="checkbox" class="sr-only" role="switch" [attr.aria-checked]="ev()!.waitlist_enabled"
                           [ngModel]="ev()!.waitlist_enabled" (ngModelChange)="setFlag('waitlist_enabled', $event)" name="waitlist">
                    <span class="switch" [attr.aria-checked]="ev()!.waitlist_enabled"></span>
                  </label>
                </div>

                <div class="setting">
                  <div class="setting-copy"><span>Registration Open</span>
                    <span class="field-hint">Turning it off closes registration to new guests. Guests already holding a place keep it.</span></div>
                  <label class="row switch-line">
                    <input type="checkbox" class="sr-only" role="switch" [attr.aria-checked]="ev()!.state === 'published'"
                           [ngModel]="ev()!.state === 'published'" (ngModelChange)="setRegistrationOpen($event)" name="open">
                    <span class="switch" [attr.aria-checked]="ev()!.state === 'published'"></span>
                  </label>
                </div>

                @if (ev()!.state !== 'cancelled') {
                  <div class="setting">
                    <div class="setting-copy"><span>Cancel this event</span>
                      <span class="field-hint">Every guest still holding a place is emailed your reason. This cannot be undone.</span></div>
                    <button type="button" class="btn btn-sm btn-danger" (click)="cancelOpen.set(true)">Cancel Event</button>
                  </div>
                }
              </section>
            }
          }
        }
      </app-shell>

      @if (cancelOpen()) {
        <cc-dialog title="Cancel this event?" (closed)="cancelOpen.set(false)">
          <p class="t-body">Every guest still holding a place receives your reason word for word. The page keeps its address.</p>
          <div class="field" [class.invalid]="!!cancelErr()">
            <label for="cancel-reason">Reason</label>
            <input id="cancel-reason" [(ngModel)]="cancelReason" name="reason" placeholder="Tell your guests what happened">
            @if (cancelErr()) { <p class="field-error">{{ cancelErr() }}</p> }
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-primary" (click)="cancelOpen.set(false)">Keep the event</button>
            <button type="button" class="btn btn-danger" [disabled]="!cancelReason.trim()" (click)="doCancel()">Cancel Event</button>
          </div>
        </cc-dialog>
      }
    }
  `,
  styles: [`
    :host{display:block}
    .wrap{flex-wrap:wrap}
    .nav-tab{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:6px;color:var(--ink-2);font-size:15px;line-height:22px}
    .nav-tab.active{background:var(--fill);color:var(--ink);font-weight:600}
    .address{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .counters{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
    .counter{display:flex;flex-direction:column;gap:4px;padding:20px;border:1px solid var(--hairline);border-radius:12px}
    .count{font-size:22px;line-height:26px;font-weight:700}
    .todo-card,.notice-card,.panel-card{padding:24px;display:flex;flex-direction:column;gap:16px}
    .todos{padding-left:20px;list-style:decimal;display:flex;flex-direction:column;gap:8px}
    .todos li::marker{color:var(--ink-3)}
    .queue{display:flex;flex-direction:column;gap:12px}
    .queue li{padding-bottom:12px;border-bottom:1px solid var(--divider)}
    .queue li:last-child{border-bottom:0;padding-bottom:0}
    .empty-inline{display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:16px 0}
    .door-input{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-width:200px}
    .setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-top:1px solid var(--hairline);flex-wrap:wrap}
    .setting:first-of-type{border-top:0;padding-top:0}
    .setting-copy{display:flex;flex-direction:column;gap:2px;font-size:16px;line-height:24px}
    .switch-line{cursor:pointer;min-height:44px}
    .dialog-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:16px}
    @media (max-width:899px){ .counters{grid-template-columns:repeat(2,1fr)} .email-cell{display:none} }
    @media (max-width:649px){ th:nth-child(2){display:none} }
    @media (max-width:483px){ .table-wrap table{display:block} }
  `],
})
export class ManageComponent implements OnInit {
  slug = input.required<string>();
  api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private notice = inject(NoticeService);

  tab = signal<string>('overview');
  ev = signal<EventRecord | null>(null);
  regs = signal<Registration[]>([]);
  loading = signal(true);
  allowed = signal(true);
  busyId = signal<string | null>(null);
  filter = signal('');
  pageSize = signal(40);
  door = '';
  doorBusy = signal(false);
  doorAnswer = signal('');
  cancelOpen = signal(false);
  cancelReason = '';
  cancelErr = signal('');
  capNotice = signal('');
  statusList = ['pending_approval', 'confirmed', 'waitlisted', 'declined', 'cancelled_by_guest', 'cancelled_by_host', 'checked_in'];
  labelOf = (s: string) => STATUS_LABELS[s] || s;

  pendingRows = computed(() => this.regs().filter(r => r.status === 'pending_approval'));
  waiting = computed(() => this.regs().filter(r => r.status === 'waitlisted').length);
  pending = computed(() => this.pendingRows().length);
  arrived = computed(() => this.regs().filter(r => r.status === 'checked_in').length);
  filtered = computed(() => {
    const f = this.filter();
    const rows = f ? this.regs().filter(r => r.status === f) : this.regs();
    return rows;
  });
  shownRows = computed(() => this.filtered().slice(0, this.pageSize()));
  address = computed(() => location.origin + '/' + (this.ev()?.slug || ''));
  csvHref = computed(() => `/api/events/${this.ev()?.slug || ''}/registrations.csv`);

  todos = computed(() => {
    const e = this.ev();
    if (!e) return [];
    const t: string[] = [];
    if (this.pending() > 0) t.push(`Approve or decline ${this.pending()} request${this.pending() > 1 ? 's' : ''} waiting for you.`);
    if (e.state === 'registration_closed') t.push('Registration is closed. Turn it back on when you want new guests.');
    else t.push('Share the event address so guests can find it.');
    if (this.waiting() > 0) t.push(`${this.waiting()} guest${this.waiting() > 1 ? 's are' : ' is'} waiting for a seat.`);
    if (t.length < 3) t.push('Check tickets in at the door on the night.');
    return t.slice(0, 3);
  });

  whenOf() {
    const e = this.ev();
    if (!e) return '';
    return `${shortDate(e.starts_at, e.time_zone)} · ${timeInZone(e.starts_at, e.time_zone)} · ${e.city}`;
  }

  ngOnInit() {
    this.route.paramMap.subscribe(p => {
      this.tab.set(p.get('tab') || 'overview');
      this.reload();
    });
  }

  async reload() {
    this.loading.set(true);
    this.allowed.set(true);
    try {
      const e = await this.api.get<EventRecord & { is_owner?: boolean }>(`/events/${encodeURIComponent(this.slug())}`);
      const mine = !!e.is_owner && !!this.api.account && this.api.account.role === 'host';
      if (!mine) throw new Error('not permitted');
      this.ev.set(e);
      try {
        const regs = await this.api.get<Registration[]>(`/events/${encodeURIComponent(this.slug())}/registrations`);
        this.regs.set(regs);
      } catch { this.regs.set([]); }
    } catch {
      this.ev.set(null);
      this.allowed.set(false);
    }
    this.loading.set(false);
  }

  copyAddress() {
    const a = this.address();
    navigator.clipboard?.writeText(a).then(
      () => this.notice.say('The address is copied.', 'success'),
      () => this.notice.say(a, 'info'),
    );
  }

  async act(r: Registration, what: 'approve' | 'decline') {
    this.busyId.set(r.id);
    try {
      const updated = await this.api.post<Registration>(`/registrations/${r.id}/${what}`);
      this.notice.say(what === 'approve'
        ? (updated.status === 'waitlisted'
          ? 'The event is full, so this guest took a waiting-list place.'
          : `${r.display_name} is confirmed and has been emailed.`)
        : `${r.display_name} was declined and has been emailed.`, what === 'approve' ? 'success' : 'info');
      await this.reload();
    } catch (e) {
      this.notice.say((e as ApiError).message || 'That did not go through. Try again.', 'danger');
    } finally { this.busyId.set(null); }
  }

  async checkIn(ev: Event) {
    ev.preventDefault();
    const code = this.door.trim().toUpperCase();
    if (!code) return;
    this.doorBusy.set(true); this.doorAnswer.set('');
    try {
      const r = await this.api.post<Registration & { already_checked_in?: boolean }>(`/tickets/${encodeURIComponent(code)}/check-in`);
      if (r.already_checked_in) {
        this.doorAnswer.set(`${code} was already checked in at ${timeInZone(r.checked_in_at || '', this.ev()?.time_zone || 'UTC')}. One arrival only.`);
      } else {
        this.doorAnswer.set(`${code} is checked in. Welcome them in.`);
        this.notice.say(`${code} checked in.`, 'success');
      }
      this.door = '';
      await this.reload();
    } catch (e) {
      this.doorAnswer.set((e as ApiError).message || 'That code did not match a ticket on this event.');
    } finally { this.doorBusy.set(false); }
  }

  async setCapacity(next: number) {
    const e = this.ev();
    if (!e) return;
    if (next < 1 || next > 500) return;
    try {
      const updated = await this.api.patch<EventRecord & { moved_to_seats?: number }>(`/events/${e.slug}`, { capacity: next });
      const moved = (updated as any).moved_to_seats || 0;
      this.capNotice.set(moved > 0
        ? `${moved} guest${moved > 1 ? 's were' : ' was'} moved from the waiting list to a seat.`
        : `You already have ${e.confirmed_count} guests confirmed.`);
      this.notice.say(moved > 0 ? `${moved} waiting guest${moved > 1 ? 's' : ''} moved to a seat.` : 'Capacity updated.', 'success');
      await this.reload();
    } catch (err) {
      this.capNotice.set((err as ApiError).message);
      this.notice.say((err as ApiError).message, 'danger');
    }
  }

  async setFlag(flag: 'approval_required' | 'waitlist_enabled', value: boolean) {
    const e = this.ev();
    if (!e) return;
    try {
      await this.api.patch(`/events/${e.slug}`, { [flag]: value });
      this.notice.say(value ? 'That setting is on.' : 'That setting is off.', 'success');
      await this.reload();
    } catch (err) {
      this.notice.say((err as ApiError).message, 'danger');
    }
  }

  async setRegistrationOpen(open: boolean) {
    const e = this.ev();
    if (!e) return;
    const state = open ? 'published' : 'registration_closed';
    try {
      await this.api.patch(`/events/${e.slug}`, { state });
      this.notice.say(open ? 'Registration is open again.' : 'Registration is closed. Nobody was emailed.', 'info');
      await this.reload();
    } catch (err) {
      this.notice.say((err as ApiError).message, 'danger');
    }
  }

  async doCancel() {
    const e = this.ev();
    if (!e) return;
    const reason = this.cancelReason.trim();
    if (!reason) { this.cancelErr.set('Add a reason so guests know what happened.'); return; }
    try {
      await this.api.post(`/events/${e.slug}/cancel`, { reason });
      this.notice.say('The event is cancelled and every guest holding a place has been emailed.', 'warning');
      this.cancelOpen.set(false);
      await this.reload();
    } catch (err) {
      this.cancelErr.set((err as ApiError).message);
    }
  }
}

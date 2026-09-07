import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Api, Registration } from '../core/api';
import { statusWord } from '../core/tokens';
import { FormsModule } from '@angular/forms';
import { SignedShellComponent } from '../shells/signed-shell';
import { NotFoundComponent } from './not-found';
import { SkeletonComponent } from '../ui/skeleton';

/** The guest list, the approval queue and the door, sharing one table. */
@Component({
  selector: 'app-manage-guests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, SkeletonComponent, NotFoundComponent, FormsModule],
  template: `
    <app-signed-shell>
      @if (loading()) {
        <app-skeleton [count]="3" [height]="56" [art]="40" />
      } @else if (!allowed()) {
        <app-not-found />
      } @else {
        <header class="head">
          <h1>Guests</h1>
          <span class="pill" [attr.data-status]="event()?.state">{{ statusWord(event()?.state ?? '') }}</span>
        </header>

        <section class="panel">
          <h2 class="overline">Waiting for your decision</h2>
          @if (queue().length) {
            <ul class="queue">
              @for (r of queue(); track r.id) {
                <li class="qrow">
                  <div class="who"><span class="nm">{{ r.display_name }}</span><span class="em">{{ r.email }}</span></div>
                  <div class="acts">
                    <button type="button" class="btn btn-primary btn-sm" (click)="decide(r, 'approve')"
                            [disabled]="busy()">Approve</button>
                    <button type="button" class="btn btn-quiet btn-sm" (click)="decide(r, 'decline')"
                            [disabled]="busy()">Decline</button>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <p class="quiet">No requests waiting. The queue empties as you decide.</p>
          }
        </section>

        <section class="panel">
          <div class="bar">
            <h2 class="overline">Guest list</h2>
            <div class="tools">
              <label class="sr">
                <span class="visually-hidden">Filter by status</span>
                <select class="input slim" (change)="filter.set($any($event.target).value)">
                  <option value="">All statuses</option>
                  @for (s of statuses; track s) { <option [value]="s">{{ statusWord(s) }}</option> }
                </select>
              </label>
              <button type="button" class="btn btn-invert btn-sm" (click)="exportCsv()">Export CSV</button>
            </div>
          </div>

          @if (rows().length) {
            <div class="tablewrap">
              <table>
                <thead>
                  <tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Status</th>
                      <th scope="col">Position</th><th scope="col">Ticket</th></tr>
                </thead>
                <tbody>
                  @for (r of rows(); track r.id) {
                    <tr>
                      <td><span class="nm">{{ r.display_name }}</span></td>
                      <td class="em">{{ r.email }}</td>
                      <td><span class="pill" [attr.data-status]="r.status">{{ statusWord(r.status) }}</span></td>
                      <td>{{ r.waitlist_position ?? '' }}</td>
                      <td><code class="code">{{ r.ticket_code || '' }}</code></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <h3>No Guests Yet</h3>
              <p>Share your event link and registrations will appear here.</p>
              <button type="button" class="btn btn-primary" (click)="copyLink()">Copy Link</button>
            </div>
          }
        </section>

        <section class="panel">
          <h2 class="overline">The door</h2>
          <form class="door" (submit)="checkIn($event)">
            <label class="grow">
              <span class="visually-hidden">Ticket code</span>
              <input class="input" placeholder="TKT-" [(ngModel)]="code" name="code" name="code"
                     autocomplete="off" aria-describedby="doorhelp" />
            </label>
            <button class="btn btn-primary" type="submit" [disabled]="busy()">Check In</button>
          </form>
          <p class="caption" id="doorhelp">Type or paste the code from the guest's ticket.</p>
          @if (doorAnswer()) { <p class="answer" role="status">{{ doorAnswer() }}</p> }
        </section>
      }
    </app-signed-shell>
  `,
  styles: [`
    .head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    h1 { font: 700 22px/26px var(--sans); }
    .panel { padding: 20px; border-radius: var(--r-card); background: var(--panel); margin-bottom: 20px; }
    .queue { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .qrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .who { display: flex; flex-direction: column; }
    .nm { font: 500 15px/22px var(--sans); }
    .em { font-size: 13px; color: var(--muted); }
    .acts { display: flex; gap: 8px; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .tools { display: flex; gap: 8px; align-items: center; }
    .slim { min-height: 36px; padding: 6px 10px; }
    .tablewrap { overflow-x: auto; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 22px; }
    th { text-align: left; font: 600 13px/18px var(--sans); color: var(--muted); padding: 8px 12px 8px 0; }
    td { padding: 12px 12px 12px 0; border-top: 1px solid var(--divider); vertical-align: top; }
    .empty { text-align: center; padding: 32px 16px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .empty h3 { font: 700 16px/22px var(--sans); }
    .empty p { color: var(--muted); }
    .door { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
    .grow { flex: 1 1 220px; }
    .answer { margin-top: 12px; font-size: 14px; }
    .quiet { color: var(--muted); margin-top: 8px; }
    .sr { display: inline-flex; }
    @media (max-width: 649px) { th:nth-child(2), td:nth-child(2) { display: none; } }
    @media (max-width: 483px) {
      table, thead, tbody, tr, td, th { display: block; }
      thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      tr { border-top: 1px solid var(--divider); padding: 12px 0; }
      th:nth-child(2), td:nth-child(2) { display: block; }
      td { border: none; padding: 4px 0; }
      td::before { content: attr(data-label) ': '; font: 600 11px/16px var(--sans); text-transform: uppercase;
        color: var(--muted); display: block; }
    }
  `],
})
export class ManageGuestsComponent {
  private api = inject(Api);
  slug = input.required<string>();
  event = signal<any | null>(null);
  regs = signal<Registration[]>([]);
  loading = signal(true);
  busy = signal(false);
  filter = signal('');
  code = '';
  doorAnswer = signal('');
  statuses = ['pending_approval', 'confirmed', 'waitlisted', 'declined', 'checked_in', 'cancelled_by_guest', 'cancelled_by_host'];

  statusWord = statusWord;

  ngOnInit() { this.load(); }

  load() {
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        this.event.set(e);
        this.api.registrations(this.slug()).subscribe({
          next: (r) => { this.regs.set(r); this.loading.set(false); },
          error: () => { this.loading.set(false); this.event.set(null); },
        });
      },
      error: () => this.loading.set(false),
    });
  }

  allowed = computed(() => this.event() !== null);

  queue = computed(() => this.regs().filter((r) => r.status === 'pending_approval'));
  rows = computed(() => {
    const f = this.filter();
    return f ? this.regs().filter((r) => r.status === f) : this.regs();
  });

  decide(r: Registration, which: 'approve' | 'decline') {
    this.busy.set(true);
    const call = which === 'approve' ? this.api.approve(r.id) : this.api.decline(r.id);
    call.subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.regs.update((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
        this.api.notify(
          updated.status === 'confirmed' ? 'The request is approved and the guest is mailed.'
          : updated.status === 'waitlisted' ? 'The event is full, so the request joined the waiting list.'
          : 'The request is declined and the guest is mailed.',
          updated.status === 'declined' ? 'warning' : 'success',
        );
      },
      error: (e) => { this.busy.set(false); this.api.notify(this.api.messageFor(e), 'danger'); },
    });
  }

  exportCsv() {
    window.open(`/api/events/${this.slug()}/registrations.csv`, '_blank');
  }

  copyLink() {
    const addr = `${location.origin}/${this.slug()}`;
    navigator.clipboard?.writeText(addr).then(() => this.api.notify('The address is copied.', 'success'));
  }

  checkIn(e: Event) {
    e.preventDefault();
    const code = this.code.trim().toUpperCase();
    if (!code) { this.doorAnswer.set('Type the code from the ticket first.'); return; }
    this.busy.set(true);
    this.api.checkIn(code).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.doorAnswer.set(r.already_checked_in_at
          ? `Already arrived at ${new Date(r.already_checked_in_at).toLocaleTimeString()}. One arrival, not two.`
          : `Checked in. Welcome.`);
        this.regs.update((list) => list.map((x) => (x.id === r.id ? { ...x, ...r } : x)));
      },
      error: (err) => { this.busy.set(false); this.doorAnswer.set(this.api.messageFor(err)); },
    });
  }
}

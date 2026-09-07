import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Registration } from '../core/api';
import { statusWord, parseInstant, inZone } from '../core/tokens';
import { SignedShellComponent } from '../shells/signed-shell';
import { CoverComponent } from '../ui/cover';
import { SkeletonComponent } from '../ui/skeleton';
import { DialogComponent } from '../ui/dialog';

/** The guest's registrations: Upcoming first, Past second. */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, RouterLink, CoverComponent, SkeletonComponent, DialogComponent],
  template: `
    <app-signed-shell>
      <h1>Your events</h1>

      @if (loading()) {
        <app-skeleton [count]="3" [height]="64" [art]="44" />
      } @else if (!rows().length) {
        <div class="empty">
          <h2>No Upcoming Events</h2>
          <p>Events you register for will appear here.</p>
          <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
        </div>
      } @else {
        @for (group of groups(); track group.label) {
          <section class="grp">
            <h2 class="overline">{{ group.label }}</h2>
            @if (group.rows.length) {
              <ul class="list">
                @for (r of group.rows; track r.id) {
                  <li class="row">
                    <a class="art" [routerLink]="['/' + r.event_slug]" [attr.aria-label]="r.title">
                      <app-cover [seed]="r.cover_seed || r.event_slug!" />
                    </a>
                    <div class="mid">
                      <a class="title" [routerLink]="['/' + r.event_slug]">{{ r.title }}</a>
                      <span class="when">{{ when(r) }}</span>
                    </div>
                    <span class="pill" [attr.data-status]="r.status">{{ statusWord(r.status) }}
                      @if (r.status === 'waitlisted' && r.waitlist_position) { · {{ r.waitlist_position }} }
                    </span>
                    <div class="ctl">
                      @if (r.status === 'confirmed' || r.status === 'checked_in') {
                        <a class="btn btn-quiet btn-sm" [routerLink]="['/t/' + r.ticket_code]">View Ticket</a>
                        @if (!isPast(r)) {
                          <button type="button" class="btn btn-quiet btn-sm" (click)="askCancel(r)">Cancel</button>
                        }
                      } @else if (r.status === 'waitlisted') {
                        <button type="button" class="btn btn-quiet btn-sm" (click)="askCancel(r)">Leave Waiting List</button>
                      }
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <p class="quiet">{{ group.label === 'Upcoming' ? 'No Upcoming Events' : 'Nothing past yet.' }}</p>
            }
          </section>
        }
      }
    </app-signed-shell>

    <app-dialog [open]="cancelOpen()" title="Cancel your place"
                [body]="cancelBody()" [closed]="close">
      <div class="dlg">
        <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(false)">Keep my place</button>
        <button type="button" class="btn btn-danger" (click)="confirmCancel()">Yes, cancel my place</button>
      </div>
    </app-dialog>
  `,
  styles: [`
    h1 { font: 700 22px/26px var(--sans); margin-bottom: 24px; }
    .grp { margin-bottom: 32px; }
    .list { list-style: none; margin: 0; padding: 0; }
    .row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--divider); }
    .art { width: 44px; height: 44px; flex: none; border-radius: var(--r-media); overflow: hidden; }
    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .title { font-size: 15px; line-height: 22px; text-decoration: none; color: inherit; }
    .when { font-size: 13px; line-height: 18px; color: var(--muted); }
    .ctl { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .empty { text-align: center; padding: 64px 24px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .empty h2 { font: 700 20px/26px var(--sans); }
    .empty p { color: var(--muted); margin-bottom: 8px; }
    .quiet { color: var(--muted); }
    .dlg { display: flex; gap: 12px; justify-content: flex-end; }
    @media (max-width: 649px) {
      .row { flex-wrap: wrap; }
      .ctl { width: 100%; justify-content: flex-start; }
    }
  `],
})
export class HomeComponent {
  private api = inject(Api);
  rows = signal<Registration[]>([]);
  loading = signal(true);
  cancelOpen = signal(false);
  target = signal<Registration | null>(null);

  statusWord = statusWord;

  ngOnInit() {
    this.api.myRegistrations().subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  isPast(r: Registration) { return parseInstant(r.ends_at!).getTime() < Date.now(); }

  groups = computed(() => {
    const up = this.rows().filter((r) => !this.isPast(r));
    const past = this.rows().filter((r) => this.isPast(r));
    return [{ label: 'Upcoming', rows: up }, { label: 'Past', rows: past }];
  });

  when(r: Registration) {
    const d = parseInstant(r.starts_at!);
    return inZone(d, r.time_zone!, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: false });
  }

  askCancel(r: Registration) { this.target.set(r); this.cancelOpen.set(true); }

  cancelBody() {
    const t = this.target();
    return t?.status === 'waitlisted'
      ? 'You leave the waiting list for this event.'
      : 'This frees your seat for the next person on the waiting list.';
  }

  close = () => this.cancelOpen.set(false);

  confirmCancel() {
    const t = this.target();
    if (!t) return;
    this.cancelOpen.set(false);
    this.api.cancelRegistration(t.id).subscribe({
      next: (r) => {
        this.rows.update((list) => list.map((x) => (x.id === r.id ? { ...x, ...r } : x)));
        this.api.notify('Your place is released.', 'info');
      },
      error: (e) => this.api.notify(this.api.messageFor(e), 'danger'),
    });
  }
}

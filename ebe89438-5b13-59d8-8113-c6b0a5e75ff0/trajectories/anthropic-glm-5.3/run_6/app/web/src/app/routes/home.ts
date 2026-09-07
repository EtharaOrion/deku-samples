import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Registration } from '../api.service';
import { NoticeService } from '../notice.service';
import { AppShellComponent, DialogComponent } from '../shell';
import { EventCoverComponent, StatusPillComponent } from '../widgets';
import { shortDate, inZone } from '../shared';

@Component({
  selector: 'route-home', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AppShellComponent, EventCoverComponent, StatusPillComponent, DialogComponent],
  template: `
    <app-shell>
      <h1 class="t-screen">Your events</h1>

      @if (loading()) {
        <div class="stack gap-8">
          @for (i of [1,2,3]; track i) {
            <div class="row gap-12"><div class="skeleton" style="width:44px;height:44px"></div><div class="skeleton" style="height:20px;width:50%"></div></div>
          }
        </div>
      } @else if (regs().length === 0) {
        <div class="card empty-card">
          <h2 class="t-screen">No Upcoming Events</h2>
          <p class="t-para">Events you register for will appear here.</p>
          <a routerLink="/discover" class="btn btn-primary">Discover Events</a>
        </div>
      } @else {
        @if (upcoming().length) {
          <section class="stack gap-12">
            <h2 class="t-overline">Upcoming</h2>
            <ul class="rows">
              @for (r of upcoming(); track r.id) {
                <li class="row-line">
                  <a class="thumb" [routerLink]="['/' + r.event_slug]" [attr.aria-label]="r.title">
                    <event-cover [seed]="r.event_slug || ''" [title]="r.title || ''"></event-cover>
                  </a>
                  <div class="line-info">
                    <a class="t-row line-title" [routerLink]="['/' + r.event_slug]">{{ r.title }}</a>
                    <span class="t-caption">{{ when(r) }}</span>
                  </div>
                  <status-pill [status]="r.status"></status-pill>
                  <span class="line-actions">
                    @if (r.status === 'confirmed' || r.status === 'checked_in') {
                      <a class="btn btn-sm btn-secondary" [routerLink]="['/t', r.ticket_code]">View Ticket</a>
                      <button type="button" class="btn btn-sm btn-ghost" (click)="askCancel(r)">Cancel place</button>
                    } @else if (r.status === 'waitlisted') {
                      <button type="button" class="btn btn-sm btn-ghost" (click)="askCancel(r)">Leave Waiting List</button>
                    }
                  </span>
                </li>
              }
            </ul>
          </section>
        }
        @if (past().length) {
          <section class="stack gap-12">
            <h2 class="t-overline">Past</h2>
            <ul class="rows">
              @for (r of past(); track r.id) {
                <li class="row-line">
                  <div class="thumb"><event-cover [seed]="r.event_slug || ''" [title]="r.title || ''"></event-cover></div>
                  <div class="line-info">
                    <span class="t-row line-title">{{ r.title }}</span>
                    <span class="t-caption">{{ when(r) }}</span>
                  </div>
                  <status-pill [status]="r.status"></status-pill>
                </li>
              }
            </ul>
          </section>
        }
      }
    </app-shell>

    @if (cancelling()) {
      <cc-dialog title="Cancel your place?" (closed)="cancelling.set(null)">
        <p class="t-body">This releases your seat to the next person on the waiting list at once. It cannot be undone from here, though you can register again while registration is open.</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" (click)="cancelling.set(null)">Keep my place</button>
          <button type="button" class="btn btn-danger" (click)="doCancel()">Yes, cancel my place</button>
        </div>
      </cc-dialog>
    }
  `,
  styles: [`
    :host{display:block}
    .rows{display:flex;flex-direction:column}
    .row-line{display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--divider)}
    .row-line:last-child{border-bottom:0}
    .thumb{width:44px;height:44px;border-radius:11px;overflow:hidden;flex:0 0 auto}
    .line-info{flex:1;min-width:0;display:flex;flex-direction:column}
    .line-title{font-weight:500;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
    .line-actions{display:flex;gap:8px}
    .empty-card{padding:48px 32px;display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;max-width:480px;margin:24px auto}
    .dialog-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:16px}
    @media (max-width:649px){ .row-line{flex-wrap:wrap} }
  `],
})
export class HomeComponent implements OnInit {
  api = inject(ApiService);
  private notice = inject(NoticeService);
  regs = signal<Registration[]>([]);
  loading = signal(true);
  cancelling = signal<Registration | null>(null);

  upcoming = signal<Registration[]>([]);
  past = signal<Registration[]>([]);

  when(r: Registration) {
    if (!r.starts_at) return '';
    return `${shortDate(r.starts_at, r.time_zone || 'UTC')} · ${r.city || ''}`;
  }

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const all = await this.api.get<Registration[]>('/registrations/me');
      this.regs.set(all);
      this.upcoming.set(all.filter(r => !r.is_past));
      this.past.set(all.filter(r => !!r.is_past));
    } catch { this.regs.set([]); }
    this.loading.set(false);
  }

  askCancel(r: Registration) { this.cancelling.set(r); }

  async doCancel() {
    const r = this.cancelling();
    if (!r) return;
    try {
      await this.api.post(`/registrations/${r.id}/cancel`);
      this.notice.say('Your place is released.', 'info');
      this.cancelling.set(null);
      await this.load();
    } catch (e: any) {
      this.notice.say(e?.message || 'That did not go through. Try again.', 'danger');
    }
  }
}

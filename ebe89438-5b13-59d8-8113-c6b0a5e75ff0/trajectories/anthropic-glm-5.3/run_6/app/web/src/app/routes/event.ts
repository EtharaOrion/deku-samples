import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, ApiError, EventRecord, Registration } from '../api.service';
import { NoticeService } from '../notice.service';
import { PublicBarComponent } from '../public-bar';
import { AvatarComponent, EventCoverComponent, StatusPillComponent } from '../widgets';
import { NotFoundComponent } from './not-found';
import {
  inZone, timeInZone, visitorLine, visitorZoneDiffers, localZoneName,
} from '../shared';

type PanelState =
  | 'register' | 'request' | 'received' | 'going' | 'waiting' | 'closed'
  | 'declined' | 'draft' | 'full';

@Component({
  selector: 'route-event', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent, EventCoverComponent, AvatarComponent, StatusPillComponent, NotFoundComponent],
  host: { '[style.background]': 'pageGround()', '[style.color]': 'pageInk()' },
  template: `
    @if (loading()) {
      <public-bar></public-bar>
      <main id="main" class="content-frame page">
        <div class="cols">
          <div class="rail-col stack gap-24">
            <div class="skeleton" style="aspect-ratio:1;border-radius:11px"></div>
            <div class="skeleton" style="height:24px;width:70%"></div>
          </div>
          <div class="stack gap-16">
            <div class="skeleton" style="height:40px;width:80%"></div>
            <div class="skeleton" style="height:24px;width:50%"></div>
            <div class="skeleton" style="height:160px"></div>
          </div>
        </div>
      </main>
    } @else if (!ev()) {
      <route-not-found></route-not-found>
    } @else {
      <public-bar></public-bar>
      <main id="main" class="content-frame page themed" [style.--t-ink]="ink()" [style.--t-ink2]="ink2()"
            [style.--t-hairline]="hairline()" [style.--t-panel]="panelFill()" [style.--t-sunk]="sunk()">
        <div class="cols">
          <aside class="rail-col stack gap-24" aria-label="About this event">
            <div class="cover-wrap">
              <event-cover [seed]="ev()!.cover_seed || ev()!.slug" [title]="ev()!.title" size="lg"></event-cover>
            </div>
            @if (ev()!.calendar_name) {
              <div class="presented row">
                <cc-avatar [name]="ev()!.calendar_name || ''" [size]="24"></cc-avatar>
                <div class="stack" style="gap:0">
                  <span class="overline">Presented by</span>
                  <a class="cal-link" [routerLink]="['/' + ev()!.calendar_slug]">{{ ev()!.calendar_name }} <span aria-hidden="true">›</span></a>
                </div>
                <span class="spacer"></span>
              </div>
            }
            <dl class="facts stack gap-12">
              <div class="fact"><dt>When</dt><dd>{{ when() }}
                @if (visitorZoneDiffers(ev()!.time_zone)) { <span class="t-caption visitor">{{ visitorLine(ev()!.starts_at) }}</span> }
              </dd></div>
              <div class="fact"><dt>Where</dt><dd>{{ ev()!.city }}</dd></div>
              <div class="fact"><dt>Category</dt><dd>{{ ev()!.category }}</dd></div>
            </dl>
          </aside>

          <div class="content-col stack gap-24">
            <header class="stack gap-12">
              <h1 class="t-display title">{{ ev()!.title }}</h1>
              @if (ev()!.state === 'cancelled') {
                <div class="cancel-notice">
                  <status-pill status="cancelled"></status-pill>
                  <p class="t-body">{{ ev()!.cancel_reason }}</p>
                </div>
              }
            </header>

            <p class="t-para desc">{{ ev()!.description }}</p>

            @if (ev()!.state !== 'cancelled') {
              <section class="panel" aria-label="Registration">
                @switch (panel()) {
                  @case ('closed') {
                    <h2 class="t-overline">Registration</h2>
                    <p class="panel-title">Registration Is Closed</p>
                    <p class="t-body">The host has stopped taking registrations for this event.</p>
                  }
                  @case ('received') {
                    <h2 class="t-overline">Registration</h2>
                    <p class="panel-title">Request received</p>
                    <p class="t-body">The host is deciding. We will email you the moment they do.</p>
                  }
                  @case ('going') {
                    <h2 class="t-overline">Your place</h2>
                    <p class="panel-title">You are going</p>
                    <p class="t-body">Your ticket code is <span class="code big">{{ mine()!.ticket_code }}</span>.</p>
                    <a class="btn btn-primary" [routerLink]="['/t', mine()!.ticket_code]">View Ticket</a>
                    <button type="button" class="btn btn-secondary" (click)="cancelSeat()">Cancel my place</button>
                  }
                  @case ('waiting') {
                    <h2 class="t-overline">Your place</h2>
                    <p class="panel-title">You are number {{ mine()!.waitlist_position }} on the waiting list</p>
                    <p class="t-body">We will email you the moment a seat opens up.</p>
                    <button type="button" class="btn btn-secondary" (click)="cancelSeat()">Leave Waiting List</button>
                  }
                  @case ('declined') {
                    <h2 class="t-overline">Registration</h2>
                    <p class="panel-title">Not this time</p>
                    <p class="t-body">The host could not take your request for this event.</p>
                  }
                  @case ('full') {
                    <h2 class="t-overline">Registration</h2>
                    <p class="panel-title">This event just filled up</p>
                    <p class="t-body">There is no waiting list for this event.</p>
                  }
                  @default {
                    <h2 class="t-overline">Registration</h2>
                    <p class="panel-title">{{ ev()!.remaining }} of {{ ev()!.capacity }} seats free</p>
                    <p class="t-body">{{ ev()!.approval_required
                        ? 'The host looks at every request by hand.'
                        : 'One click and the seat is yours.' }}</p>
                    @if (!api.account) {
                      <a class="btn btn-primary" [routerLink]="['/login']" [queryParams]="{ next: '/' + ev()!.slug }">
                        {{ ev()!.approval_required ? 'Request to Join' : 'Register' }}</a>
                      <p class="t-caption">You will need an account. It takes a moment.</p>
                    } @else {
                      <button type="button" class="btn btn-primary" (click)="register()" [disabled]="busy()">
                        @if (busy()) { <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="30"></circle></svg> }
                        {{ ev()!.approval_required ? 'Request to Join' : 'Register' }}
                      </button>
                    }
                  }
                }
                <p class="t-body answer" role="status" aria-live="assertive">{{ answer() }}</p>
              </section>
            }
          </div>
        </div>
      </main>
    }
  `,
  styles: [`
    :host{display:block;min-height:100vh}
    .page.themed{animation:event-theme-fade-in 2000ms linear both}
    .cols{max-width:948px;margin:0 auto;padding:32px 24px 96px;display:grid;grid-template-columns:332px 568px;gap:48px;justify-content:center}
    .title{font-size:36px;line-height:42px}
    .overline{color:var(--t-ink2, var(--ink-2))}
    .facts dt{font-size:13px;line-height:18px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;color:var(--t-ink2,var(--ink-2))}
    .facts dd{margin:2px 0 0;font-size:15px;line-height:22px}
    .visitor{display:block}
    .desc{white-space:pre-line}
    .panel{border:1px solid var(--t-hairline, var(--hairline));border-radius:12px;padding:24px;background:var(--t-panel, transparent);
           display:flex;flex-direction:column;gap:12px;align-items:flex-start}
    .panel-title{font-size:18px;line-height:24px;font-weight:600}
    .answer:empty{display:none}
    .code.big{font-size:18px;line-height:24px;font-weight:600}
    .cal-link{font-size:16px;line-height:24px;font-weight:500;color:inherit;display:inline-flex;align-items:center;gap:4px}
    .spacer{flex:1}
    .presented{color:inherit}
    .cancel-notice{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:12px;background:var(--t-panel,transparent)}
    @media (max-width:999px){ .cols{grid-template-columns:1fr;gap:24px} }
    @media (max-width:483px){
      .cols{padding-bottom:96px}
      .panel{position:fixed;left:0;right:0;bottom:0;z-index:var(--z-bar);border-radius:16px 16px 0 0;min-height:72px;
             display:flex;flex-direction:row;align-items:center;gap:12px;justify-content:space-between;padding:12px 16px}
    }
  `],
})
export class EventPageComponent implements OnInit {
  slug = input.required<string>();
  api = inject(ApiService);
  private notice = inject(NoticeService);
  private router = inject(Router);

  ev = signal<EventRecord | null>(null);
  mine = signal<Registration | null>(null);
  loading = signal(true);
  busy = signal(false);
  answer = signal('');

  pageGround = computed(() => this.ev()?.theme?.ground || '#ffffff');
  pageInk = computed(() => this.ev()?.theme?.ink || '#151515');
  ink = computed(() => this.ev()?.theme?.ink || '#151515');
  ink2 = computed(() => this.ev()?.theme?.ink2 || 'rgba(21,21,21,.36)');
  hairline = computed(() => this.ev()?.theme?.hairline || 'rgba(21,21,21,.08)');
  panelFill = computed(() => this.ev()?.theme?.panel || 'transparent');
  sunk = computed(() => this.ev()?.theme?.sunk || '#fafafa');

  inZone = inZone; timeInZone = timeInZone; visitorLine = visitorLine; visitorZoneDiffers = visitorZoneDiffers;
  when() {
    const e = this.ev();
    if (!e) return '';
    return `${inZone(e.starts_at, e.time_zone)} · ${timeInZone(e.starts_at, e.time_zone)} ${e.time_zone}`;
  }

  panel = computed<PanelState>(() => {
    const e = this.ev();
    if (!e) return 'register';
    const m = this.mine();
    if (m) {
      if (m.status === 'confirmed' || m.status === 'checked_in') return 'going';
      if (m.status === 'waitlisted') return 'waiting';
      if (m.status === 'pending_approval') return 'received';
      if (m.status === 'declined') return 'declined';
      if (m.status === 'cancelled_by_guest' || m.status === 'cancelled_by_host') {
        // a guest may try again unless the event has moved on
        if (e.state === 'registration_closed') return 'closed';
        if (e.approval_required) return 'request';
        return e.remaining > 0 || e.waitlist_enabled ? 'register' : 'full';
      }
    }
    if (e.state === 'registration_closed') return 'closed';
    if (e.remaining === 0 && !e.waitlist_enabled) return 'full';
    return e.approval_required ? 'request' : 'register';
  });

  ngOnInit() { this.reload(); }

  async reload() {
    this.loading.set(true);
    try {
      const e = await this.api.get<EventRecord>(`/events/${encodeURIComponent(this.slug())}`);
      this.ev.set(e);
      this.mine.set(null);
      if (this.api.account) {
        const mine = await this.api.get<Registration[]>('/registrations/me');
        this.mine.set(mine.find((r) => r.event_slug === e.slug) || null);
      }
    } catch { this.ev.set(null); }
    this.loading.set(false);
  }

  async register() {
    const e = this.ev();
    if (!e) return;
    this.busy.set(true); this.answer.set('');
    try {
      const reg = await this.api.post<Registration>('/registrations', { event_slug: e.slug });
      this.mine.set(reg);
      if (reg.status === 'confirmed') {
        this.answer.set(`You are going. Your ticket code is ${reg.ticket_code}. A confirmation is on its way to your inbox.`);
        this.notice.say(`You are going to ${e.title}.`, 'success');
      } else if (reg.status === 'waitlisted') {
        this.answer.set(`This event just filled up. You are on the waiting list at position ${reg.waitlist_position}.`);
        this.notice.say(`You are number ${reg.waitlist_position} on the waiting list for ${e.title}.`, 'warning');
      } else if (reg.status === 'pending_approval') {
        this.answer.set('Request received. The host is deciding and will email you.');
        this.notice.say(`Your request to join ${e.title} was sent.`, 'info');
      }
      await this.reload();
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.status === 409 && /filled up/i.test(e2.message)) {
        this.answer.set('This event just filled up. You are on the waiting list.');
      } else {
        this.answer.set(e2.message || 'That did not go through. Try again in a moment.');
      }
    } finally { this.busy.set(false); }
  }

  async cancelSeat() {
    const m = this.mine();
    const e = this.ev();
    if (!m || !e) return;
    this.busy.set(true);
    try {
      const updated = await this.api.post<Registration>(`/registrations/${m.id}/cancel`);
      this.mine.set(updated);
      this.answer.set(updated.status === 'cancelled_by_guest'
        ? 'Your place is released. The next person on the waiting list has been offered the seat.'
        : 'Your registration is cancelled.');
      this.notice.say('Your registration is cancelled.', 'info');
      await this.reload();
    } catch (err) {
      this.answer.set((err as ApiError).message || 'That did not go through. Try again.');
    } finally { this.busy.set(false); }
  }
}

import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, AuthService, EventItem } from '../api';
import { NoticeService } from '../notice';

/** The shared not-found page: same wording for a route that never existed and
 *  a route the visitor may not see. */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="nf">
      <p class="code">404 <span aria-hidden="true">·</span> Page Not Found</p>
      <h1 class="nf-title">404 · Page Not Found</h1>
      <p class="nf-body">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
      <a routerLink="/" class="btn btn-primary">Return Home</a>
    </main>
  `,
  styles: [`
    .nf { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; }
    .code { font-size: 13px; letter-spacing: .04em; color: var(--muted); }
    .nf-title { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .nf-body { max-width: 420px; color: var(--ink-64); font-size: 16px; line-height: 24px; }
  `],
})
export class NotFoundComponent {}

@Component({
  selector: 'app-not-found-embed',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="nf">
      <p class="code">404 <span aria-hidden="true">·</span> Page Not Found</p>
      <h1>404 · Page Not Found</h1>
      <p class="nf-body">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
      <a routerLink="/" class="btn btn-primary">Return Home</a>
    </main>
  `,
  styles: [`
    .nf { min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 96px 24px 64px; text-align: center; }
    .code { font-size: 13px; letter-spacing: .04em; color: var(--muted); }
    h1 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .nf-body { max-width: 420px; color: var(--ink-64); }
  `],
})
export class NotFoundEmbedComponent {}

/** Status word in a pill. */
@Component({
  selector: 'app-status',
  standalone: true,
  template: `<span class="pill" [class]="'pill pill-status-' + status">{{ label }}</span>`,
})
export class StatusPillComponent {
  @Input() status = '';
  get label() {
    const map: Record<string, string> = {
      pending_approval: 'Pending approval', confirmed: 'Confirmed', waitlisted: 'Waitlisted',
      declined: 'Declined', cancelled_by_guest: 'Cancelled', cancelled_by_host: 'Cancelled by host',
      checked_in: 'Checked in', draft: 'Draft', published: 'Published',
      registration_closed: 'Registration Closed', cancelled: 'Cancelled',
    };
    return map[this.status] ?? this.status;
  }
}

/** The registration panel: the point of the event screen. Six states. */
@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusPillComponent],
  template: `
    <section class="panel" aria-labelledby="panel-h">
      @if (mode === 'closed') {
        <h2 id="panel-h" class="panel-title">Registration Is Closed</h2>
        <p class="panel-body">The host has stopped taking registrations for this event.</p>
      } @else if (mode === 'cancelled') {
        <h2 id="panel-h" class="panel-title">This event has been cancelled</h2>
        <p class="panel-body">It is no longer taking registrations.</p>
      } @else if (mode === 'signin') {
        <h2 id="panel-h" class="panel-title">{{ event.approval_required ? 'Request to join' : 'Register' }}</h2>
        <p class="panel-body">{{ seatLine }}</p>
        <a [routerLink]="['/login']" [queryParams]="{ next: '/' + event.slug }" class="btn btn-primary">Sign In to Register</a>
      } @else if (mode === 'register') {
        <h2 id="panel-h" class="panel-title">{{ event.approval_required ? 'Request to join' : 'Register' }}</h2>
        <p class="panel-body">{{ seatLine }}</p>
        <button type="button" class="btn btn-primary" (click)="go()" [disabled]="working">
          @if (working) { <svg class="spinner" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7"></circle></svg> Sending }
          @else { {{ event.approval_required ? 'Request to Join' : 'Register' }} }
        </button>
      } @else if (mode === 'pending') {
        <h2 id="panel-h" class="panel-title">Request received</h2>
        <p class="panel-body">The host is deciding. You hold no seat yet, and we will write to you either way.</p>
      } @else if (mode === 'going') {
        <h2 id="panel-h" class="panel-title">You are going</h2>
        <p class="panel-body">Your ticket is below. We emailed a copy to you.</p>
        <p class="code mono">{{ reg?.ticket_code }}</p>
        <div class="row">
          <a class="btn btn-secondary" [routerLink]="['/t', reg!.ticket_code!]">View Ticket</a>
          <button type="button" class="btn btn-ghost" (click)="cancel()">Cancel my seat</button>
        </div>
      } @else if (mode === 'waitlisted') {
        <h2 id="panel-h" class="panel-title">You are number {{ reg?.waitlist_position }} on the waiting list</h2>
        <p class="panel-body">If a seat opens it is yours and we will write to you.</p>
        <button type="button" class="btn btn-ghost" (click)="cancel()">Leave Waiting List</button>
      } @else if (mode === 'full') {
        <h2 id="panel-h" class="panel-title">This event just filled up</h2>
        <p class="panel-body">There are no seats and no waiting list for this event.</p>
      } @else if (mode === 'declined') {
        <h2 id="panel-h" class="panel-title">Your request was declined</h2>
        <p class="panel-body">The host could not take your request this time.</p>
      } @else if (mode === 'other') {
        <h2 id="panel-h" class="panel-title">Your place is no longer held</h2>
        <p class="panel-body">You cancelled this registration.</p>
      }
      <p class="live" role="status" aria-live="assertive">{{ answer }}</p>
    </section>
  `,
  styles: [`
    .panel {
      border: 1px solid var(--t-hair, rgba(21,21,21,.08)); border-radius: 12px;
      background: var(--t-panel, rgba(21,21,21,.04));
      padding: 20px; display: flex; flex-direction: column; gap: 12px;
      color: inherit;
    }
    .panel-title { font-size: 17px; line-height: 22px; font-weight: 600; }
    .panel-body { font-size: 15px; line-height: 22px; opacity: .8; }
    .code { font-size: 22px; line-height: 26px; letter-spacing: .04em; padding: 8px 0; }
    .live { min-height: 20px; font-size: 14px; line-height: 20px; }
    .btn-primary { background: var(--t-ink, #151515); color: var(--event-ground, #fff); }
    .btn-secondary { color: inherit; border-color: var(--t-hair, rgba(21,21,21,.08)); background: transparent; }
  `],
})
export class RegistrationPanelComponent implements OnChanges {
  @Input() event!: EventItem;
  @Input() reg: any = null;
  @Input() signedIn = false;
  working = false;
  answer = '';
  private api = inject(Api);
  private auth = inject(AuthService);
  private router = inject(Router);
  private notice = inject(NoticeService);

  ngOnChanges() { this.answer = ''; }

  get mode(): string {
    const e = this.event;
    if (!e) return 'closed';
    if (e.state === 'cancelled') return 'cancelled';
    if (e.state === 'registration_closed') return 'closed';
    if (!this.signedIn) return 'signin';
    const r = this.reg;
    if (r) {
      if (r.status === 'confirmed' || r.status === 'checked_in') return 'going';
      if (r.status === 'waitlisted') return 'waitlisted';
      if (r.status === 'pending_approval') return 'pending';
      if (r.status === 'declined') return 'declined';
      return 'other';
    }
    if (e.remaining === 0 && !e.waitlist_enabled) return 'full';
    return 'register';
  }

  get seatLine(): string {
    const e = this.event;
    if (e.remaining === 0) return 'The seats are taken, and the waiting list is open.';
    return `${e.remaining} of ${e.capacity} seats left.`;
  }

  async go() {
    this.working = true;
    this.answer = '';
    try {
      const r = await this.api.pr(this.api.register(this.event.slug));
      this.reg = r;
      if (r.status === 'confirmed') this.answer = `You are going. Your ticket code is ${r.ticket_code}.`;
      else if (r.status === 'waitlisted') this.answer = `This event just filled up. You are on the waiting list.`;
      else this.answer = 'Your request is with the host.';
      this.notice.polite(this.answer, r.status === 'confirmed' ? 'success' : 'info');
    } catch (e: any) {
      this.answer = e?.message ?? 'That did not go through. Try again in a moment.';
      this.notice.show(this.answer, 'danger');
    } finally {
      this.working = false;
    }
  }

  async cancel() {
    if (!this.reg) return;
    try {
      const r = await this.api.pr(this.api.cancelRegistration(this.reg.id));
      this.reg = { ...this.reg, ...r };
      this.answer = 'Your place is released.';
      this.notice.polite('Your place is released.', 'info');
    } catch (e: any) {
      this.answer = e?.message ?? 'That did not go through. Try again in a moment.';
    }
  }
}

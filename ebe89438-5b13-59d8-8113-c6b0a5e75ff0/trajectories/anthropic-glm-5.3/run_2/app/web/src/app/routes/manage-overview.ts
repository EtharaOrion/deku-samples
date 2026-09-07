import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Shell } from '../layout/shell';
import { Api, ApiError } from '../core/api';
import { NotFoundEmbed } from './not-found-embed';

@Component({
  selector: 'cc-manage-overview',
  standalone: true,
  imports: [FormsModule, Shell, RouterLink, NotFoundEmbed],
  template: `
  <cc-shell>
    @if (loading) {
      <div class="stack-16"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div></div>
    } @else if (!e) {
      <cc-not-found-embed></cc-not-found-embed>
    } @else {
      <div class="spread">
        <div class="grow">
          <h1 class="screen-title">{{ e.title }}</h1>
          <p class="caption">{{ e.calendar?.name }}</p>
        </div>
        <span class="pill {{ stateClass }}"><span class="pill-dot"></span>{{ stateWord }}</span>
      </div>
      <div class="row addr">
        <code class="code">{{ link }}</code>
        <button class="btn btn-sm btn-secondary" type="button" (click)="copy()">Copy Link</button>
      </div>

      @if (e.state === 'cancelled') {
        <div class="notice-card">
          <h2 class="panel-h">This event has been cancelled</h2>
          <p>{{ e.cancel_reason }}</p>
        </div>
      } @else {
        <ul class="counters">
          <li><span class="n">{{ e.confirmed_count }}/{{ e.capacity }}</span><span class="overline tertiary">Confirmed</span></li>
          <li><span class="n">{{ waiting }}</span><span class="overline tertiary">Waiting</span></li>
          <li><span class="n">{{ pending }}</span><span class="overline tertiary">Awaiting approval</span></li>
          <li><span class="n">{{ arrived }}</span><span class="overline tertiary">Arrived</span></li>
        </ul>

        <section class="todo">
          <h2 class="overline tertiary">Next three things to do</h2>
          <ol class="stack-8">
            @for (t of todo; track t) { <li class="list-row">{{ t }}</li> }
          </ol>
        </section>
      }

      <nav class="row sisters">
        <a class="btn btn-secondary" [routerLink]="['/event', slug, 'manage', 'guests']">Guests</a>
        <a class="btn btn-secondary" [routerLink]="['/event', slug, 'manage', 'registration']">Registration</a>
        @if (e.state !== 'cancelled') {
          <button class="btn btn-danger" type="button" (click)="cancelOpen = true">Cancel Event</button>
        }
      </nav>

      @if (cancelOpen) {
        <div class="scrim" (click)="cancelOpen = false"></div>
        <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="cancel-h">
          <h2 id="cancel-h" class="screen-title">Cancel this event</h2>
          <p class="caption">Every guest still holding a place is mailed your reason word for word. A cancellation cannot be undone.</p>
          <form class="stack-16" (submit)="doCancel($event)">
            <label>
              <span class="field-label">Reason</span>
              <textarea class="field" rows="3" [(ngModel)]="cancelReason" name="reason"
                        placeholder="Tell guests what happened" required></textarea>
            </label>
            <div class="row spread">
              <button class="btn btn-secondary" type="button" (click)="cancelOpen = false">Keep the event</button>
              <button class="btn btn-danger" type="submit" [disabled]="!cancelReason.trim() || busy">
                {{ busy ? 'Cancelling…' : 'Cancel Event' }}
              </button>
            </div>
          </form>
        </div>
      }
    }
  </cc-shell>`,
  styles: [`
    .addr { margin: 16px 0 32px; }
    .counters { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 16px; padding: 0; margin: 0 0 32px; }
    .counters li { display: grid; gap: 6px; }
    .n { font-size: 22px; line-height: 26px; font-weight: 700; }
    .todo { margin-bottom: 32px; }
    .todo ol { margin: 8px 0 0; padding-left: 20px; }
    .notice-card { background: rgba(255,59,48,0.06); border: 1px solid rgba(255,59,48,0.3);
      border-radius: 12px; padding: 20px; max-width: 560px; }
    .panel-h { font-size: 17px; line-height: 22px; margin: 0 0 8px; }
    .sisters { margin-top: 16px; }
    .scrim { position: fixed; inset: 0; background: rgba(21,21,21,0.8); z-index: 9901; }
    .dialog { position: fixed; z-index: 9999; left: 50%; top: 50%; transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px)); padding: 28px; border-radius: 24px;
      animation: dialog-in 0.3s var(--ease-out) both; }
    @keyframes dialog-in { from { opacity: 0; transform: translate(-50%, -46%); } }
    @media (max-width: 650px) { .counters { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ManageOverview implements OnInit {
  slug = '';
  loading = true;
  e: any = null;
  waiting = 0;
  pending = 0;
  arrived = 0;

  cancelOpen = false;
  cancelReason = '';
  busy = false;

  constructor(private route: ActivatedRoute, private api: Api) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = m.get('slug') ?? '';
      try {
        this.e = await this.api.request<any>(`/events/${this.slug}`);
        const regs = await this.api.request<any[]>(`/events/${this.slug}/registrations`);
        this.waiting = regs.filter(r => r.status === 'waitlisted').length;
        this.pending = regs.filter(r => r.status === 'pending_approval').length;
        this.arrived = regs.filter(r => r.status === 'checked_in').length;
      } catch (err) {
        if (!((err as ApiError).status === 404)) throw err;
        this.e = null;
      } finally { this.loading = false; }
    });
  }

  get link(): string { return `${location.origin}/${this.slug}`; }
  get stateWord(): string {
    const m: Record<string, string> = { published: 'Published', draft: 'Draft',
      registration_closed: 'Registration closed', cancelled: 'Cancelled' };
    return m[this.e?.state] ?? this.e?.state ?? '';
  }
  get stateClass(): string {
    if (this.e?.state === 'published') return 'pill-ok';
    if (this.e?.state === 'cancelled') return 'pill-bad';
    if (this.e?.state === 'registration_closed') return 'pil-warn';
    return 'pill-neutral';
  }
  get todo(): string[] {
    const out: string[] = [];
    if (this.pending) out.push(`Approve ${this.pending} request${this.pending > 1 ? 's' : ''} in the queue.`);
    if (this.waiting) out.push(`${this.waiting} guest${this.waiting > 1 ? 's' : ''} waiting for a seat.`);
    if (this.e?.state === 'draft') out.push('Publish the event so guests can find it.');
    if (this.arrived) out.push(`${this.arrived} guest${this.arrived > 1 ? 's' : ''} already checked in.`);
    if (!out.length) out.push('Nothing needs you. Share the link and let it fill.');
    return out.slice(0, 3);
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.link).catch(() => null);
  }

  async doCancel(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.cancelReason.trim()) return;
    this.busy = true;
    try {
      await this.api.request(`/events/${this.slug}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: this.cancelReason.trim() }),
      });
      this.cancelOpen = false;
      await this.reload();
    } finally { this.busy = false; }
  }

  private async reload(): Promise<void> {
    this.e = await this.api.request<any>(`/events/${this.slug}`);
    const regs = await this.api.request<any[]>(`/events/${this.slug}/registrations`);
    this.waiting = regs.filter(r => r.status === 'waitlisted').length;
    this.pending = regs.filter(r => r.status === 'pending_approval').length;
    this.arrived = regs.filter(r => r.status === 'checked_in').length;
  }
}

import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ManageBaseComponent } from './manage-base';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ActivatedRoute, Router } from '@angular/router';

/** /event/<slug>/manage/registration — capacity, approval, registration. */
@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    @if (loading()) {
      <div class="skeleton" style="height:360px"></div>
    } @else if (notFound()) {
      <div class="nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </div>
    } @else if (event(); as ev) {
      <div class="head">
        <h1 class="h1">Registration</h1>
        <a class="crumb" [routerLink]="['/event', ev.slug, 'manage', 'overview']">← {{ ev.title }}</a>
      </div>

      <section class="setting">
        <div>
          <span class="setting-label">Capacity</span>
          <p class="caption" [class.refusal]="!!capacityRefusal()">{{ capacityRefusal() || captionText() }}</p>
        </div>
        <div class="stepper">
          <button class="btn btn-secondary btn-small" type="button" (click)="stepAndSave(-1)" aria-label="Fewer seats">−</button>
          <input class="stepper-input" type="number" min="1" max="500" [ngModel]="capacity()" (ngModelChange)="capacity.set($any($event))" (blur)="saveCapacity()" aria-label="Capacity" />
          <button class="btn btn-secondary btn-small" type="button" (click)="stepAndSave(1)" aria-label="More seats">+</button>
        </div>
      </section>

      <section class="setting">
        <div><span class="setting-label">Approval</span><p class="caption">Every request waits for you.</p></div>
        <label class="switch">
          <input type="checkbox" [ngModel]="ev.approval_required" (ngModelChange)="toggleApproval($event)" role="switch" [attr.aria-checked]="ev.approval_required" />
          <span class="track" aria-hidden="true"><span class="thumb"></span></span>
        </label>
      </section>

      <section class="setting">
        <div><span class="setting-label">Waitlist Enabled</span><p class="caption">Guests queue when the event fills.</p></div>
        <label class="switch">
          <input type="checkbox" [ngModel]="ev.waitlist_enabled" (ngModelChange)="toggleWaitlist($event)" role="switch" [attr.aria-checked]="ev.waitlist_enabled" />
          <span class="track" aria-hidden="true"><span class="thumb"></span></span>
        </label>
      </section>

      <section class="setting">
        <div><span class="setting-label">Registration Open</span><p class="caption">{{ ev.state === 'registration_closed' ? 'Closed: nobody new can register.' : 'Open: new guests can register now.' }}</p></div>
        <label class="switch">
          <input type="checkbox" [ngModel]="ev.state === 'published'" (ngModelChange)="toggleRegistration($event)" role="switch" [attr.aria-checked]="ev.state === 'published'" />
          <span class="track" aria-hidden="true"><span class="thumb"></span></span>
        </label>
      </section>

      @if (ev.state !== 'cancelled') {
        <section class="danger-zone">
          <div><span class="setting-label">Cancel this event</span><p class="caption">Guests holding a place are mailed your words.</p></div>
          <button class="btn btn-danger" type="button" (click)="cancelOpen.set(true)">Cancel Event…</button>
        </section>
      }

      @if (cancelOpen()) {
        <div class="scrim" (click)="cancelOpen.set(false)" (keydown.escape)="cancelOpen.set(false)">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cx-title" (click)="$event.stopPropagation()">
            <h2 class="dialog-h" id="cx-title">Cancel “{{ ev.title }}”?</h2>
            <p class="dialog-p">Every guest still holding a place is mailed at once. The page keeps its address and shows your reason instead of the panel.</p>
            <div class="field">
              <label for="reason">Reason</label>
              <textarea id="reason" rows="3" [(ngModel)]="reason" placeholder="Tell your guests why, in your own words."></textarea>
            </div>
            <div class="dialog-actions">
              <button class="btn btn-secondary" type="button" (click)="cancelOpen.set(false)">Keep the event</button>
              <button class="btn btn-danger" type="button" [disabled]="!reason.trim()" (click)="doCancel()">Cancel the event</button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0; }
    .crumb { font-size: 14px; color: var(--muted); text-decoration: none; }
    .setting { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 20px 0; border-top: 1px solid var(--divider); }
    .setting-label { font-size: 16px; line-height: 24px; font-weight: 500; display: block; }
    .caption { font-size: 13px; line-height: 16px; color: var(--muted); margin: 4px 0 0; }
    .caption.refusal { color: #b3231c; }
    .stepper { display: flex; gap: 8px; align-items: center; }
    .stepper-input { width: 76px; text-align: center; border-radius: 4px; border: 1px solid var(--ink-08); min-height: 44px; font-size: 16px; padding: 8px; background: var(--paper); color: var(--ink); }
    .switch { position: relative; display: inline-flex; }
    .switch input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
    .track { width: 52px; height: 32px; border-radius: 100px; background: var(--fill-disabled); display: inline-flex; align-items: center; padding: 3px; }
    .thumb { width: 26px; height: 26px; border-radius: 100%; background: #ffffff; box-shadow: rgba(0,0,0,.2) 0 1px 3px; }
    .switch input:checked + .track { background: var(--ink); }
    .switch input:checked + .track .thumb { transform: translateX(20px); }
    .switch input:focus-visible + .track { outline: var(--focus-ring); outline-offset: 2px; }
    .danger-zone { padding: 20px 0; border-top: 1px solid var(--divider); display: flex; justify-content: space-between; align-items: center; gap: 24px; }
    .dialog-h { font-size: 17px; line-height: 22px; margin: 0 0 8px; font-weight: 600; }
    .dialog-p { font-size: 14px; line-height: 21px; color: var(--muted); margin: 0 0 16px; }
    .dialog { display: flex; flex-direction: column; gap: 12px; }
    .dialog-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .nf { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
  `],
})
export class ManageRegistrationComponent extends ManageBaseComponent {
  capacity = signal(20);
  capacityRefusal = signal<string | null>(null);
  cancelOpen = signal(false);
  reason = '';

  constructor(api: Api, auth: Auth, route: ActivatedRoute, router: Router) { super(api, auth, route, router); }

  override async load() {
    await super.load();
    this.capacity.set(this.event()?.capacity ?? 20);
  }

  captionText() { return this.counts().confirmed + ' of ' + (this.event()?.capacity ?? 0) + ' seats taken.'; }

  async stepAndSave(d: number) {
    this.capacity.set(Math.max(1, Math.min(500, this.capacity() + d)));
    await this.saveCapacity();
  }

  async saveCapacity() {
    const ev = this.event();
    if (!ev) return;
    this.capacityRefusal.set(null);
    const { status, body } = await this.api.patch<any>(`/events/${this.slug}`, { capacity: this.capacity() });
    if (status === 200) {
      const moved = (body as any)?.promoted_count ?? 0;
      if (moved > 0) this.api.flash(`${moved} waiting guest${moved > 1 ? 's were' : ' was'} moved to a seat.`, 'success');
      else this.api.flash(`Capacity is now ${this.capacity()}.`, 'success');
      await this.load();
    } else {
      this.capacityRefusal.set((body as any)?.message || `That capacity didn't take. Try another number.`);
      this.capacity.set(ev.capacity);
    }
  }

  async toggleApproval(on: boolean) {
    const { status, body } = await this.api.patch<any>(`/events/${this.slug}`, { approval_required: on });
    if (status === 200) { this.api.flash(on ? `Approval is on. Requests will wait for you.` : `Approval is off. Guests register outright.`, 'info'); await this.load(); }
    else this.api.flash((body as any)?.message || `That switch didn't move.`, 'danger');
  }

  async toggleWaitlist(on: boolean) {
    const { status, body } = await this.api.patch<any>(`/events/${this.slug}`, { waitlist_enabled: on });
    if (status === 200) { this.api.flash(on ? `The waiting list is on.` : `The waiting list is off.`, 'info'); await this.load(); }
    else this.api.flash((body as any)?.message || `That switch didn't move.`, 'danger');
  }

  async toggleRegistration(open: boolean) {
    const state = open ? 'published' : 'registration_closed';
    const { status, body } = await this.api.patch<any>(`/events/${this.slug}`, { state });
    if (status === 200) {
      this.api.flash(open ? `Registration is open again.` : `Registration is closed. The public panel says so now.`, 'info');
      await this.load();
    } else {
      this.api.flash((body as any)?.message || `That switch didn't move.`, 'danger');
      await this.load();
    }
  }

  async doCancel() {
    const { status, body } = await this.api.post<any>(`/events/${this.slug}/cancel`, { reason: this.reason.trim() });
    if (status === 200) {
      this.cancelOpen.set(false);
      this.api.flash(`The event is cancelled and every guest has been mailed.`, 'success');
      await this.load();
    } else {
      this.api.flash((body as any)?.message || `That didn't go through.`, 'danger');
    }
  }
}

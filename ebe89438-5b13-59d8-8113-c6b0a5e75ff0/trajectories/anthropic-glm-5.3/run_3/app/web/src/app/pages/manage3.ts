import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, AuthService, EventItem } from '../api';
import { NoticeService } from '../notice';
import { StatusPillComponent, NotFoundComponent } from './bits';

/** /event/<slug>/manage/registration: capacity, approval, waitlist, open. */
@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusPillComponent, NotFoundComponent],
  template: `
    @if (denied) { <app-not-found /> } @else if (event) {
      <nav class="tabs" aria-label="Manage this event">
        <a [routerLink]="['/event', slug, 'manage', 'overview']">Overview</a>
        <a [routerLink]="['/event', slug, 'manage', 'guests']">Guests</a>
        <a [routerLink]="['/event', slug, 'manage', 'registration']" class="on" aria-current="page">Registration</a>
      </nav>
      <h1 class="screen-title">Registration</h1>

      <div class="settings">
        <div class="setting">
          <div class="setting-text">
            <label class="setting-label" for="cap">Capacity</label>
            <span class="field-hint" role="status">{{ capHint }}</span>
          </div>
          <div class="stepper-wrap">
            <button type="button" class="step" (click)="bump(-10)" aria-label="Decrease capacity by ten">−10</button>
            <button type="button" class="step" (click)="bump(-1)" aria-label="Decrease capacity by one">−</button>
            <input id="cap" class="stepper" type="number" min="1" max="500" [ngModel]="draftCap" (ngModelChange)="draftCap = $event" />
            <button type="button" class="step" (click)="bump(1)" aria-label="Increase capacity by one">+</button>
            <button type="button" class="step" (click)="bump(10)" aria-label="Increase capacity by ten">+10</button>
            <button type="button" class="btn btn-primary btn-small" (click)="saveCap()" [disabled]="savingCap || draftCap === event!.capacity">Save</button>
          </div>
        </div>

        <div class="setting">
          <div class="setting-text">
            <span class="setting-label" id="appr-l">Approval required</span>
            <span class="field-hint">Guests ask to join and you decide.</span>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="event!.approval_required"
                  [class.on]="event!.approval_required" (click)="toggle('approval_required', !event!.approval_required)"
                  [attr.aria-labelledby]="'appr-l'"><span class="knob"></span><span class="sr-only">Approval required</span></button>
        </div>

        <div class="setting">
          <div class="setting-text">
            <span class="setting-label" id="wl-l">Waiting list</span>
            <span class="field-hint">Full events take a queue instead of a refusal.</span>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="event!.waitlist_enabled"
                  [class.on]="event!.waitlist_enabled" (click)="toggle('waitlist_enabled', !event!.waitlist_enabled)"
                  [attr.aria-labelledby]="'wl-l'"><span class="knob"></span><span class="sr-only">Waiting list</span></button>
        </div>

        <div class="setting">
          <div class="setting-text">
            <span class="setting-label" id="reg-l">Registration Open</span>
            <span class="field-hint">Turning it off closes the public panel and changes nobody's place.</span>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="regOpen"
                  [class.on]="regOpen" (click)="toggleRegistration()" [attr.aria-labelledby]="'reg-l'">
            <span class="knob"></span><span class="sr-only">Registration Open</span></button>
        </div>

        @if (event!.state !== 'cancelled') {
          <div class="setting danger-zone">
            <div class="setting-text">
              <span class="setting-label">Call the event off</span>
              <span class="field-hint">Every guest still holding a place is mailed your reason. This cannot be undone.</span>
            </div>
            <button type="button" class="btn btn-ghost cancel-open" (click)="cancelOpen = true">Cancel Event</button>
          </div>
        }
      </div>

      @if (cancelOpen) {
        <div class="scrim" (click)="cancelOpen = false" role="presentation">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ce-h" (click)="$event.stopPropagation()">
            <h2 id="ce-h" class="dlg-title">Call {{ event!.title }} off?</h2>
            <p class="dlg-body">Every guest still holding a place is mailed your reason word for word, and the page keeps its address.</p>
            <div class="field">
              <label for="reason">Reason</label>
              <textarea id="reason" rows="3" [(ngModel)]="reason" name="reason"></textarea>
            </div>
            <div class="dlg-actions">
              <button type="button" class="btn btn-secondary" (click)="cancelOpen = false">Keep the event</button>
              <button type="button" class="btn btn-danger" [disabled]="!reason.trim() || cancelling" (click)="doCancel()">Cancel Event</button>
            </div>
          </div>
        </div>
      }
    } @else { <div class="skeleton" style="height:200px"></div> }
  `,
  styles: [`
    .tabs { display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--divider); }
    .tabs a { padding: 12px 16px; font-size: 15px; line-height: 22px; color: var(--ink-64); border-bottom: 2px solid transparent; }
    .tabs a.on { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
    .settings { display: flex; flex-direction: column; }
    .setting { display: flex; align-items: center; gap: 24px; padding: 24px 0; border-bottom: 1px solid var(--divider); flex-wrap: wrap; }
    .setting-text { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 240px; }
    .setting-label { font-size: 16px; line-height: 24px; font-weight: 500; }
    .stepper-wrap { display: flex; align-items: center; gap: 6px; }
    .stepper { width: 78px; border-radius: 4px; border: 1px solid var(--ink-08); padding: 10px 8px; min-height: 44px; text-align: center; }
    .step { border: 1px solid var(--ink-08); border-radius: 6px; min-width: 40px; min-height: 44px; background: var(--ink-04); color: var(--ink-64); }
    .step:hover { background: var(--ink-64); color: var(--paper); }
    .switch { width: 52px; height: 32px; border-radius: 100px; background: var(--ink-04); border: 1px solid var(--ink-08); position: relative; }
    .switch.on { background: var(--ink); }
    .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 100%; background: var(--paper); box-shadow: rgba(0,0,0,.2) 0 1px 3px; transition: transform .3s var(--ease); }
    .switch.on .knob { transform: translateX(20px); }
    .danger-zone .setting-label { color: var(--danger); }
    .dlg-title { font-size: 17px; line-height: 22px; font-weight: 600; margin-bottom: 8px; }
    .dlg-body { font-size: 15px; line-height: 22px; color: var(--ink-64); margin-bottom: 16px; }
    .dlg-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 649px) { .setting { align-items: flex-start; flex-direction: column; } }
  `],
})
export class ManageRegistrationComponent implements OnInit {
  event: EventItem | null = null;
  denied = false;
  slug = '';
  draftCap = 0;
  savingCap = false;
  cancelOpen = false;
  cancelling = false;
  reason = '';
  movedNotice = '';
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private notice = inject(NoticeService);
  private auth = inject(AuthService);

  get regOpen() { return this.event?.state === 'published'; }
  get capHint() {
    if (!this.event) return '';
    const held = this.event.confirmed_count ?? 0;
    if (this.movedNotice) return this.movedNotice;
    if (this.draftCap < held) return `You already have ${held} guests confirmed.`;
    return `${held} of ${this.event.capacity} seats taken.`;
  }

  ngOnInit() {
    this.slug = this.route.parent?.snapshot.paramMap.get('slug') ?? '';
    this.auth.account$.subscribe(a => { if (a?.role === 'guest') this.denied = true; });
    this.api.getEvent(this.slug).subscribe(e => { this.event = e; this.draftCap = e.capacity; }, () => (this.denied = true));
  }

  bump(d: number) { this.draftCap = Math.min(500, Math.max(1, (this.draftCap || 0) + d)); }

  async saveCap() {
    if (!this.event) return;
    this.savingCap = true;
    this.movedNotice = '';
    try {
      const out: any = await this.api.pr(this.api.patchEvent(this.slug, { capacity: this.draftCap }));
      this.event = { ...this.event, capacity: out.capacity };
      const moved = out.moved_from_waitlist ?? 0;
      if (moved > 0) {
        this.movedNotice = `${moved} ${moved === 1 ? 'person was' : 'people were'} moved from the waiting list to a seat.`;
        this.notice.polite(this.movedNotice, 'success');
      } else {
        this.notice.polite('Capacity saved.', 'success');
      }
      this.api.getEvent(this.slug).subscribe(e => (this.event = e));
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
    finally { this.savingCap = false; }
  }

  async toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean) {
    if (!this.event) return;
    try {
      await this.api.pr(this.api.patchEvent(this.slug, { [field]: value }));
      this.event = { ...this.event, [field]: value } as EventItem;
      this.notice.polite('Saved.', 'success');
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
  }

  async toggleRegistration() {
    if (!this.event) return;
    const target = this.event.state === 'published' ? 'registration_closed' : 'published';
    try {
      await this.api.pr(this.api.patchEvent(this.slug, { state: target }));
      this.event = { ...this.event, state: target } as EventItem;
      this.notice.polite(target === 'registration_closed' ? 'Registration is closed.' : 'Registration is open again.', 'info');
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
  }

  async doCancel() {
    if (!this.reason.trim()) return;
    this.cancelling = true;
    try {
      await this.api.pr(this.api.cancelEvent(this.slug, this.reason.trim()));
      this.notice.polite('The event is cancelled and every guest holding a place has been mailed.', 'info');
      this.cancelOpen = false;
      this.api.getEvent(this.slug).subscribe(e => (this.event = e));
    } catch (e: any) { this.notice.show(e?.message ?? 'That did not go through.', 'danger'); }
    finally { this.cancelling = false; }
  }
}

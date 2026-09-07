import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import type { CommunityEvent } from '../types';

@Component({
  selector: 'app-manage-registration',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div class="skeleton title"></div><div class="skeleton block"></div>
    } @else if (event()) {
      <h1 class="screen-title">Registration settings</h1>
      <p class="caption">
        <a [routerLink]="['/', ev.slug]">{{ ev.title }}</a> · capacity {{ ev.capacity }}
      </p>

      <section class="setting-row">
        <div class="setting-text">
          <p class="setting-label">Capacity</p>
          <p class="caption">You already have {{ ev.confirmed_count }} guests confirmed.</p>
          @if (capacityRefusal()) { <p class="refusal">{{ capacityRefusal() }}</p> }
        </div>
        <div class="stepper">
          <button type="button" (click)="step(-10)" [disabled]="working()" aria-label="Ten fewer seats">−10</button>
          <button type="button" (click)="step(-1)" [disabled]="draftCapacity() <= 1 || working()" aria-label="One fewer seat">−</button>
          <span class="value" aria-live="polite">{{ draftCapacity() }}</span>
          <button type="button" (click)="step(1)" [disabled]="draftCapacity() >= 500 || working()" aria-label="One more seat">+</button>
          <button type="button" class="btn secondary small" (click)="saveCapacity()" [disabled]="draftCapacity() === ev.capacity || working()">Save</button>
        </div>
      </section>

      <section class="setting-row">
        <div class="setting-text">
          <p class="setting-label">Approval required</p>
          <p class="caption">Each request waits for you before a seat is held.</p>
        </div>
        <button type="button" class="switch" role="switch" [attr.aria-checked]="ev.approval_required"
                [disabled]="working()" (click)="toggleApproval()" aria-label="Approval required"></button>
      </section>

      <section class="setting-row">
        <div class="setting-text">
          <p class="setting-label">Waiting list</p>
          <p class="caption">A full event takes a waiting list instead of refusing.</p>
        </div>
        <button type="button" class="switch" role="switch" [attr.aria-checked]="ev.waitlist_enabled"
                [disabled]="working()" (click)="toggleWaitlist()" aria-label="Waiting list enabled"></button>
      </section>

      <section class="setting-row">
        <div class="setting-text">
          <p class="setting-label">Registration Open</p>
          <p class="caption">Off means the public page shows Registration Is Closed.</p>
        </div>
        <button type="button" class="switch" role="switch" [attr.aria-checked]="ev.state === 'published'"
                [disabled]="working() || ev.state === 'cancelled'" (click)="toggleRegistration()" aria-label="Registration open"></button>
      </section>

      <section class="danger-zone">
        <h2 class="overline">The end of it</h2>
        <button class="btn quiet" type="button" (click)="openCancel()" [disabled]="ev.state === 'cancelled'">Cancel this event</button>
      </section>
    }

    @if (cancelling()) {
      <div class="scrim" (click)="closeCancel()" role="presentation">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-dlg" (click)="$event.stopPropagation()">
          <h2 class="modal-title" id="cancel-dlg">Cancel this event?</h2>
          <p class="dlg-copy">Every guest still holding a place is emailed your words exactly as written. A cancellation cannot be undone.</p>
          <div class="field" [class.refused]="cancelRefusal()">
            <label for="cancel-reason">Reason</label>
            <textarea id="cancel-reason" [value]="reason()" (input)="reason.set($any($event.target).value)"
                      placeholder="Tell your guests what happened"></textarea>
            @if (cancelRefusal()) { <p class="refusal">{{ cancelRefusal() }}</p> }
          </div>
          <div class="dlg-actions">
            <button class="btn secondary" type="button" (click)="closeCancel()">Keep the event</button>
            <button class="btn danger" type="button" (click)="confirmCancel()" [disabled]="!reason().trim()">Cancel the event</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid var(--divider); padding: 20px 0; margin-top: 8px; }
    .setting-text { display: flex; flex-direction: column; gap: 4px; max-width: 420px; }
    .setting-label { margin: 0; font-size: 16px; line-height: 24px; }
    .refusal { color: var(--danger); font-size: 13px; line-height: 18px; margin: 0; }
    .danger-zone { margin-top: 32px; border-top: 1px solid var(--divider); padding-top: 20px; display: flex; flex-direction: column; gap: 12px; }
    .dlg-copy { color: var(--ink-2); }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
  `],
})
export class ManageRegistrationComponent {
  event = signal<CommunityEvent | null>(null);
  loading = signal(true);
  working = signal(false);
  draftCapacity = signal(0);
  capacityRefusal = signal<string | null>(null);
  cancelling = signal(false);
  reason = signal('');
  cancelRefusal = signal<string | null>(null);

  constructor(private api: ApiService, private route: ActivatedRoute, private notice: NoticeService) {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') ?? ''));
  }

  load(slug: string) {
    this.loading.set(true);
    this.api
      .event(slug, true)
      .then((ev) => {
        this.event.set(ev);
        this.draftCapacity.set(ev.capacity);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }

  get ev() {
    return this.event()!;
  }

  step(delta: number) {
    const ev = this.event();
    if (!ev) return;
    const next = Math.max(1, Math.min(500, this.draftCapacity() + delta));
    this.draftCapacity.set(next);
    if (next < ev.confirmed_count) {
      this.capacityRefusal.set(`You already have ${ev.confirmed_count} guests confirmed.`);
    } else {
      this.capacityRefusal.set(null);
    }
  }

  async saveCapacity() {
    const ev = this.event();
    if (!ev) return;
    if (this.draftCapacity() < ev.confirmed_count) {
      this.capacityRefusal.set(`You already have ${ev.confirmed_count} guests confirmed.`);
      return;
    }
    this.working.set(true);
    try {
      const updated = await this.api.patchEvent(ev.slug, { capacity: this.draftCapacity() });
      const moved = Math.max(0, updated.confirmed_count - ev.confirmed_count);
      if (moved > 0) this.notice.success(`${moved} guest${moved === 1 ? '' : 's'} moved from the waiting list to a seat.`);
      else this.notice.success('Capacity saved.');
      this.event.set(updated);
    } catch (e) {
      this.capacityRefusal.set((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  async toggleApproval() {
    const ev = this.event();
    if (!ev) return;
    this.working.set(true);
    try {
      const updated = await this.api.patchEvent(ev.slug, { approval_required: !ev.approval_required });
      this.event.set(updated);
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  async toggleWaitlist() {
    const ev = this.event();
    if (!ev) return;
    this.working.set(true);
    try {
      const updated = await this.api.patchEvent(ev.slug, { waitlist_enabled: !ev.waitlist_enabled });
      this.event.set(updated);
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  async toggleRegistration() {
    const ev = this.event();
    if (!ev) return;
    const next = ev.state === 'published' ? 'registration_closed' : 'published';
    this.working.set(true);
    try {
      const updated = await this.api.patchEvent(ev.slug, { state: next });
      this.event.set(updated);
      this.notice.info(next === 'registration_closed' ? 'Registration is closed.' : 'Registration is open again.');
    } catch (e) {
      this.notice.danger((e as ApiFailure).message);
    } finally {
      this.working.set(false);
    }
  }

  openCancel() {
    this.reason.set('');
    this.cancelRefusal.set(null);
    this.cancelling.set(true);
  }

  closeCancel() {
    this.cancelling.set(false);
  }

  async confirmCancel() {
    const ev = this.event();
    if (!ev) return;
    if (!this.reason().trim()) {
      this.cancelRefusal.set('Tell your guests why the event is off.');
      return;
    }
    try {
      const updated = await this.api.cancelEvent(ev.slug, this.reason().trim());
      this.event.set(updated);
      this.closeCancel();
      this.notice.info('The event is cancelled and every guest has been emailed.');
    } catch (e) {
      this.cancelRefusal.set((e as ApiFailure).message);
    }
  }
}

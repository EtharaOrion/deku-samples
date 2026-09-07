import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Shell } from '../layout/shell';
import { Api, ApiError } from '../core/api';
import { NotFoundEmbed } from './not-found-embed';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'cc-manage-registration',
  standalone: true,
  imports: [FormsModule, Shell, NotFoundEmbed],
  template: `
  <cc-shell>
    @if (loading) {
      <div class="stack-16">@for (s of [1,2,3,4]; track s) { <div class="skeleton skeleton-text"></div> }</div>
    } @else if (!e) {
      <cc-not-found-embed></cc-not-found-embed>
    } @else {
      <h1 class="screen-title">{{ e.title }} · registration</h1>

      <section class="settings">
        <div class="set">
          <div class="spread">
            <p class="set-label">Capacity</p>
            <div class="row">
              <button class="btn btn-sm btn-secondary" type="button" (click)="bump(-1)" aria-label="Decrease capacity">−</button>
              <input class="field cap" type="number" min="1" max="500" [(ngModel)]="capacity" name="capacity"
                     aria-label="Capacity">
              <button class="btn btn-sm btn-secondary" type="button" (click)="bump(1)" aria-label="Increase capacity">+</button>
            </div>
          </div>
          @if (capError) { <p class="field-error" role="alert">{{ capError }}</p> }
          @else { <p class="field-caption">You already have {{ e.confirmed_count }} guests confirmed.</p> }
        </div>

        <div class="set spread">
          <p class="set-label">Approval required</p>
          <input type="checkbox" [checked]="e.approval_required" (change)="toggle('approval_required', $any($event.target).checked)"
                 aria-label="Approval required" [attr.aria-describedby]="'approval-cap'">
        </div>

        <div class="set spread">
          <p class="set-label">Waiting list</p>
          <input type="checkbox" [checked]="e.waitlist_enabled" (change)="toggle('waitlist_enabled', $any($event.target).checked)"
                 aria-label="Waiting list enabled">
        </div>

        <div class="set spread">
          <div>
            <p class="set-label">Registration Open</p>
            <p class="field-caption">{{ e.state === 'registration_closed' ? 'Guests cannot register while this is off.' : 'Guests can register right now.' }}</p>
          </div>
          <input type="checkbox" [checked]="e.state !== 'registration_closed'" (change)="toggleRegistration($any($event.target).checked)"
                 aria-label="Registration open">
        </div>
      </section>

      @if (notice) { <p class="notice-inline" role="status" aria-live="polite">{{ notice }}</p> }
    }
  </cc-shell>`,
  styles: [`
    .settings { border: 1px solid var(--divider); border-radius: 12px; max-width: 640px;
      background: var(--panel); }
    .set { padding: 16px 20px; border-bottom: 1px solid var(--divider); }
    .set:last-child { border-bottom: 0; }
    .set-label { font-size: 16px; line-height: 24px; margin: 0 0 4px; }
    .cap { width: 90px; text-align: center; }
    .notice-inline { margin-top: 20px; padding: 12px 16px; border-left: 4px solid var(--success);
      background: var(--panel); border-radius: 8px; max-width: 640px; font-size: 15px; line-height: 22px; }
  `],
})
export class ManageRegistration implements OnInit {
  slug = '';
  loading = true;
  e: any = null;
  capacity = 0;
  capError = '';
  notice = '';

  constructor(private route: ActivatedRoute, private api: Api) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = m.get('slug') ?? '';
      await this.load();
    });
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.e = await this.api.request<any>(`/events/${this.slug}`);
      this.capacity = this.e.capacity;
      this.capError = '';
    } catch (err) {
      if (!((err as ApiError).status === 404)) throw err;
      this.e = null;
    } finally { this.loading = false; }
  }

  bump(d: number): void {
    const next = Math.max(1, Math.min(500, this.capacity + d));
    if (next === this.capacity) return;
    this.capacity = next;
    this.saveCapacity();
  }

  async saveCapacity(): Promise<void> {
    this.capError = '';
    try {
      const r = await this.api.request<any>(`/events/${this.slug}`, {
        method: 'PATCH', body: JSON.stringify({ capacity: this.capacity }),
      });
      this.e = r;
      // A raise that moved the waiting list says how many.
      this.notice = r.promoted_count
        ? `${r.promoted_count} guest${r.promoted_count > 1 ? 's were' : ' was'} moved from the waiting list to a seat.`
        : '';
    } catch (err) {
      const e2 = err as ApiError;
      this.capError = e2.fields?.['capacity'] ?? e2.message;
      this.capacity = this.e.capacity;
    }
  }

  async toggle(field: 'approval_required' | 'waitlist_enabled', value: boolean): Promise<void> {
    try {
      this.e = await this.api.request<any>(`/events/${this.slug}`, {
        method: 'PATCH', body: JSON.stringify({ [field]: value }),
      });
    } catch (err) { this.notice = (err as ApiError).message; }
  }

  async toggleRegistration(open: boolean): Promise<void> {
    try {
      this.e = await this.api.request<any>(`/events/${this.slug}`, {
        method: 'PATCH', body: JSON.stringify({ state: open ? 'published' : 'registration_closed' }),
      });
      this.notice = open ? 'Registration is open again.' : 'Registration is closed. Nobody was mailed.';
    } catch (err) { this.notice = (err as ApiError).message; }
  }
}

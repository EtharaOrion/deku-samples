import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';
import { stateWord } from '../categories';
import type { CommunityEvent } from '../types';

@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (loading()) {
      <div class="skeleton title"></div><div class="skeleton block"></div>
    } @else if (event()) {
      <div class="head">
        <h1 class="screen-title">{{ ev.title }}</h1>
        <span class="pill {{ ev.state === 'cancelled' ? 'danger' : ev.state === 'registration_closed' ? 'warning' : 'success' }}">
          <span class="dot"></span>{{ state(ev.state) }}
        </span>
      </div>
      <div class="address-row">
        <span class="code address">{{ url(ev) }}</span>
        <button class="btn secondary small" type="button" (click)="copy(ev)">Copy Link</button>
      </div>

      @if (ev.state === 'cancelled') {
        <div class="notice-card">
          <h2 class="modal-title">This event is cancelled</h2>
          <p class="body-copy">{{ ev.cancel_reason }}</p>
        </div>
      } @else {
        <dl class="counters">
          <div class="counter"><dt>Confirmed</dt><dd>{{ ev.confirmed_count }} / {{ ev.capacity }}</dd></div>
          <div class="counter"><dt>Waiting</dt><dd>{{ counts().waiting }}</dd></div>
          <div class="counter"><dt>Awaiting approval</dt><dd>{{ counts().pending }}</dd></div>
          <div class="counter"><dt>Arrived</dt><dd>{{ counts().arrived }}</dd></div>
        </dl>

        <section class="todo">
          <h2 class="overline">Next things to do</h2>
          <ul class="todo-list">
            @if (counts().pending > 0) {
              <li><a [routerLink]="['/event', ev.slug, 'manage', 'guests']">Decide on {{ counts().pending }} request{{ counts().pending === 1 ? '' : 's' }}</a></li>
            }
            @if (counts().waiting > 0) {
              <li>Watch the waiting list — the head takes any seat that frees</li>
            }
            <li><a [routerLink]="['/event', ev.slug, 'manage', 'guests']">Check tickets in at the door</a></li>
            @if (ev.state === 'registration_closed') {
              <li><a [routerLink]="['/event', ev.slug, 'manage', 'registration']">Registration is closed — reopen it</a></li>
            }
          </ul>
        </section>
      }

      <nav class="sisters" aria-label="Manage">
        <a class="btn secondary" [routerLink]="['/event', ev.slug, 'manage', 'guests']">Guests, queue and door</a>
        <a class="btn secondary" [routerLink]="['/event', ev.slug, 'manage', 'registration']">Capacity and approval</a>
        <a class="btn quiet" [routerLink]="['/', ev.slug]">View public page</a>
      </nav>
    }
  `,
  styles: [
    `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .address-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
    .address { font-size: 14px; padding: 6px 10px; }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 32px 0 0; }
    .counter { border-top: 1px solid var(--divider); padding-top: 12px; }
    .counter dt { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--muted); }
    .counter dd { margin: 4px 0 0; font-size: 22px; line-height: 26px; font-weight: 700; }
    .todo { margin-top: 32px; }
    .todo-list { margin: 12px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
    .sisters { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; }
    .notice-card { margin-top: 24px; padding: 24px; border-left: 4px solid var(--danger); background: var(--paper-2); border-radius: 12px; }
    @media (max-width: 900px) { .counters { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ManageOverviewComponent {
  event = signal<CommunityEvent | null>(null);
  counts = signal({ waiting: 0, pending: 0, arrived: 0 });
  loading = signal(true);

  constructor(private api: ApiService, private route: ActivatedRoute, private notice: NoticeService) {
    this.route.paramMap.subscribe((p) => this.load(p.get('slug') ?? ''));
  }

  private load(slug: string) {
    this.loading.set(true);
    Promise.all([this.api.event(slug, true), this.api.guestList(slug).catch(() => [])])
      .then(([ev, rows]) => {
        this.event.set(ev);
        this.counts.set({
          waiting: rows.filter((r) => r.status === 'waitlisted').length,
          pending: rows.filter((r) => r.status === 'pending_approval').length,
          arrived: rows.filter((r) => r.status === 'checked_in').length,
        });
        this.loading.set(false);
      })
      .catch((e: ApiFailure) => {
        this.loading.set(false);
        if (e.status === 404) this.route.snapshot; // shell renders not-found via guard
      });
  }

  get ev() {
    return this.event()!;
  }

  state(s: string): string {
    return stateWord(s);
  }

  url(ev: CommunityEvent): string {
    return `${location.origin}/${ev.slug}`;
  }

  async copy(ev: CommunityEvent) {
    try {
      await navigator.clipboard.writeText(this.url(ev));
      this.notice.success('Link copied.');
    } catch {
      this.notice.info(this.url(ev));
    }
  }
}

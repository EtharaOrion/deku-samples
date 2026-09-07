import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ManageBaseComponent } from './manage-base';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { ActivatedRoute, Router } from '@angular/router';

/** /event/<slug>/manage/overview — the dashboard. */
@Component({
  selector: 'app-manage-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="skeleton" style="height:320px"></div>
    } @else if (notFound()) {
      <div class="nf">
        <h1 class="nf-title">404 · Page Not Found</h1>
        <p>Looks like you discovered a page that doesn't exist or you don't have access to.</p>
        <a class="btn btn-primary" routerLink="/">Return Home</a>
      </div>
    } @else if (event(); as ev) {
      <div class="mast">
        <div class="mast-left">
          <h1 class="h1">{{ ev.title }}</h1>
          <span [class]="'pill ' + statePill(ev.state)">{{ stateWord(ev.state) }}</span>
        </div>
        <div class="addr">
          <code>/{{ ev.slug }}</code>
          <button class="btn btn-secondary btn-small" type="button" (click)="copy($event)">Copy Link</button>
        </div>
      </div>

      @if (ev.state === 'cancelled') {
        <div class="cancel-card" role="status">
          <h2 class="cancel-h">This event is cancelled</h2>
          <p class="cancel-p">You wrote: “{{ ev.cancel_reason }}”</p>
        </div>
      } @else {
        <div class="counters">
          <div class="counter"><span class="overline">Confirmed</span><span class="num">{{ counts().confirmed }}<span class="denom">/{{ ev.capacity }}</span></span></div>
          <div class="counter"><span class="overline">Waiting</span><span class="num">{{ counts().waiting }}</span></div>
          <div class="counter"><span class="overline">Awaiting approval</span><span class="num">{{ counts().pending }}</span></div>
          <div class="counter"><span class="overline">Arrived</span><span class="num">{{ counts().arrived }}</span></div>
        </div>

        <section class="todo">
          <h2 class="todo-h">Next things to do</h2>
          <ol class="todo-list">
            @if (counts().pending > 0) { <li><a [routerLink]="['/event', ev.slug, 'manage', 'guests']">Decide on {{ counts().pending }} waiting request{{ counts().pending > 1 ? 's' : '' }}</a></li> }
            @if (ev.remaining === 0) { <li>The event is full. Consider raising capacity.</li> }
            @if (ev.state === 'published') { <li>Registration is open. Share the link above.</li> }
            @if (ev.state === 'registration_closed') { <li>Registration is closed. Reopen it from the registration screen.</li> }
            @if (counts().confirmed > 0) { <li><a [routerLink]="['/event', ev.slug, 'manage', 'guests']">Check tickets in at the door</a></li> }
          </ol>
        </section>
      }

      <nav class="sisters" aria-label="Manage this event">
        <a class="btn btn-secondary" [routerLink]="['/event', ev.slug, 'manage', 'guests']">Guests, queue and door</a>
        <a class="btn btn-secondary" [routerLink]="['/event', ev.slug, 'manage', 'registration']">Capacity and approval</a>
        <a class="btn btn-quiet" [routerLink]="['/' + ev.slug]">See the public page</a>
      </nav>
    }
  `,
  styles: [`
    :host { display: block; }
    .mast { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 24px; }
    .mast-left { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0; }
    .addr { display: flex; gap: 8px; align-items: center; }
    .addr code { font-size: 14px; background: var(--paper-inset); padding: 8px 12px; border-radius: 4px; }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .counter { display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid var(--ink-08); border-radius: 12px; background: var(--paper); }
    .num { font-size: 22px; line-height: 26px; font-weight: 700; }
    .denom { font-size: 14px; color: var(--muted); font-weight: 500; }
    .todo-h { font-size: 16px; line-height: 25.6px; font-weight: 600; margin: 0 0 8px; }
    .todo-list { margin: 0 0 24px; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 15px; line-height: 22px; }
    .todo-list a { color: var(--blue); }
    .sisters { display: flex; gap: 12px; flex-wrap: wrap; }
    .cancel-card { border: 1px solid rgba(255,59,48,.4); background: rgba(255,59,48,.06); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .cancel-h { font-size: 17px; margin: 0 0 8px; }
    .cancel-p { font-size: 15px; line-height: 22px; margin: 0; }
    .nf { text-align: center; padding: 96px 24px; display: flex; flex-direction: column; gap: 16px; align-items: center; }
    .nf-title { font-family: var(--serif); font-size: 28px; margin: 0; }
    @media (max-width: 1000px) { .counters { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class ManageOverviewComponent extends ManageBaseComponent {
  constructor(api: Api, auth: Auth, route: ActivatedRoute, router: Router) { super(api, auth, route, router); }

  stateWord(s: string) { return ({ draft: 'Draft', published: 'Published', registration_closed: 'Registration closed', cancelled: 'Cancelled' } as any)[s] || s; }
  statePill(s: string) { return s === 'cancelled' ? 'pill-danger' : s === 'draft' ? 'pill-muted' : s === 'registration_closed' ? 'pill-warning' : 'pill-success'; }

  async copy(e: Event) {
    const url = `${location.origin}/${this.event()?.slug}`;
    try { await navigator.clipboard.writeText(url); this.api.flash(`Link copied to your clipboard.`, 'success'); }
    catch { this.api.flash(`The link is ${url}`, 'info'); }
  }
}

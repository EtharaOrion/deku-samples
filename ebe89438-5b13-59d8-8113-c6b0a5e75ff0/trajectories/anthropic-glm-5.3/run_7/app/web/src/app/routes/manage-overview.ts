import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Registration } from '../core/api';
import { statusWord } from '../core/tokens';
import { SignedShellComponent } from '../shells/signed-shell';
import { NotFoundComponent } from './not-found';
import { SkeletonComponent } from '../ui/skeleton';

@Component({
  selector: 'app-manage-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, RouterLink, SkeletonComponent, NotFoundComponent],
  template: `
    <app-signed-shell>
      @if (loading()) {
        <app-skeleton [count]="2" [height]="80" [art]="56" />
      } @else if (!event()) {
        <app-not-found />
      } @else {
        <header class="mast">
          <div class="left">
            <h1>{{ event()!.title }}</h1>
            <span class="pill" [attr.data-status]="event()!.state">{{ statusWord(event()!.state) }}</span>
          </div>
          <div class="right">
            <span class="addr" id="addr">{{ address() }}</span>
            <button type="button" class="btn btn-quiet btn-sm" (click)="copy()">Copy Link</button>
          </div>
        </header>

        @if (event()!.state === 'cancelled') {
          <section class="notice">
            <h2>This event has been cancelled</h2>
            <p class="reason">“{{ event()!.cancel_reason }}”</p>
          </section>
        } @else {
          <div class="counters">
            <div class="counter"><span class="overline">Confirmed</span><strong>{{ confirmed() }}<span class="of">/{{ event()!.capacity }}</span></strong></div>
            <div class="counter"><span class="overline">Waiting</span><strong>{{ waiting() }}</strong></div>
            <div class="counter"><span class="overline">Awaiting approval</span><strong>{{ pending() }}</strong></div>
            <div class="counter"><span class="overline">Arrived</span><strong>{{ arrived() }}</strong></div>
          </div>

          <section class="todo">
            <h2 class="overline">Next three things</h2>
            <ol class="steps">
              @for (s of todo(); track s) { <li>{{ s }}</li> }
            </ol>
          </section>
        }

        <nav class="links">
          <a class="btn btn-invert" [routerLink]="['/event/' + slug() + '/manage/guests']">Guests, queue and door</a>
          <a class="btn btn-invert" [routerLink]="['/event/' + slug() + '/manage/registration']">Capacity and approval</a>
        </nav>
      }
    </app-signed-shell>
  `,
  styles: [`
    .mast { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    h1 { font: 700 22px/26px var(--sans); }
    .right { display: flex; align-items: center; gap: 8px; }
    .addr { font-size: 13px; color: var(--muted); }
    .counters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .counter { padding: 16px; border-radius: var(--r-card); background: var(--panel); display: flex; flex-direction: column; gap: 4px; }
    .counter strong { font: 700 22px/26px var(--sans); }
    .of { font: 600 15px/20px var(--sans); color: var(--muted); }
    .notice { padding: 20px; border-radius: var(--r-card); background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.24); }
    .notice h2 { font: 700 16px/22px var(--sans); color: #a11710; }
    .reason { font-style: italic; }
    .todo { margin-bottom: 24px; }
    .steps { margin: 8px 0 0 20px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .links { display: flex; gap: 12px; flex-wrap: wrap; }
    @media (max-width: 999px) { .counters { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .counters { grid-template-columns: 1fr; } }
  `],
})
export class ManageOverviewComponent {
  private api = inject(Api);
  slug = input.required<string>();
  event = signal<any | null>(null);
  regs = signal<Registration[]>([]);
  loading = signal(true);

  statusWord = statusWord;

  ngOnInit() {
    this.api.event(this.slug()).subscribe({
      next: (e) => {
        this.event.set(e);
        this.api.registrations(this.slug()).subscribe({
          next: (r) => { this.regs.set(r); this.loading.set(false); },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  address() { return `${location.origin}/${this.slug()}`; }
  copy() {
    navigator.clipboard?.writeText(this.address()).then(
      () => this.api.notify('The address is copied.', 'success'),
      () => this.api.notify('Copy it from the line beside the button.', 'info'),
    );
  }

  confirmed = computed(() => this.regs().filter((r) => r.status === 'confirmed' || r.status === 'checked_in').length);
  waiting = computed(() => this.regs().filter((r) => r.status === 'waitlisted').length);
  pending = computed(() => this.regs().filter((r) => r.status === 'pending_approval').length);
  arrived = computed(() => this.regs().filter((r) => r.status === 'checked_in').length);

  todo = computed(() => {
    const out: string[] = [];
    if (this.pending()) out.push(`Approve or decline ${this.pending()} request${this.pending() === 1 ? '' : 's'}.`);
    if (this.waiting()) out.push(`Tell ${this.waiting()} waiting guest${this.waiting() === 1 ? '' : 's'} where they stand.`);
    if (this.event()?.state === 'draft') out.push('Publish the event so guests can find it.');
    if (this.event()?.state === 'registration_closed') out.push('Reopen registration when you are ready for more guests.');
    const left = (this.event()?.capacity ?? 0) - this.confirmed();
    if (left > 0 && this.event()?.state === 'published') out.push(`${left} seat${left === 1 ? '' : 's'} still open.`);
    out.push('Check tickets in at the door on the night.');
    return out.slice(0, 3);
  });
}

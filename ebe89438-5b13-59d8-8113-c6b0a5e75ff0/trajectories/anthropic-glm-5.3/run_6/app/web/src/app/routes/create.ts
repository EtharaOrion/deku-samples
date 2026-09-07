import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError, CalendarRecord } from '../api.service';
import { NoticeService } from '../notice.service';
import { AppShellComponent } from '../shell';
import { EventCoverComponent } from '../widgets';
import { CATEGORIES, CATEGORY_LABELS } from '../shared';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-create', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AppShellComponent, EventCoverComponent, NotFoundComponent],
  template: `
    @if (!allowed()) {
      <route-not-found></route-not-found>
    } @else {
      <app-shell>
        <div class="composer">
          <div class="art" aria-hidden="true">
            <div class="art-field">
              <div class="art-rotor"></div>
              <div class="art-glow"></div>
              <div class="art-backdrop"></div>
              <div class="art-cover">
                <event-cover [seed]="artSeed()" [title]="draft.title || 'Event Name'"></event-cover>
              </div>
            </div>
          </div>
          <div class="form">
            <h1 class="t-screen">Create an event</h1>
            <form (ngSubmit)="submit()" novalidate class="stack gap-24">
              <div class="field">
                <label for="ce-cal">Which calendar</label>
                <select id="ce-cal" name="calendar_slug" [(ngModel)]="draft.calendar_slug" required>
                  @for (c of cals(); track c.id) { <option [value]="c.slug">{{ c.name }}</option> }
                </select>
                <span class="field-hint">A calendar holds your events at one address.</span>
              </div>
              <div class="field">
                <label for="ce-public">Calendar visibility</label>
                <select id="ce-public" name="calendar_public" [(ngModel)]="calendarPublic">
                  <option [value]="true">Public calendar</option>
                  <option [value]="false">Private calendar</option>
                </select>
              </div>
              <div class="field" [class.invalid]="errField() === 'title'">
                <label for="ce-title">Name</label>
                <input id="ce-title" name="title" placeholder="Event Name" [ngModel]="draft.title" (ngModelChange)="setTitle($event)">
                @if (errField() === 'title') { <p class="field-error">{{ err() }}</p> }
              </div>
              <div class="two">
                <div class="field" [class.invalid]="errField() === 'starts_at'">
                  <label for="ce-start">Starts</label>
                  <input id="ce-start" name="starts_at" type="datetime-local" [(ngModel)]="draft.starts_at">
                  @if (errField() === 'starts_at') { <p class="field-error">{{ err() }}</p> }
                </div>
                <div class="field" [class.invalid]="errField() === 'ends_at'">
                  <label for="ce-end">Ends</label>
                  <input id="ce-end" name="ends_at" type="datetime-local" [(ngModel)]="draft.ends_at">
                  @if (errField() === 'ends_at') { <p class="field-error">{{ err() }}</p> }
                </div>
              </div>
              <div class="two">
                <div class="field">
                  <label for="ce-zone">Time zone</label>
                  <select id="ce-zone" name="time_zone" [(ngModel)]="draft.time_zone">
                    @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
                  </select>
                </div>
                <div class="field" [class.invalid]="errField() === 'city'">
                  <label for="ce-city">Where</label>
                  <input id="ce-city" name="city" placeholder="City" [(ngModel)]="draft.city">
                  @if (errField() === 'city') { <p class="field-error">{{ err() }}</p> }
                </div>
              </div>
              <div class="field">
                <label for="ce-cat">Category</label>
                <select id="ce-cat" name="category" [(ngModel)]="draft.category">
                  @for (c of categoryList; track c) { <option [value]="c">{{ labelOf(c) }}</option> }
                </select>
              </div>
              <div class="field">
                <label for="ce-desc">What it is about</label>
                <textarea id="ce-desc" name="description" [(ngModel)]="draft.description"
                  placeholder="A line or two a stranger would enjoy reading."></textarea>
              </div>

              <div class="setting">
                <div class="setting-copy">
                  <span>Capacity</span>
                  <span class="field-hint">Unlimited</span>
                </div>
                <div class="row">
                  <div class="stepper">
                    <button type="button" (click)="bump(-1)" aria-label="Fewer seats">−</button>
                    <span class="value" aria-live="polite">{{ draft.capacity }}</span>
                    <button type="button" (click)="bump(1)" aria-label="More seats">+</button>
                  </div>
                  <label class="row switch-line">
                    <input type="checkbox" [(ngModel)]="draft.waitlist_enabled" name="waitlist_enabled" class="sr-only"
                           role="switch" [attr.aria-checked]="draft.waitlist_enabled">
                    <span class="switch" [attr.aria-checked]="draft.waitlist_enabled"></span>
                    <span>Waitlist Enabled</span>
                  </label>
                </div>
              </div>

              <div class="setting">
                <div class="setting-copy">
                  <span>Approval</span>
                  <span class="field-hint">Each request waits for you</span>
                </div>
                <label class="row switch-line">
                  <input type="checkbox" [(ngModel)]="draft.approval_required" name="approval_required" class="sr-only"
                         role="switch" [attr.aria-checked]="draft.approval_required">
                  <span class="switch" [attr.aria-checked]="draft.approval_required"></span>
                  <span>Approval Required</span>
                </label>
              </div>

              <div class="setting">
                <div class="setting-copy">
                  <span>Theme</span>
                  <span class="field-hint">Seasonal</span>
                </div>
                <span class="theme-dot" aria-hidden="true"></span>
              </div>

              @if (err() && !errField()) { <p class="field-error" role="alert">{{ err() }}</p> }

              <div class="row">
                <button class="btn btn-primary" type="submit" [disabled]="busy()">
                  @if (busy()) { <svg class="spinner" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="30"></circle></svg> }
                  Create Event
                </button>
                <a routerLink="/calendars" class="btn btn-ghost">Cancel</a>
              </div>
            </form>
          </div>
        </div>
      </app-shell>
    }
  `,
  styles: [`
    :host{display:block}
    .composer{display:grid;grid-template-columns:520px 568px;gap:48px;align-items:start;max-width:1180px}
    .form{display:flex;flex-direction:column;gap:8px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .setting{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-top:1px solid var(--hairline)}
    .setting-copy{display:flex;flex-direction:column;gap:2px;font-size:16px;line-height:24px}
    .switch-line{cursor:pointer;min-height:44px}
    .theme-dot{width:32px;height:32px;border-radius:100px;background:conic-gradient(#f31a7c,#d69712,#3cbd2c,#146aeb,#ab46dd,#f31a7c)}
    .art-field{position:relative;aspect-ratio:1;border-radius:24px;overflow:hidden;isolation:isolate}
    .art-backdrop{position:absolute;inset:-40%;filter:blur(100px) saturate(1.5);background:conic-gradient(from 0deg,#f31a7c,#146aeb,#3cbd2c,#d69712,#ab46dd,#f31a7c);animation:shift-background 60000ms linear infinite;z-index:-3;will-change:transform}
    .art-rotor{position:absolute;inset:-40%;filter:brightness(1.3) saturate(0) blur(50px);mix-blend-mode:overlay;
      background:conic-gradient(from 90deg,#ffffff,#000000,#ffffff,#000000,#ffffff);animation:shift-background 60000ms linear infinite;z-index:-2;will-change:transform}
    .art-glow{position:absolute;inset:-20%;filter:blur(60px);background:radial-gradient(circle at 30% 30%,#f31a7c66,transparent 60%),radial-gradient(circle at 70% 70%,#146aeb66,transparent 60%);z-index:-1}
    .art-cover{position:absolute;inset:10%;border-radius:11px;overflow:hidden;box-shadow:rgba(0,0,0,.2) 0 24px 48px 0}
    @media (max-width:1259px){ .composer{grid-template-columns:1fr} .two{grid-template-columns:1fr} }
  `],
})
export class CreateComponent implements OnInit {
  api = inject(ApiService);
  private notice = inject(NoticeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  cals = signal<CalendarRecord[]>([]);
  allowed = signal(true);
  busy = signal(false);
  err = signal(''); errField = signal<string | null>(null);
  categoryList = CATEGORIES;
  labelOf = (c: string) => CATEGORY_LABELS[c] || c;
  zones = ['UTC', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];
  calendarPublic = true;

  draft: any = {
    calendar_slug: '', title: '', category: 'running', city: '', time_zone: 'Europe/Berlin',
    starts_at: '', ends_at: '', capacity: 20, approval_required: false, waitlist_enabled: true, description: '',
  };

  artSeed = signal('new-event');

  ngOnInit() {
    if (!this.api.account || this.api.account.role !== 'host') { this.allowed.set(false); return; }
    this.api.get<CalendarRecord[]>('/calendars').then((cals) => {
      this.cals.set(cals);
      const wanted = this.route.snapshot.queryParamMap.get('calendar');
      this.draft.calendar_slug = wanted && cals.some(c => c.slug === wanted) ? wanted : (cals[0]?.slug || '');
      this.calendarPublic = cals.find(c => c.slug === this.draft.calendar_slug)?.is_public ?? true;
    }).catch(() => { });
  }

  setTitle(v: string) {
    this.draft.title = v;
    this.artSeed.set((v || 'new-event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-event');
  }

  bump(d: number) {
    const next = this.draft.capacity + d;
    if (next >= 1 && next <= 500) this.draft.capacity = next;
  }

  private toUtc(local: string): string | undefined {
    if (!local) return undefined;
    // datetime-local is a wall time in the event's zone; build the instant from it
    const zone = this.draft.time_zone || 'UTC';
    const d = new Date(local); // interpreted in the visitor's zone first
    // convert: find the offset of zone at that wall time via a probe
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      const parts: any = {};
      for (const p of dtf.formatToParts(d)) parts[p.type] = p.value;
      const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === '24' ? 0 : parts.hour, parts.minute, parts.second);
      const offset = asUTC - d.getTime();
      const wall = new Date(local + (offset >= 0 ? '-' : '+') +
        String(Math.floor(Math.abs(offset) / 3600000)).padStart(2, '0') + ':' +
        String(Math.floor((Math.abs(offset) % 3600000) / 60000)).padStart(2, '0'));
      return wall.toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch {
      return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
  }

  async submit() {
    this.busy.set(true); this.err.set(''); this.errField.set(null);
    try {
      const body = {
        ...this.draft,
        starts_at: this.toUtc(this.draft.starts_at),
        ends_at: this.toUtc(this.draft.ends_at),
      };
      const created = await this.api.post<{ slug: string; state: string }>('/events', body);
      this.notice.say(created.state === 'published'
        ? `${this.draft.title} is live at /${created.slug}.`
        : `${this.draft.title} was saved as a draft. Fill in the rest and publish it.`, 'success');
      this.router.navigateByUrl(created.state === 'published' ? `/${created.slug}` : `/event/${created.slug}/manage/overview`);
    } catch (e) {
      const err = e as ApiError;
      this.err.set(err.message);
      this.errField.set(err.field ?? null);
    } finally { this.busy.set(false); }
  }
}

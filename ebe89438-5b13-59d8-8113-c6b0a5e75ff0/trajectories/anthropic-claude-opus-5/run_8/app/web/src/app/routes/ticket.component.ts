import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { statusLabel, statusTone, type TicketView } from '../core/models';
import { formatInZone, formatRange, icsFor, visitorZone, zonesDiffer } from '../core/format';
import { applyTheme, bootTheme, clearTheme, deriveTheme } from '../core/theme';
import { ScanCodeComponent } from '../ui/scan-code.component';
import { BrandComponent } from '../ui/icons.component';
import { NotFoundComponent } from './not-found.component';

/** Anyone presenting the code sees this; the code itself is the credential. */
@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [RouterLink, ScanCodeComponent, BrandComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <div class="ground">
        <main id="main" class="holder">
          @if (loading()) {
            <div class="skeleton" style="height: 480px; width: 400px; max-width: 100%; border-radius: 24px"></div>
          } @else if (ticket(); as t) {
            <article class="ticket card">
              <a routerLink="/" class="lock"><app-brand [size]="16" /></a>
              <h1 class="serif">{{ t.title }}</h1>

              <p class="t-row when">{{ inEventZone() }}</p>
              <p class="t-caption zone">{{ t.time_zone }}</p>
              @if (showVisitorZone()) {
                <p class="t-caption zone">{{ inVisitorZone() }} · your time ({{ visitorZoneName }})</p>
              }
              <p class="t-row where">{{ t.city }}</p>

              <span class="pill" [class]="tone()">{{ label() }}</span>
              @if (t.checked_in_at) {
                <p class="t-caption arrival">Arrived at {{ arrival() }}</p>
              }

              <p class="code">{{ t.ticket_code }}</p>
              <div class="scan"><app-scan-code [value]="address()" [size]="168" /></div>
              <p class="t-caption holder-name">Held by {{ t.display_name }}</p>

              <div class="actions">
                <button type="button" class="btn btn-sm" (click)="addToCalendar()">Add to Calendar</button>
                <a class="btn btn-sm" [routerLink]="['/', t.event_slug]">View Event</a>
              </div>
            </article>
          }
        </main>
      </div>
    }
  `,
  styles: [
    `
      .ground {
        min-height: 100vh;
        background: var(--event-ground);
        color: var(--event-ink);
      }
      .holder {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--s5);
      }
      .ticket {
        width: 400px;
        max-width: 100%;
        border-radius: var(--r-card-lg);
        padding: var(--s6);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        background: var(--paper);
        box-shadow: var(--elev-primary);
      }
      .lock {
        margin-bottom: var(--s3);
        color: var(--ink);
      }
      h1 {
        font-size: 28px;
        line-height: 34px;
        color: var(--ink);
      }
      .when {
        margin-top: var(--s3);
      }
      .zone,
      .holder-name {
        color: var(--muted);
      }
      .where {
        margin-top: var(--s2);
      }
      .pill {
        margin-top: var(--s3);
      }
      .arrival {
        color: var(--muted);
      }
      .code {
        font-family: var(--mono);
        font-size: 22px;
        line-height: 26px;
        letter-spacing: 0.05em;
        margin-top: var(--s3);
      }
      .scan {
        align-self: center;
        margin: var(--s3) 0;
      }
      .actions {
        display: flex;
        gap: var(--s2);
        margin-top: var(--s4);
        flex-wrap: wrap;
        width: 100%;
      }
      .actions > * {
        flex: 1;
      }
    `,
  ],
})
export class TicketComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly ticket = signal<TicketView | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  readonly visitorZoneName = visitorZone();

  ngOnInit(): void {
    applyTheme(bootTheme());
    const code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();
    void this.load(code);
  }

  ngOnDestroy(): void {
    clearTheme();
  }

  private async load(code: string) {
    this.loading.set(true);
    try {
      const t = await this.api.getTicket(code);
      this.ticket.set(t);
      applyTheme(t.theme ?? deriveTheme(t.theme_hex));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  readonly inEventZone = computed(() => {
    const t = this.ticket();
    return t ? formatRange(t.starts_at, t.ends_at, t.time_zone) : '';
  });

  readonly inVisitorZone = computed(() => {
    const t = this.ticket();
    return t ? formatRange(t.starts_at, t.ends_at, this.visitorZoneName) : '';
  });

  readonly showVisitorZone = computed(() => {
    const t = this.ticket();
    return !!t && zonesDiffer(t.starts_at, t.time_zone, this.visitorZoneName);
  });

  readonly arrival = computed(() => {
    const t = this.ticket();
    return t?.checked_in_at ? formatInZone(t.checked_in_at, t.time_zone) : '';
  });

  readonly label = computed(() => (this.ticket() ? statusLabel(this.ticket()!.status) : ''));
  readonly tone = computed(() => (this.ticket() ? statusTone(this.ticket()!.status) : ''));

  address(): string {
    const t = this.ticket();
    return t ? `${window.location.origin}/t/${t.ticket_code}` : '';
  }

  addToCalendar() {
    const t = this.ticket();
    if (!t) return;
    const blob = new Blob([icsFor({ ...t, slug: t.event_slug })], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.event_slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

import { ChangeDetectionStrategy, Component, Injectable, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import type { EventDetail, GuestRow } from '../core/models';

/**
 * The manage screens share one loaded event and one guest list, so the three
 * sister screens never re-fetch what a sibling already has.
 */
@Injectable()
export class ManageStore {
  private api = inject(ApiService);

  readonly slug = signal('');
  readonly event = signal<EventDetail | null>(null);
  readonly guests = signal<GuestRow[]>([]);
  readonly loading = signal(true);
  readonly guestsLoading = signal(true);

  loadEvent(slug: string) {
    this.slug.set(slug);
    this.loading.set(true);
    return new Promise<EventDetail | null>((resolve) => {
      this.api.event(slug).subscribe({
        next: (ev) => {
          this.event.set(ev);
          this.loading.set(false);
          resolve(ev);
        },
        error: () => {
          this.event.set(null);
          this.loading.set(false);
          resolve(null);
        },
      });
    });
  }

  loadGuests() {
    this.guestsLoading.set(true);
    this.api.guests(this.slug()).subscribe({
      next: (rows) => {
        this.guests.set(rows);
        this.guestsLoading.set(false);
      },
      error: () => {
        this.guests.set([]);
        this.guestsLoading.set(false);
      },
    });
  }

  setEvent(ev: EventDetail) {
    this.event.set(ev);
  }
}

@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  providers: [ManageStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <div class="skeleton" style="height: 32px; width: 45%"></div>
      <div class="skeleton" style="height: 20px; width: 30%; margin-top: 12px"></div>
      <div class="skeleton" style="height: 220px; margin-top: 32px; border-radius: 12px"></div>
    } @else if (store.event()) {
      <nav class="tabs" aria-label="Manage this event">
        <a
          [routerLink]="['/event', store.slug(), 'manage', 'overview']"
          routerLinkActive="current"
          #o="routerLinkActive"
          [attr.aria-current]="o.isActive ? 'page' : null"
          >Overview</a
        >
        <a
          [routerLink]="['/event', store.slug(), 'manage', 'guests']"
          routerLinkActive="current"
          #g="routerLinkActive"
          [attr.aria-current]="g.isActive ? 'page' : null"
          >Guests</a
        >
        <a
          [routerLink]="['/event', store.slug(), 'manage', 'registration']"
          routerLinkActive="current"
          #r="routerLinkActive"
          [attr.aria-current]="r.isActive ? 'page' : null"
          >Registration</a
        >
      </nav>

      <router-outlet />
    }
  `,
  styles: [
    `
      .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 32px;
        border-bottom: 1px solid var(--divider);
        flex-wrap: wrap;
      }

      .tabs a {
        padding: 0 12px;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        color: var(--ink-64);
        font-size: 15px;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }

      @media (hover: hover) {
        .tabs a:hover { color: var(--ink); }
      }

      .tabs a.current {
        color: var(--ink);
        font-weight: 600;
        border-bottom-color: var(--ink);
      }
    `,
  ],
})
export class ManageComponent implements OnInit {
  store = inject(ManageStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    this.route.paramMap.subscribe(async (params) => {
      const slug = params.get('slug') ?? '';
      const ev = await this.store.loadEvent(slug);
      // A host who does not own the calendar meets the ordinary not-found page.
      if (!ev || !ev.is_owner) {
        this.router.navigateByUrl('/not-found', { replaceUrl: true });
      }
    });
  }
}

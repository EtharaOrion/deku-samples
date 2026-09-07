import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { AppShellComponent } from '../ui/app-shell.component';
import { NotFoundPage } from './not-found.page';
import type { EventDetail } from '../core/models';

/** One load of the event, shared by the three manage screens beneath it. */
@Injectable()
export class ManageStore {
  private api = inject(ApiService);

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly denied = signal(false);
  readonly slug = signal('');

  /**
   * `quiet` re-reads the event without re-entering the skeleton, so a refresh
   * after a host action never tears the screen down and rebuilds it. A skeleton
   * is replaced once and never re-entered on a route already loaded.
   */
  load(slug: string, quiet = false): void {
    this.slug.set(slug);
    if (!quiet) {
      this.loading.set(true);
      this.denied.set(false);
    }
    this.api.event(slug).subscribe({
      next: (e) => {
        // The owning host only; anybody else meets the ordinary not-found page
        // rather than a message that would confirm the record exists.
        if (!e.is_owner) {
          this.denied.set(true);
          this.loading.set(false);
          return;
        }
        this.event.set(e);
        this.loading.set(false);
      },
      error: () => {
        this.denied.set(true);
        this.loading.set(false);
      },
    });
  }

  refresh(): void {
    const slug = this.slug();
    if (slug) this.load(slug, true);
  }

  patch(e: EventDetail): void {
    this.event.set(e);
  }
}

@Component({
  selector: 'app-manage-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppShellComponent, NotFoundPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ManageStore],
  template: `
    @if (store.denied()) {
      <app-not-found />
    } @else {
      <app-shell>
        @if (store.loading()) {
          <div class="skeleton head-skeleton" aria-busy="true"></div>
          <div class="skeleton body-skeleton"></div>
        } @else if (store.event(); as e) {
          <nav class="tabs" aria-label="Manage this event">
            <a
              class="tab"
              [routerLink]="base() + '/overview'"
              routerLinkActive="tab--current"
              #t1="routerLinkActive"
              [attr.aria-current]="t1.isActive ? 'page' : null"
              >Overview</a
            >
            <a
              class="tab"
              [routerLink]="base() + '/guests'"
              routerLinkActive="tab--current"
              #t2="routerLinkActive"
              [attr.aria-current]="t2.isActive ? 'page' : null"
              >Guests</a
            >
            <a
              class="tab"
              [routerLink]="base() + '/registration'"
              routerLinkActive="tab--current"
              #t3="routerLinkActive"
              [attr.aria-current]="t3.isActive ? 'page' : null"
              >Registration</a
            >
          </nav>
          <router-outlet />
        }
      </app-shell>
    }
  `,
  styles: [
    `
      .tabs {
        display: flex;
        gap: var(--s1);
        border-bottom: 1px solid var(--divider);
        margin-bottom: var(--s5);
        overflow-x: auto;
      }
      .tab {
        padding: var(--s2) var(--s3);
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        color: var(--ink-64);
        border-radius: var(--r-nav) var(--r-nav) 0 0;
        white-space: nowrap;
        font-size: 15px;
        line-height: 22px;
      }
      @media (hover: hover) {
        .tab:hover { background: var(--ink-04); color: var(--ink); }
      }
      .tab--current {
        background: var(--ink-04);
        color: var(--ink);
        font-weight: 500;
        box-shadow: inset 0 -2px 0 0 var(--ink);
      }
      .head-skeleton { height: 44px; margin-bottom: var(--s5); }
      .body-skeleton { height: 320px; border-radius: var(--r-card); }
    `,
  ],
})
export class ManageShell implements OnInit, OnDestroy {
  readonly store = inject(ManageStore);
  private route = inject(ActivatedRoute);
  private themeService = inject(ThemeService);

  readonly base = computed(() => `/event/${this.store.slug()}/manage`);

  private sub: Subscription | null = null;

  ngOnInit(): void {
    // The manage screens are operational, not editorial: the plain palette.
    this.themeService.clear();
    this.sub = this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') ?? '';
      if (slug) this.store.load(slug);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

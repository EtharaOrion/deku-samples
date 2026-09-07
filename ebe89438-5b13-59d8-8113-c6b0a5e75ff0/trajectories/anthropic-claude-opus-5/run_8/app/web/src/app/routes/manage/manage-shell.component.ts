import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { clearTheme } from '../../core/theme';
import { AppShellComponent } from '../../ui/app-shell.component';
import { NotFoundComponent } from '../not-found.component';
import { ManageStateService } from './manage-state.service';

@Component({
  selector: 'app-manage-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppShellComponent, NotFoundComponent],
  providers: [ManageStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.denied()) {
      <app-not-found />
    } @else {
      <app-shell>
        @if (state.event(); as ev) {
          <nav class="tabs" aria-label="Event management">
            <a routerLink="overview" routerLinkActive="current" #a="routerLinkActive" [attr.aria-current]="a.isActive ? 'page' : null">Overview</a>
            <a routerLink="guests" routerLinkActive="current" #b="routerLinkActive" [attr.aria-current]="b.isActive ? 'page' : null">Guests</a>
            <a routerLink="registration" routerLinkActive="current" #c="routerLinkActive" [attr.aria-current]="c.isActive ? 'page' : null">Registration</a>
          </nav>
        }
        <router-outlet />
      </app-shell>
    }
  `,
  styles: [
    `
      .tabs {
        display: flex;
        gap: var(--s1);
        margin-bottom: var(--s5);
        border-bottom: 1px solid var(--divider);
      }
      .tabs a {
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        padding: 0 var(--s3);
        color: var(--ink-64);
        border-bottom: 2px solid transparent;
        transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
      }
      @media (hover: hover) {
        .tabs a:hover {
          color: var(--ink);
        }
      }
      .tabs a.current {
        color: var(--ink);
        font-weight: 600;
        border-bottom-color: var(--ink);
      }
    `,
  ],
})
export class ManageShellComponent implements OnInit, OnDestroy {
  readonly state = inject(ManageStateService);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  ngOnInit(): void {
    clearTheme();
    this.sub = this.route.paramMap.subscribe((p) => {
      const slug = p.get('slug');
      if (slug) void this.state.load(slug);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-manage-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tabs" aria-label="Event management">
      <a
        [routerLink]="['/event', slug(), 'manage', 'overview']"
        routerLinkActive="current"
        #a="routerLinkActive"
        [attr.aria-current]="a.isActive ? 'page' : null"
        >Overview</a
      >
      <a
        [routerLink]="['/event', slug(), 'manage', 'guests']"
        routerLinkActive="current"
        #b="routerLinkActive"
        [attr.aria-current]="b.isActive ? 'page' : null"
        >Guests</a
      >
      <a
        [routerLink]="['/event', slug(), 'manage', 'registration']"
        routerLinkActive="current"
        #c="routerLinkActive"
        [attr.aria-current]="c.isActive ? 'page' : null"
        >Registration</a
      >
    </nav>
  `,
  styles: [
    `
      .tabs {
        display: flex;
        gap: var(--s1);
        border-bottom: 1px solid var(--divider);
        margin-bottom: var(--s6);
        flex-wrap: wrap;
      }
      a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 var(--s3);
        color: var(--ink-64);
        font-size: 15px;
        line-height: 22px;
        border-bottom: 2px solid transparent;
        transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
      }
      @media (hover: hover) {
        a:hover {
          color: var(--ink);
        }
      }
      a.current {
        color: var(--ink);
        font-weight: 600;
        border-bottom-color: var(--ink);
      }
    `,
  ],
})
export class ManageNavComponent {
  slug = input.required<string>();
}

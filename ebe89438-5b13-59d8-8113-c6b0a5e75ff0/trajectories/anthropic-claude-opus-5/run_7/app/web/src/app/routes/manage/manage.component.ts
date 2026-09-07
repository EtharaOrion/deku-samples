import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShellComponent } from '../../shared/shell.component';
import { SkeletonComponent } from '../../shared/ui.components';
import { NotFoundComponent } from '../system.component';
import { clearTheme } from '../../core/theme';
import { ManageStore } from './manage.store';

/**
 * The manage shell, for the owning host only. A host who does not own the
 * calendar, and a guest, each get the ordinary not-found page rather than a
 * message that would confirm the record exists.
 */
@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [
    RouterLink, RouterLinkActive, RouterOutlet, ShellComponent,
    SkeletonComponent, NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ManageStore],
  template: `
    @if (store.missing()) {
      <app-not-found />
    } @else {
      <app-shell>
        <main id="main" class="page" role="main">
          @if (store.loading()) {
            <app-skeleton w="50%" h="32px" radius="8px" />
            <div style="height:24px"></div>
            <app-skeleton w="100%" h="200px" radius="12px" />
          } @else if (store.ev()) {
            @let ev = store.ev()!;
            <nav class="tabs" aria-label="Event management">
              <a [routerLink]="['/event', ev.slug, 'manage', 'overview']"
                 routerLinkActive="current" #o="routerLinkActive"
                 [attr.aria-current]="o.isActive ? 'page' : null">Overview</a>
              <a [routerLink]="['/event', ev.slug, 'manage', 'guests']"
                 routerLinkActive="current" #g="routerLinkActive"
                 [attr.aria-current]="g.isActive ? 'page' : null">Guests</a>
              <a [routerLink]="['/event', ev.slug, 'manage', 'registration']"
                 routerLinkActive="current" #r="routerLinkActive"
                 [attr.aria-current]="r.isActive ? 'page' : null">Registration</a>
            </nav>
            <router-outlet />
          }
        </main>
      </app-shell>
    }
  `,
  styles: [`
    .page { padding: var(--s6) var(--s5) var(--s8); max-width: 900px; }
    .tabs { display: flex; gap: var(--s1); margin-bottom: var(--s5);
      border-bottom: 1px solid var(--divider); flex-wrap: wrap; }
    .tabs a {
      padding: var(--s2) var(--s3); min-height: 44px; display: inline-flex;
      align-items: center; color: var(--ink-secondary);
      border-bottom: 2px solid transparent; margin-bottom: -1px;
      transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
    }
    .tabs a:hover { color: var(--ink); }
    .tabs a.current { color: var(--ink); border-bottom-color: var(--ink); font-weight: 500; }
  `],
})
export class ManageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  store = inject(ManageStore);

  ngOnInit() {
    clearTheme();
    this.route.paramMap.subscribe((p) => this.store.load(p.get('slug') ?? ''));
  }
}

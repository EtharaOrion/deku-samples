import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { PublicBarComponent } from '../ui/public-bar.component';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { EmptyStateComponent } from '../ui/bits';
import { NotFoundPage } from './not-found.page';
import { CATEGORY_LABELS, type AccountPage } from '../core/models';

/** A profile at its own handle in the root namespace. */
@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [
    RouterLink,
    PublicBarComponent,
    AvatarComponent,
    IconComponent,
    EmptyStateComponent,
    NotFoundPage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <main id="main" class="page wrap">
        @if (loading()) {
          <div class="skeleton head-skeleton" aria-busy="true"></div>
        } @else if (account(); as a) {
          <header class="head">
            <app-avatar [name]="a.display_name" [size]="64" />
            <div class="head__lines">
              <h1 class="head__title">{{ a.display_name }}</h1>
              <p class="t-caption head__handle">&#64;{{ a.handle }}</p>
            </div>
          </header>

          <section class="section" aria-labelledby="acct-calendars">
            <h2 class="t-screen-title section__head" id="acct-calendars">Calendars</h2>
            @if (a.calendars.length === 0) {
              <app-empty-state
                title="No Public Calendars"
                body="This account keeps nothing public just now."
                actionLabel="Discover Events"
                actionLink="/discover"
              />
            } @else {
              <ul class="grid">
                @for (c of a.calendars; track c.slug) {
                  <li>
                    <a class="card card--lift cal" [routerLink]="'/' + c.slug">
                      <app-icon [name]="anyIcon(c.category)" [size]="24" />
                      <span class="t-card-title">{{ c.name }}</span>
                      <span class="t-caption cal__meta">{{ label(c.category) }} · {{ c.city }}</span>
                    </a>
                  </li>
                }
              </ul>
            }
          </section>
        }
      </main>
    }
  `,
  styles: [
    `
      .wrap {
        padding-top: 96px;
        padding-bottom: var(--s8);
        display: flex;
        flex-direction: column;
        gap: var(--s6);
      }
      .head-skeleton { height: 90px; }
      .head { display: flex; align-items: center; gap: var(--s4); }
      .head__lines { display: flex; flex-direction: column; gap: var(--s1); }
      .head__title { font-family: var(--serif); font-weight: 400; font-size: 36px; line-height: 42px; }
      .head__handle { color: var(--muted); }
      .section { display: flex; flex-direction: column; gap: var(--s3); }
      .section__head { font-family: var(--serif); font-weight: 400; }
      .grid { display: grid; gap: var(--s3); grid-template-columns: 1fr; }
      @media (min-width: 484px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      .cal { display: flex; flex-direction: column; gap: var(--s1); padding: var(--s4); color: inherit; }
      .cal__meta { color: var(--muted); }
    `,
  ],
})
export class AccountPageComponent implements OnDestroy {
  readonly handle = input.required<string>();

  private api = inject(ApiService);
  private themeService = inject(ThemeService);

  readonly account = signal<AccountPage | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);

  private loadedHandle = '';

  constructor() {
    this.themeService.clear();
    effect(() => {
      const handle = this.handle();
      if (!handle || handle === this.loadedHandle) return;
      this.loadedHandle = handle;
      this.load(handle);
    });
  }

  ngOnDestroy(): void {
    this.themeService.clear();
  }

  private load(handle: string): void {
    this.loading.set(true);
    this.missing.set(false);
    this.api.accountPage(handle).subscribe({
      next: (a) => {
        this.account.set(a);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.missing.set(true);
      },
    });
  }

  label(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  anyIcon(name: string): any {
    return name;
  }
}

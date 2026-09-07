import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_LABELS, type ProfilePage } from '../core/models';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { AvatarComponent, CategoryIconComponent } from '../ui/icons.component';
import { NotFoundComponent } from './not-found.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, AvatarComponent, CategoryIconComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-public-bar />
      <div class="public-shell">
        <main id="main" class="page">
          @if (loading()) {
            <div class="skeleton" style="height: 56px; width: 280px; margin-top: 48px"></div>
          } @else if (data(); as p) {
            <header class="masthead">
              <app-avatar [name]="p.display_name" [size]="64" />
              <div>
                <h1 class="serif">{{ p.display_name }}</h1>
                <p class="t-caption muted">&#64;{{ p.handle }} · {{ p.role === 'host' ? 'Host' : 'Guest' }}</p>
              </div>
            </header>

            @if (p.calendars.length) {
              <h2 class="t-section-heading section">Calendars</h2>
              <ul class="grid">
                @for (c of p.calendars; track c.slug) {
                  <li>
                    <a class="card card-lift cal" [routerLink]="['/', c.slug]">
                      <app-category-icon [name]="c.category" [size]="22" />
                      <span class="t-card-title">{{ c.name }}</span>
                      <span class="t-caption muted">{{ label(c.category) }} · {{ c.city }} · {{ c.published_count }} published</span>
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <div class="empty-state">
                <h2>Nothing Public Yet</h2>
                <p>This account keeps no public calendar. Discovery will show you what else is on.</p>
                <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
              </div>
            }
          }
        </main>
      </div>
    }
  `,
  styles: [
    `
      .masthead {
        display: flex;
        gap: var(--s4);
        align-items: center;
        padding: var(--s7) 0 var(--s5);
      }
      h1 {
        font-size: 36px;
        line-height: 44px;
        font-weight: 400;
      }
      .muted {
        color: var(--muted);
      }
      .section {
        margin: var(--s5) 0 var(--s4);
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s4);
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1000px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      .cal {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
        align-items: flex-start;
        padding: var(--s4);
      }
    `,
  ],
})
export class ProfilePageComponent implements OnDestroy {
  private api = inject(ApiService);
  readonly handle = input.required<string>();
  readonly data = signal<ProfilePage | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  private last = '';

  constructor() {
    clearTheme();
    effect(() => {
      const h = this.handle();
      if (h && h !== this.last) {
        this.last = h;
        void this.load(h);
      }
    });
  }

  ngOnDestroy(): void {
    clearTheme();
  }

  label(c: string) {
    return CATEGORY_LABELS[c] ?? c;
  }

  private async load(handle: string) {
    this.loading.set(true);
    this.missing.set(false);
    try {
      this.data.set(await this.api.getProfile(handle));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

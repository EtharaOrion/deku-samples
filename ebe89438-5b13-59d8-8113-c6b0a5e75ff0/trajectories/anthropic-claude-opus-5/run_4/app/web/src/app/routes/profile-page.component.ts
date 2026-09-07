import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_LABELS, Profile } from '../core/models';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent, categoryHue } from '../ui/icon.component';
import { TopBarComponent } from '../ui/top-bar.component';
import { NotFoundComponent } from './not-found.component';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, TopBarComponent, AvatarComponent, IconComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-top-bar />
      <main class="page" id="main">
        <div class="col">
          @if (loading()) {
            <div class="sk sk-title" style="height:40px;width:260px"></div>
          } @else if (profile(); as p) {
            <header class="head">
              <app-avatar [name]="p.display_name" [size]="56" />
              <div>
                <h1 class="t-serif">{{ p.display_name }}</h1>
                <p class="t-caption muted">&#64;{{ p.handle }} · {{ p.role === 'host' ? 'Host' : 'Guest' }}</p>
              </div>
            </header>

            @if (p.calendars.length) {
              <section aria-labelledby="cals-h">
                <h2 id="cals-h" class="t-overline shelf-head">Calendars</h2>
                <ul class="grid">
                  @for (c of p.calendars; track c.slug) {
                    <li>
                      <a class="cal card card-lift" [routerLink]="['/', c.slug]">
                        <app-icon [name]="c.category" [size]="24" [color]="hue(c.category)" />
                        <span class="t-card-title">{{ c.name }}</span>
                        <span class="t-caption muted">{{ label(c.category) }} · {{ c.city }}</span>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            } @else {
              <div class="empty-state">
                <h2>No public calendars</h2>
                <p>This account keeps no calendar open to the world just now.</p>
                <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
              </div>
            }
          }
        </div>
      </main>
    }
  `,
  styles: [
    `
      .page {
        padding: 96px var(--s5) var(--s8);
      }
      .col {
        max-width: 1080px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--s6);
      }
      .head {
        display: flex;
        gap: var(--s4);
        align-items: center;
      }
      h1 {
        font-size: 32px;
        line-height: 38px;
      }
      .muted {
        color: var(--muted);
      }
      .shelf-head {
        color: var(--ink-36);
        margin-bottom: var(--s4);
      }
      .grid {
        display: grid;
        gap: var(--s4);
        grid-template-columns: 1fr;
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
        padding: var(--s4);
        color: inherit;
        background: var(--paper);
      }
      @media (max-width: 649px) {
        .page {
          padding: 88px var(--s4) var(--s8);
        }
      }
    `,
  ],
})
export class ProfilePageComponent {
  handle = input.required<string>();
  private api = inject(ApiService);

  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  private loaded = '';

  hue = categoryHue;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const handle = this.handle();
    if (this.loaded === handle) return;
    this.loaded = handle;
    try {
      this.profile.set(await this.api.profile(handle));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CATEGORY_LABELS, CalendarPage } from '../core/models';
import { AvatarComponent } from '../ui/avatar.component';
import { EventCardComponent } from '../ui/event-card.component';
import { IconComponent, categoryHue } from '../ui/icon.component';
import { TopBarComponent } from '../ui/top-bar.component';
import { NotFoundComponent } from './not-found.component';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, TopBarComponent, IconComponent, AvatarComponent, EventCardComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <app-not-found />
    } @else {
      <app-top-bar />
      <main class="page" id="main">
        <div class="col">
          @if (loading()) {
            <div class="sk sk-title" style="height:44px;width:320px"></div>
            <div class="sk sk-line" style="width:200px"></div>
          } @else if (cal(); as c) {
            <header class="head">
              <app-avatar [name]="c.name" [size]="48" />
              <div class="words">
                <h1 class="t-serif">{{ c.name }}</h1>
                <p class="t-caption muted">
                  <app-icon [name]="c.category" [size]="16" [color]="hue(c.category)" />
                  {{ label(c.category) }} · {{ c.city }} · hosted by
                  <a [routerLink]="['/', c.owner_handle]">{{ c.owner_name }}</a>
                </p>
                @if (!c.is_public) {
                  <span class="private t-badge">Private</span>
                }
              </div>
            </header>

            @if (c.events.length === 0) {
              <div class="empty-state">
                <h2>Nothing on this calendar yet</h2>
                <p>When this host publishes an event it will show up here.</p>
                <a class="btn btn-primary btn-pill" routerLink="/discover">Discover Events</a>
              </div>
            } @else {
              <ul class="grid">
                @for (e of c.events; track e.slug) {
                  <li><app-event-card [event]="e" /></li>
                }
              </ul>
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
        align-items: flex-start;
      }
      h1 {
        font-size: 36px;
        line-height: 42px;
      }
      .words {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }
      .muted {
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .private {
        align-self: flex-start;
        padding: 3px 10px;
        border-radius: var(--r-round);
        background: rgba(243, 26, 124, 0.12);
        color: #f31a7c;
        font-weight: 600;
      }
      .grid {
        display: grid;
        gap: var(--s5);
        grid-template-columns: 1fr;
      }
      @media (min-width: 484px) {
        .grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 1580px) {
        .grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (max-width: 649px) {
        .page {
          padding: 88px var(--s4) var(--s8);
        }
        h1 {
          font-size: 28px;
          line-height: 34px;
        }
      }
    `,
  ],
})
export class CalendarPageComponent {
  slug = input.required<string>();
  private api = inject(ApiService);

  readonly cal = signal<CalendarPage | null>(null);
  readonly loading = signal(true);
  readonly missing = signal(false);
  private loaded = '';

  hue = categoryHue;
  label = (c: string) => CATEGORY_LABELS[c] ?? c;

  constructor() {
    queueMicrotask(() => void this.load());
  }

  private async load() {
    const slug = this.slug();
    if (this.loaded === slug) return;
    this.loaded = slug;
    try {
      this.cal.set(await this.api.calendar(slug));
    } catch {
      this.missing.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

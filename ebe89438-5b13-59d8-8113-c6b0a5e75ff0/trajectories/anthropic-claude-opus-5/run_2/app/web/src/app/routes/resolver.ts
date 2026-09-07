import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../core/api';
import { CATEGORIES } from '../core/models';
import { CalendarPageComponent, CategoryComponent, ProfilePageComponent } from './public-pages';
import { EventPageComponent } from './event-page';
import { SkeletonComponent } from '../ui/kit';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-root-slug',
  standalone: true,
  imports: [
    EventPageComponent,
    CategoryComponent,
    CalendarPageComponent,
    ProfilePageComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('event') {
        <app-event-page [slug]="slug()"></app-event-page>
      }
      @case ('category') {
        <app-category [name]="slug()"></app-category>
      }
      @case ('calendar') {
        <app-calendar-page [slug]="slug()"></app-calendar-page>
      }
      @case ('account') {
        <app-profile-page [handle]="slug()"></app-profile-page>
      }
      @default {
        <div class="loading" aria-busy="true">
          <app-skeleton height="32px" width="40%"></app-skeleton>
          <app-skeleton height="18px" width="25%"></app-skeleton>
          <app-skeleton height="240px" radius="12px"></app-skeleton>
        </div>
      }
    }
  `,
  styles: [
    `
      .loading {
        max-width: 948px;
        margin: 0 auto;
        padding: 112px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    `,
  ],
})
export class RootSlugComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);

  readonly slug = input.required<string>();
  readonly kind = signal<string>('');

  private controller = new AbortController();
  private resolved: string | null = null;

  ngOnInit() {
    this.resolve();
  }

  private resolve() {
    const slug = this.slug();
    if (this.resolved === slug) return;
    this.resolved = slug;

    // The twelve category names are decided without a round trip.
    if ((CATEGORIES as readonly string[]).includes(slug)) {
      this.kind.set('category');
      return;
    }

    this.api
      .resolve(slug, this.controller.signal)
      .then((r) => {
        if (r.kind === 'system') {
          this.router.navigate(['/not-found'], { skipLocationChange: true });
          return;
        }
        this.kind.set(r.kind);
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        this.router.navigate(['/not-found'], { skipLocationChange: true });
      });
  }

  ngOnDestroy() {
    this.controller.abort();
  }
}

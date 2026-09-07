/** Blocks in the shape of the thing they stand for, holding the final layout. */
@Component({
  selector: 'g-skeleton-lines',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skel stack" aria-hidden="true">
      <span class="skeleton skeleton-title"></span>
      <span class="skeleton skeleton-line"></span>
      <span class="skeleton skeleton-line" style="width: 80%"></span>
      <span class="skeleton skeleton-block"></span>
    </div>
  `,
  styles: [`.skel { padding: 24px 0; }`],
})
export class SkeletonLines {}

import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../api';
import { CATEGORIES } from '../domain';
import { NotFoundPage } from './notfound';
import { EventPage } from './event';
import { CalendarPage } from './calendar';
import { ProfilePage } from './profile';
import { CategoryPage } from './category';

/**
 * Root-namespace resolution with fixed precedence: reserved system paths, then
 * the twelve category names, then events.slug, then calendars.slug, then
 * accounts.handle, otherwise the not-found page.
 */
@Component({
  selector: 'g-resolve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (view()) {
      @case ('loading') { <g-skeleton-lines /> }

      @case ('event') { <g-event-page [slug]="resolvedSlug()" /> }
      @case ('calendar') { <g-calendar-page [slug]="resolvedSlug()" /> }
      @case ('account') { <g-profile-page [handle]="resolvedSlug()" /> }
      @case ('category') { <g-category-page [key]="resolvedSlug()" /> }
      @default { <g-not-found /> }
    }
  `,
  imports: [NotFoundPage, EventPage, CalendarPage, ProfilePage, CategoryPage, SkeletonLines],
})
export class ResolvePage {
  slug = input<string | undefined>(undefined);
  private api = inject(Api);
  private router = inject(Router);

  /** With a matcher route the segment is read from the URL tree directly. */
  private currentSlug(): string {
    return this.slug() ?? this.router.url.split('/').filter(Boolean).pop() ?? '';
  }

  /** The resolved segment, for the child components. */
  resolvedSlug = signal('');
  view = signal<'loading' | 'event' | 'calendar' | 'account' | 'category' | 'missing'>('loading');

  constructor() {
    effect(() => {
      const slug = this.currentSlug();
      this.resolvedSlug.set(slug);
      if (CATEGORIES.some((c) => c.key === slug)) {
        this.view.set('category');
        return;
      }
      this.api.resolve(slug).subscribe({
        next: (res) => this.view.set(res.kind as never),
        error: () => this.view.set('missing'),
      });
    });
  }
}

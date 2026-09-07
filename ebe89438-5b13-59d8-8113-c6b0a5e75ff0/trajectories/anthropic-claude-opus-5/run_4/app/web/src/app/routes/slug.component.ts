import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { CATEGORIES } from '../core/models';
import { CalendarPageComponent } from './calendar-page.component';
import { CategoryPageComponent } from './category-page.component';
import { EventPageComponent } from './event-page.component';
import { NotFoundComponent } from './not-found.component';
import { ProfilePageComponent } from './profile-page.component';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-slug',
  standalone: true,
  imports: [
    EventPageComponent,
    CalendarPageComponent,
    CategoryPageComponent,
    ProfilePageComponent,
    NotFoundComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('event') {
        <app-event-page [slug]="slug()" />
      }
      @case ('calendar') {
        <app-calendar-page [slug]="slug()" />
      }
      @case ('category') {
        <app-category-page [name]="slug()" />
      }
      @case ('account') {
        <app-profile-page [handle]="slug()" />
      }
      @case ('missing') {
        <app-not-found />
      }
      @default {
        <div class="boot" aria-busy="true">
          <div class="sk sk-title" style="width:320px;height:36px"></div>
          <div class="sk sk-line" style="width:220px"></div>
        </div>
      }
    }
  `,
  styles: [
    `
      .boot {
        min-height: 60vh;
        display: flex;
        flex-direction: column;
        gap: var(--s3);
        align-items: center;
        justify-content: center;
        padding: 120px var(--s5);
      }
    `,
  ],
})
export class SlugComponent {
  slug = input.required<string>();
  private api = inject(ApiService);

  readonly kind = signal<'loading' | 'event' | 'calendar' | 'category' | 'account' | 'missing'>('loading');
  private resolved = '';

  constructor() {
    queueMicrotask(() => void this.resolve());
  }

  private async resolve() {
    const slug = this.slug().toLowerCase();
    if (this.resolved === slug) return;
    this.resolved = slug;

    // The twelve category names are decided without a round trip.
    if ((CATEGORIES as readonly string[]).includes(slug)) {
      this.kind.set('category');
      return;
    }
    try {
      const r = await this.api.resolve(slug);
      this.kind.set(r.kind === 'system' ? 'missing' : (r.kind as never));
    } catch {
      this.kind.set('missing');
    }
  }
}

import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiRefusal, ApiService } from '../core/api.service';
import { CATEGORIES } from '../core/models';
import { EventPageComponent } from './event.component';
import { CategoryComponent } from './category.component';
import { CalendarPageComponent, ProfilePageComponent } from './calendar-page.component';
import { NotFoundComponent } from './system.component';

/**
 * Root-namespace resolution: one lookup with fixed precedence. Reserved system
 * paths and the twelve category names are decided here without a round trip;
 * everything else asks the server, which applies the same precedence over
 * events.slug, calendars.slug and accounts.handle.
 */
@Component({
  selector: 'app-resolve',
  standalone: true,
  imports: [EventPageComponent, CategoryComponent, CalendarPageComponent, ProfilePageComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('event') {
        <app-event-page [slug]="slug()" />
      }
      @case ('category') {
        <app-category [category]="slug()" />
      }
      @case ('calendar') {
        <app-calendar-page [slug]="slug()" />
      }
      @case ('account') {
        <app-profile-page [handle]="slug()" />
      }
      @case ('not-found') {
        <app-not-found />
      }
      @default {
        <div class="booting" aria-live="polite">
          <span class="visually-hidden">Loading</span>
          <div class="skeleton" style="height: 44px; width: 60%; max-width: 420px"></div>
          <div class="skeleton" style="height: 24px; width: 40%; max-width: 300px; margin-top: 16px"></div>
        </div>
      }
    }
  `,
  styles: [
    `
      .booting {
        padding: 128px 24px;
        max-width: 1080px;
        margin: 0 auto;
      }
    `,
  ],
})
export class ResolveComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  readonly slug = signal('');
  readonly kind = signal<'loading' | 'event' | 'category' | 'calendar' | 'account' | 'not-found'>('loading');

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const slug = (params.get('slug') ?? '').toLowerCase();
      this.slug.set(slug);

      if (CATEGORIES.includes(slug as any)) {
        this.kind.set('category');
        return;
      }

      this.kind.set('loading');
      this.api.resolve(slug).subscribe({
        next: (res) => {
          this.kind.set(
            res.kind === 'event' || res.kind === 'calendar' || res.kind === 'account' || res.kind === 'category'
              ? (res.kind as any)
              : 'not-found'
          );
        },
        error: (_err: ApiRefusal) => this.kind.set('not-found'),
      });
    });
  }
}

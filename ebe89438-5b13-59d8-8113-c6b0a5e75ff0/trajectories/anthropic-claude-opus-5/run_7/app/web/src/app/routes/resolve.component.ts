import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CATEGORIES } from '../models';
import { EventPageComponent } from './event.component';
import { CategoryComponent } from './category.component';
import { CalendarPageComponent } from './calendar-page.component';
import { ProfileComponent } from './profile.component';
import { NotFoundComponent } from './system.component';
import { ApiService } from '../core/api.service';
import { SkeletonComponent } from '../shared/ui.components';
import { TopBarComponent } from '../shared/top-bar.component';
import { clearTheme } from '../core/theme';

/**
 * One lookup with fixed precedence: reserved system paths (handled by the
 * router above this route), then the twelve category names, then an event
 * slug, then a calendar slug, then an account handle, otherwise not found.
 */
@Component({
  selector: 'app-resolve',
  standalone: true,
  imports: [
    EventPageComponent, CategoryComponent, CalendarPageComponent, ProfileComponent,
    NotFoundComponent, SkeletonComponent, TopBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('category') { <app-category [slug]="slug()" /> }
      @case ('event') { <app-event-page [slug]="slug()" /> }
      @case ('calendar') { <app-calendar-page [slug]="slug()" /> }
      @case ('account') { <app-profile [handle]="slug()" /> }
      @case ('missing') { <app-not-found /> }
      @default {
        <app-top-bar />
        <main id="main" class="container loading" role="main">
          <app-skeleton w="60%" h="40px" radius="8px" />
          <div style="height:24px"></div>
          <app-skeleton w="100%" h="200px" radius="12px" />
        </main>
      }
    }
  `,
  styles: [`.loading { padding: 112px var(--s5) var(--s8); }`],
})
export class ResolveComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  slug = signal('');
  kind = signal<'loading' | 'category' | 'event' | 'calendar' | 'account' | 'missing'>('loading');

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const slug = (p.get('slug') ?? '').toLowerCase();
      this.slug.set(slug);
      this.kind.set('loading');

      // A category resolves without a round trip; the twelve names are fixed.
      if ((CATEGORIES as readonly string[]).includes(slug)) {
        clearTheme();
        this.kind.set('category');
        return;
      }
      this.api.resolve(slug).subscribe({
        next: (r) => {
          if (r.kind !== 'event') clearTheme();
          this.kind.set(
            r.kind === 'event' ? 'event'
              : r.kind === 'calendar' ? 'calendar'
                : r.kind === 'account' ? 'account'
                  : 'missing',
          );
        },
        error: () => {
          clearTheme();
          this.kind.set('missing');
        },
      });
    });
  }
}

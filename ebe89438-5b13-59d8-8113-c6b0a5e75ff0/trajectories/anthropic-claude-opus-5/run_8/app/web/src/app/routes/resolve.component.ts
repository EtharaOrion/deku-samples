import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { CATEGORIES } from '../core/models';
import { EventPageComponent } from './event-page.component';
import { CategoryPageComponent } from './category-page.component';
import { CalendarPageComponent } from './calendar-page.component';
import { ProfilePageComponent } from './profile-page.component';
import { NotFoundComponent } from './not-found.component';

type Kind = 'loading' | 'event' | 'category' | 'calendar' | 'account' | 'missing';

/** One lookup with fixed precedence decides what a root-namespace address is. */
@Component({
  selector: 'app-resolve',
  standalone: true,
  imports: [EventPageComponent, CategoryPageComponent, CalendarPageComponent, ProfilePageComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('event') {
        <app-event-page [slug]="slug()" />
      }
      @case ('category') {
        <app-category-page [name]="slug()" />
      }
      @case ('calendar') {
        <app-calendar-page [slug]="slug()" />
      }
      @case ('account') {
        <app-profile-page [handle]="slug()" />
      }
      @case ('missing') {
        <app-not-found />
      }
      @default {
        <div class="boot" aria-busy="true" aria-live="polite">
          <span class="sr-only">Loading this address</span>
          <div class="skeleton" style="height: 44px; width: 60%; max-width: 420px"></div>
          <div class="skeleton" style="height: 280px; margin-top: 24px"></div>
        </div>
      }
    }
  `,
  styles: [
    `
      .boot {
        max-width: 1080px;
        margin: 0 auto;
        padding: 112px var(--s5) var(--s5);
      }
    `,
  ],
})
export class ResolveComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly kind = signal<Kind>('loading');
  readonly slug = signal('');
  private sub?: Subscription;

  ngOnInit(): void {
    if (!this.api.bootstrapped()) void this.api.loadMe();
    this.sub = this.route.paramMap.subscribe((p) => {
      const slug = (p.get('slug') ?? '').toLowerCase();
      this.slug.set(slug);
      void this.resolve(slug);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async resolve(slug: string) {
    if (!slug) {
      this.kind.set('missing');
      return;
    }
    // The categories are known to the client, so a category page needs no round trip.
    if ((CATEGORIES as readonly string[]).includes(slug)) {
      this.kind.set('category');
      return;
    }
    this.kind.set('loading');
    try {
      const r = await this.api.resolve(slug);
      this.kind.set(r.kind === 'system' ? 'missing' : (r.kind as Kind));
    } catch {
      this.kind.set('missing');
    }
  }
}

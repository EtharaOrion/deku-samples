import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { CATEGORY_SET_CLIENT } from './category.page';
import { EventPage } from './event.page';
import { CalendarPageComponent } from './calendar.page';
import { CategoryPageComponent } from './category.page';
import { AccountPageComponent } from './account.page';
import { NotFoundPage } from './not-found.page';

type Kind = 'loading' | 'event' | 'calendar' | 'category' | 'account' | 'missing';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then event slugs, then calendar slugs, then account handles,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-resolve',
  standalone: true,
  imports: [
    EventPage,
    CalendarPageComponent,
    CategoryPageComponent,
    AccountPageComponent,
    NotFoundPage,
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
        <app-account-page [handle]="slug()" />
      }
      @case ('missing') {
        <app-not-found />
      }
      @default {
        <div class="boot" aria-busy="true">
          <div class="skeleton boot__bar"></div>
          <div class="skeleton boot__block"></div>
        </div>
      }
    }
  `,
  styles: [
    `
      .boot {
        min-height: 100vh;
        padding: 96px var(--s5);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
        max-width: 1080px;
        margin: 0 auto;
      }
      .boot__bar { height: 36px; width: 60%; }
      .boot__block { height: 380px; border-radius: var(--r-card); }
    `,
  ],
})
export class ResolvePage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly kind = signal<Kind>('loading');
  readonly slug = signal('');

  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      const slug = (params.get('slug') ?? '').toLowerCase();
      this.slug.set(slug);
      // The twelve category names are known to the client, so a category route
      // paints without waiting on a round trip.
      if (CATEGORY_SET_CLIENT.has(slug)) {
        this.kind.set('category');
        return;
      }
      this.kind.set('loading');
      this.api.resolve(slug).subscribe({
        next: (found) => {
          if (found.kind === 'event' || found.kind === 'calendar' || found.kind === 'account') {
            this.kind.set(found.kind);
          } else if (found.kind === 'category') {
            this.kind.set('category');
          } else {
            this.kind.set('missing');
          }
        },
        error: () => this.kind.set('missing'),
      });
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

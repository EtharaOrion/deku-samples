import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/api.service';
import { EventPageComponent } from './event-page.component';
import { CalendarPageComponent } from './calendar-page.component';
import { ProfilePageComponent } from './profile-page.component';
import { CategoryComponent } from './category.component';
import { NotFoundComponent } from './not-found.component';
import { CATEGORIES } from '../core/models';

/**
 * One lookup with fixed precedence: reserved system paths, then the twelve
 * category names, then events.slug, then calendars.slug, then accounts.handle,
 * otherwise the not-found page.
 */
@Component({
  selector: 'app-root-slug',
  standalone: true,
  imports: [EventPageComponent, CalendarPageComponent, ProfilePageComponent, CategoryComponent, NotFoundComponent],
  template: `
    @switch (kind()) {
      @case ('event') { <app-event-page /> }
      @case ('calendar') { <app-calendar-page /> }
      @case ('account') { <app-profile-page /> }
      @case ('category') { <app-category /> }
      @case ('loading') {
        <main class="page" style="padding-top:120px">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text" style="width:60%"></div>
        </main>
      }
      @default { <app-not-found /> }
    }
  `,
})
export class RootSlugComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  kind = signal<string>('loading');

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const slug = (p.get('slug') || '').toLowerCase();
      if ((CATEGORIES as readonly string[]).includes(slug)) { this.kind.set('category'); return; }
      this.kind.set('loading');
      this.api.resolve(slug).subscribe({
        next: (r) => this.kind.set(r.kind),
        error: () => this.kind.set('none'),
      });
    });
  }
}

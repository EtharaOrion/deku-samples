import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, ApiError } from '../core/api';
import { EventPage } from './event';
import { NotFound } from './not-found';
import { Category } from './category';
import { CalendarPage } from './calendar-page';
import { ProfilePage } from './profile-page';

/**
 * Root-namespace resolution with fixed precedence: reserved paths, then the
 * twelve category names, then events, then calendars, then accounts.
 */
@Component({
  selector: 'cc-root-resolver',
  standalone: true,
  imports: [EventPage, NotFound, Category, CalendarPage, ProfilePage],
  template: `
  @switch (kind) {
    @case ('event') { <cc-event-page></cc-event-page> }
    @case ('category') { <cc-category></cc-category> }
    @case ('calendar') { <cc-calendar-page></cc-calendar-page> }
    @case ('account') { <cc-profile-page></cc-profile-page> }
    @default { <cc-not-found></cc-not-found> }
  }`,
})
export class RootResolver implements OnInit {
  kind = '';

  constructor(private route: ActivatedRoute, private router: Router, private api: Api) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      const slug = (m.get('slug') ?? '').toLowerCase();
      try {
        const r = await this.api.request<{ kind: string }>(`/resolve/${slug}`);
        this.kind = r.kind;
      } catch {
        this.kind = '';
      }
    });
  }
}

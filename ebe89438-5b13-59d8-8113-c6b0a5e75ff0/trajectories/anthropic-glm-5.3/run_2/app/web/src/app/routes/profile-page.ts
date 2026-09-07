import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';
import { Avatar } from '../ui/avatar';
import { NotFoundEmbed } from './not-found-embed';
import { Api } from '../core/api';

/** A profile at its own short address: the handle, and nothing private. */
@Component({
  selector: 'cc-profile-page',
  standalone: true,
  imports: [PublicBar, RouterLink, Avatar, NotFoundEmbed],
  template: `
  <cc-public-bar></cc-public-bar>
  @if (loading) {
    <main class="container page"><div class="skeleton skeleton-text" style="width:40%"></div></main>
  } @else if (!who) {
    <main class="container page"><cc-not-found-embed></cc-not-found-embed></main>
  } @else {
    <main class="container page">
      <header class="mast row">
        <cc-avatar [name]="who.display_name" [size]="64"></cc-avatar>
        <div>
          <h1 class="h1-display title">{{ who.display_name }}</h1>
          <p class="caption">&#64;{{ who.handle }} · {{ who.role === 'host' ? 'Hosts events' : 'Goes to events' }}</p>
        </div>
      </header>
      @if (!events.length) {
        <div class="empty">
          <h2>No Public Events</h2>
          <p>Nothing published by this account is public right now.</p>
          <a class="btn btn-primary" routerLink="/discover">Discover Events</a>
        </div>
      } @else {
        <ul class="grid">
          @for (e of events; track e.slug) {
            <li><a class="card card-lift ev" [routerLink]="['/', e.slug]">
              <p class="card-title">{{ e.title }}</p>
              <p class="caption">{{ e.city }}</p>
            </a></li>
          }
        </ul>
      }
    </main>
  }`,
  styles: [`
    .page { padding-top: 104px; min-height: 100vh; }
    .mast { gap: 18px; margin-bottom: 36px; }
    .title { font-size: 34px; line-height: 40px; margin: 0; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid;
      grid-template-columns: repeat(2, 1fr); gap: 18px; }
    .ev { padding: 16px; display: grid; gap: 4px; }
  `],
})
export class ProfilePage implements OnInit {
  slug = '';
  loading = true;
  who: any = null;
  events: any[] = [];

  constructor(private route: ActivatedRoute, private api: Api) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(async m => {
      this.slug = (m.get('slug') ?? '').toLowerCase();
      try {
        // A profile carries the handle and any public work, never a guest list.
        this.who = await this.api.request<any>(`/accounts/${this.slug}`);
      } catch {
        this.who = null;
      }
      this.loading = false;
    });
  }
}

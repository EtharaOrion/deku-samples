import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicBarComponent } from '../ui/public-bar.component';
import { AvatarComponent } from '../ui/avatar.component';
import { CategoryIconComponent } from '../ui/category-icon.component';
import { ApiService } from '../core/api.service';
import { Account, Calendar } from '../core/models';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink, PublicBarComponent, AvatarComponent, CategoryIconComponent],
  template: `
    <app-public-bar />
    <main id="main" class="page">
      @if (loading()) {
        <div class="skeleton skeleton-title" style="height:44px"></div>
      }
      @if (!loading() && account(); as a) {
        <header class="head">
          <app-avatar [name]="a.display_name" [size]="64" [decorative]="true" />
          <h1 class="serif">{{ a.display_name }}</h1>
          <p class="t-caption muted">&#64;{{ a.handle }}</p>
        </header>
        @if (calendars().length) {
          <h2 class="t-section">Calendars</h2>
          <ul class="grid">
            @for (c of calendars(); track c.slug) {
              <li><a class="card cal" [routerLink]="['/', c.slug]">
                <app-category-icon [name]="c.category" [size]="24" />
                <span class="t-card-title">{{ c.name }}</span>
                <span class="t-caption muted">{{ c.city }}</span>
              </a></li>
            }
          </ul>
        } @else {
          <p class="t-caption muted">No public calendars.</p>
        }
      }
    </main>
  `,
  styles: [`
    main { padding-top: 96px; padding-bottom: 64px; }
    .head { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 32px; }
    h1 { font-size: 36px; line-height: 44px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, 1fr); margin-top: 16px; }
    .cal { display: flex; flex-direction: column; gap: 8px; color: inherit; }
    @media (max-width: 999px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 483px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ProfilePageComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  account = signal<Account | null>(null);
  calendars = signal<Calendar[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      this.loading.set(true);
      this.api.publicAccount(p.get('slug') || '').subscribe({
        next: (r) => { this.account.set(r.account); this.calendars.set(r.calendars); this.loading.set(false); },
        error: () => this.loading.set(false),
      });
    });
  }
}

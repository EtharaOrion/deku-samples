import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, EventRecord } from '../api.service';
import { PublicBarComponent } from '../public-bar';
import { AvatarComponent } from '../widgets';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-profile', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicBarComponent, AvatarComponent, NotFoundComponent],
  template: `
    @if (loading()) {
      <public-bar></public-bar>
      <main id="main" class="content-frame page"><div class="skeleton" style="height:120px"></div></main>
    } @else if (!acct) {
      <route-not-found></route-not-found>
    } @else {
      <public-bar></public-bar>
      <main id="main" class="content-frame page">
        <header class="stack gap-12">
          <cc-avatar [name]="acct.display_name" [size]="48"></cc-avatar>
          <h1 class="t-display title">{{ acct.display_name }}</h1>
          <p class="t-caption">&#64;{{ acct.handle }}</p>
          <p class="t-body">Hosts and attends gatherings on Community Calendar.</p>
        </header>
      </main>
    }
  `,
  styles: [`
    .page{max-width:640px;margin:0 auto;padding:64px 24px 96px;display:flex;flex-direction:column;gap:24px}
    .title{font-size:36px;line-height:42px}
  `],
})
export class ProfilePageComponent implements OnInit {
  handle = input.required<string>();
  api = inject(ApiService);
  acct: any = null;
  loading = signal(true);

  ngOnInit() {
    this.api.get<any>(`/resolve/${encodeURIComponent(this.handle())}`)
      .then(r => { if (r.kind !== 'account') throw new Error(); return r; })
      .then(() => { this.acct = { display_name: this.handle(), handle: this.handle() }; })
      .catch(() => { this.acct = null; })
      .finally(() => this.loading.set(false));
  }
}

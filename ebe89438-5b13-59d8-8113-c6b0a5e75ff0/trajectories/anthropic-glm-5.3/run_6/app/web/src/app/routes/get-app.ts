import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBarComponent } from '../public-bar';
import { ScanCodeComponent } from '../widgets';

@Component({
  selector: 'route-get-app', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PublicBarComponent, ScanCodeComponent],
  template: `
    <public-bar></public-bar>
    <main id="main" class="content-frame page">
      <div class="wrap">
        <div class="copy stack gap-16">
          <h1 class="t-display">Get the App</h1>
          <p class="t-para">Community Calendar lives in your pocket as this same page: every ticket you hold, every calendar you follow, one address away.</p>
          <p class="t-para">Point your camera at the code to open this app on another device.</p>
          <a routerLink="/discover" class="btn btn-secondary pill-btn">Discover Events</a>
        </div>
        <div class="code-card card card-lg elevated onboarding-card">
          <scan-code [value]="address()" [label]="'this app'" [size]="230"></scan-code>
          <p class="t-caption">{{ address() }}</p>
          <div class="stickers" aria-hidden="true">
            <span class="sticker s1">★</span><span class="sticker s2">·</span>
            <span class="sticker s3">✳</span><span class="sticker s4">★</span>
          </div>
        </div>
      </div>
    </main>
  `,
  styles: [`
    .page{max-width:960px;margin:0 auto;padding:64px 24px 96px}
    .wrap{display:grid;grid-template-columns:1fr 340px;gap:48px;align-items:center}
    .code-card{padding:24px;display:flex;flex-direction:column;gap:16px;align-items:center;position:relative}
    .sticker{position:absolute;font-size:20px;color:var(--pink);opacity:.8}
    .s1{top:-8px;right:-6px;transform:rotate(12deg)}
    .s2{bottom:10px;left:-10px;transform:rotate(-8deg);color:var(--blue)}
    .s3{top:40%;right:-18px;transform:rotate(-14deg);color:var(--green)}
    .s4{bottom:-10px;right:20%;transform:rotate(6deg);color:var(--amber)}
    @media (max-width:899px){ .wrap{grid-template-columns:1fr} }
  `],
})
export class GetAppComponent {
  address = signal(location.origin + '/app');
}

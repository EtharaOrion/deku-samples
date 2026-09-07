import { Component } from '@angular/core';
import { PublicBarComponent } from '../ui/public-bar.component';
import { ScanCodeComponent } from '../ui/scan-code.component';

@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [PublicBarComponent, ScanCodeComponent],
  template: `
    <app-public-bar />
    <main id="main" class="wrap">
      <h1 class="serif">Get the App</h1>
      <p class="t-long body">Point a camera at the code to open Deku on your phone.</p>
      <div class="stage">
        <app-scan-code [payload]="here" [size]="230" />
        @for (s of stickers; track s.k) {
          <span class="sticker" aria-hidden="true"
                [style.transform]="'rotate(' + s.rot + 'deg)'"
                [style.background]="s.bg" [style.left]="s.x" [style.top]="s.y">{{ s.text }}</span>
        }
      </div>
    </main>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: 16px; padding: 96px 24px 48px; text-align: center; }
    h1 { font-size: 32px; line-height: 40px; }
    .body { color: var(--ink-64); }
    .stage { position: relative; padding: 32px; }
    .sticker {
      position: absolute; padding: 4px 10px; border-radius: var(--r-full);
      font-size: 11px; line-height: 16px; font-weight: 600; color: #fff;
    }
  `],
})
export class GetAppComponent {
  here = typeof location !== 'undefined' ? location.origin : '/';
  stickers = [
    { k: 1, rot: -8, bg: '#f31a7c', x: '-8px', y: '8px', text: 'run club' },
    { k: 2, rot: 6, bg: '#146aeb', x: 'calc(100% - 60px)', y: '24px', text: 'books' },
    { k: 3, rot: -5, bg: '#3cbd2c', x: '-4px', y: 'calc(100% - 48px)', text: 'tonight' },
    { k: 4, rot: 9, bg: '#d69712', x: 'calc(100% - 72px)', y: 'calc(100% - 40px)', text: 'free' },
  ];
}

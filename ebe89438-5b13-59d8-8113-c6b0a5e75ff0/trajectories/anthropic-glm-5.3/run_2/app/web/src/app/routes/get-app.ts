import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicBar } from '../layout/public-bar';

@Component({
  selector: 'cc-get-app',
  standalone: true,
  imports: [PublicBar, RouterLink],
  template: `
  <cc-public-bar></cc-public-bar>
  <main class="container page">
    <h1 class="h1-display title">Get the App</h1>
    <p class="lede">Scan the code with your phone to open this calendar in your hand.</p>
    <div class="row qr-row">
      <svg viewBox="0 0 230 230" class="qr" role="img" aria-label="Scan code pointing at this page">
        <rect width="230" height="230" fill="#ffffff"/>
        @for (m of modules; track m.i) {
          <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="#151515"/>
        }
        @for (f of finders; track f.x) {
          <rect [attr.x]="f.x" [attr.y]="f.y" width="56.4" height="56.4" rx="15.456"
                fill="none" stroke="#151515" stroke-width="9.2"/>
        }
      </svg>
      <div class="stack-8">
        <span class="sticker" style="transform: rotate(-8deg)">Free</span>
        <span class="sticker" style="transform: rotate(5deg)">No ads</span>
        <span class="sticker" style="transform: rotate(-3deg)">Tickets in hand</span>
        <span class="sticker" style="transform: rotate(9deg)">Works offline</span>
      </div>
    </div>
  </main>`,
  styles: [`
    .page { padding-top: 120px; min-height: 100vh; }
    .title { font-size: 40px; margin: 0 0 12px; }
    .lede { color: var(--muted); max-width: 460px; margin: 0 0 32px; }
    .qr { width: 230px; height: 230px; }
    .qr-row { gap: 40px; align-items: center; }
    .sticker { display: inline-block; padding: 6px 14px; border-radius: 100px;
      background: var(--ink-04); font-size: 13px; font-weight: 600; color: var(--ink-64); }
  `],
})
export class GetApp {
  modules: { i: number; x: number; y: number }[] = [];
  finders = [{ x: 36.8, y: 36.8 }, { x: 137.0, y: 36.8 }, { x: 36.8, y: 137.0 }];

  constructor() { this.build(location.origin + '/app'); }

  private build(url: string): void {
    let h = 5381;
    for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
    let s = h;
    const next = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    const out: { i: number; x: number; y: number }[] = [];
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        const inFinder = (r: number, c: number) =>
          (r < 7 && c < 7) || (r < 7 && c >= 18) || (r >= 18 && c < 7);
        if (inFinder(row, col)) continue;
        if (next() > 0.5) out.push({ i: row * 25 + col, x: (4 + col) * 9.2, y: (4 + row) * 9.2 });
      }
    }
    this.modules = out;
  }
}

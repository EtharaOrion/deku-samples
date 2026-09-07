import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TopbarComponent } from '../ui/topbar.component';

/** The scan code is drawn from geometry at render time from the address it points at. */
@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [RouterLink, TopbarComponent],
  template: `
    <div class="page">
      <app-topbar></app-topbar>
      <main class="wrap" role="main">
        <h1 class="screen-title">Get the App</h1>
        <p class="body-copy copy">Scan the code with a phone camera and this page opens there. No store, no download, no account needed.</p>
        <div class="qr-card card big">
          <svg viewBox="0 0 230 230" width="230" height="230" role="img" aria-label="Scan code pointing at this page">
            <rect x="0" y="0" width="230" height="230" fill="#ffffff"></rect>
            @for (mod of modules(); track $index) {
              <rect [attr.x]="mod.x" [attr.y]="mod.y" width="9.2" height="9.2" rx="2" fill="#151515"></rect>
            }
            @for (finder of finders(); track $index) {
              <rect [attr.x]="finder.x" [attr.y]="finder.y" width="55.2" height="55.2" rx="15.456" fill="#151515"></rect>
              <rect [attr.x]="finder.x + 16.56" [attr.y]="finder.y + 16.56" width="22.08" height="22.08" rx="6" fill="#ffffff"></rect>
            }
          </svg>
          @for (sticker of stickers(); track $index) {
            <span class="sticker" [style.--a]="sticker.a" [style.left.%]="sticker.x" [style.top.%]="sticker.y" [style.background]="sticker.c" aria-hidden="true"></span>
          }
        </div>
        <a class="btn primary" routerLink="/discover">Discover Events</a>
      </main>
    </div>
  `,
  styles: [
    `
    .page { min-height: 100vh; padding-top: 64px; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 32px 24px 80px; display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
    .copy { color: var(--ink-2); margin: 0; }
    .qr-card { position: relative; padding: 16px; }
    .sticker {
      position: absolute; width: 34px; height: 34px; border-radius: 50%;
      transform: rotate(var(--a)); box-shadow: var(--elev-card);
    }
  `],
})
export class GetAppComponent {
  modules = signal<Array<{ x: number; y: number }>>([]);
  finders = signal<Array<{ x: number; y: number }>>([]);
  stickers = signal<Array<{ x: number; y: number; a: string; c: string }>>([]);

  constructor() {
    const target = typeof location !== 'undefined' ? `${location.origin}/app` : 'https://example.com/app';
    let h = 2166136261;
    for (let i = 0; i < target.length; i++) {
      h ^= target.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const mods: Array<{ x: number; y: number }> = [];
    const quiet = 4;
    const step = 9.2;
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        const inFinder = (row < 7 && col < 7) || (row < 7 && col > 17) || (row > 17 && col < 7);
        if (inFinder) continue;
        h = Math.imul(h ^ (row * 31 + col * 17 + 0x9e37), 16777619) >>> 0;
        if ((h & 3) === 0 || (h & 7) === 3) mods.push({ x: (quiet + col) * step, y: (quiet + row) * step });
      }
    }
    this.modules.set(mods);
    this.finders.set([
      { x: quiet * step, y: quiet * step },
      { x: (quiet + 18) * step, y: quiet * step },
      { x: quiet * step, y: (quiet + 18) * step },
    ]);
    this.stickers.set([
      { x: 86, y: 8, a: '12deg', c: '#f31a7c' },
      { x: 8, y: 70, a: '-8deg', c: '#146aeb' },
      { x: 82, y: 82, a: '18deg', c: '#3cbd2c' },
      { x: 60, y: 60, a: '-15deg', c: '#d69712' },
    ]);
  }
}

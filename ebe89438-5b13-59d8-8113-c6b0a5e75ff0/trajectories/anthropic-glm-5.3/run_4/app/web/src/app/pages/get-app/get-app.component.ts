import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STAR_PATH } from '../../core/visuals';

@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <h1 class="serif">Get the App</h1>
      <p class="sub">Scan the code with your camera to open Gatherline on this device.</p>
      <div class="qr card-lg">
        <svg viewBox="0 0 230 230" width="230" height="230" role="img" aria-label="Scan code for the Gatherline address">
          @for (m of modules; track $index) {
            <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" rx="1.4" fill="#151515" />
          }
          <g fill="#f31a7c" transform="rotate(-8 40 60)"><rect x="28" y="46" width="26" height="26" rx="6" opacity="0.85"/></g>
          <g fill="#146aeb" transform="rotate(10 190 170)"><circle cx="184" cy="168" r="13" opacity="0.85"/></g>
          <g fill="#d69712" transform="rotate(-14 60 190)"><rect x="48" y="178" width="22" height="22" rx="4" opacity="0.9"/></g>
          <g fill="#ab46dd" transform="rotate(6 196 52)"><rect x="184" y="40" width="20" height="20" rx="10" opacity="0.85"/></g>
        </svg>
      </div>
      <p class="caption addr">{{ origin }}</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </div>
  `,
  styles: [`
    .wrap { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 96px 24px 64px; text-align: center; }
    h1 { font-size: 32px; line-height: 40px; }
    .sub { color: var(--muted); max-width: 420px; }
    .qr { padding: 16px; background: #ffffff; }
    .addr { color: var(--muted); }
  `],
})
export class GetAppComponent {
  star = STAR_PATH;
  origin = window.location.origin;
  modules = this.build(window.location.origin);

  /** 25x25 module matrix at 9.2 per module with a 4-module quiet zone. */
  private build(url: string): Array<{ x: number; y: number }> {
    const n = 25;
    let h = 2166136261;
    for (let i = 0; i < url.length; i++) { h ^= url.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const out: Array<{ x: number; y: number }> = [];
    const quiet = 4;
    const ring = (x: number, y: number, mx: number, my: number): boolean => {
      const dx = x - mx, dy = y - my;
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
      const outer = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const inner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return outer || inner;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let on: boolean;
        if (x < 7 && y < 7) on = ring(x, y, 0, 0);
        else if (x >= n - 7 && y < 7) on = ring(x, y, n - 7, 0);
        else if (x < 7 && y >= n - 7) on = ring(x, y, 0, n - 7);
        else on = rnd() > 0.5;
        if (on) out.push({ x: (quiet + x) * 9.2, y: (quiet + y) * 9.2 });
      }
    }
    return out;
  }
}

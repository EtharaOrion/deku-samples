import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Brand } from '../ui/brand';
import { RouterLink } from '@angular/router';

/** 404 — the same page for a route that never existed and a route the visitor may not see. */
@Component({
  selector: 'g-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nf">
      <h1 class="t-h1">404 · Page Not Found</h1>
      <p class="t-row secondary">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </div>
  `,
  imports: [RouterLink],
  styles: [`
    :host { display: block; }
    .nf { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; padding: 64px 0; max-width: 480px; }
    .secondary { color: var(--ink-64); }
  `],
})
export class NotFoundPage {}

/** The one route where the lockup is tinted pink, darkening on hover. */
@Component({
  selector: 'g-suspended',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nf">
      <g-brand tone="suspended" />
      <h1 class="t-h1">Account Suspended</h1>
      <p class="t-row secondary">This user account is suspended for violating our terms of service.</p>
    </div>
  `,
  imports: [Brand],
  styles: [`
    :host { display: block; }
    .nf { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; padding: 64px 0; max-width: 480px; }
    .secondary { color: var(--ink-64); }
  `],
})
export class SuspendedPage {}

/** Get the App: a scan code generated at render time from the address it points at. */
@Component({
  selector: 'g-get-app',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1 class="t-h1">Get the App</h1>
      <p class="t-row secondary">Scan the code with a phone camera and Gather opens where you are standing.</p>
      <div class="code-card">
        <svg viewBox="0 0 230 230" width="230" height="230" role="img" aria-label="Scan code pointing at this page">
          <rect x="0" y="0" width="230" height="230" fill="var(--paper)"/>
          <g [attr.fill]="'var(--ink)'">
            @for (row of modules; track $index; let y = $index) {
              @for (cell of row; track $index; let x = $index) {
                @if (cell) {
                  <rect [attr.x]="xOf(x)" [attr.y]="yOf(y)" width="9.2" height="9.2" rx="1.6"/>
                }
              }
            }
          </g>
        </svg>
        <span class="sticker s1" aria-hidden="true"></span>
        <span class="sticker s2" aria-hidden="true"></span>
        <span class="sticker s3" aria-hidden="true"></span>
        <span class="sticker s4" aria-hidden="true"></span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wrap { display: flex; flex-direction: column; gap: 16px; padding: 32px 0 64px; max-width: 480px; }
    .secondary { color: var(--ink-64); }
    .code-card { position: relative; width: 230px; height: 230px; }
    .sticker {
      position: absolute; width: 28px; height: 28px; border-radius: 8px;
      box-shadow: var(--shadow-card);
    }
    .s1 { background: var(--pink); right: -10px; top: 24px; transform: rotate(14deg); }
    .s2 { background: var(--amber); left: -14px; bottom: 40px; transform: rotate(-10deg); }
    .s3 { background: var(--blue); right: 24px; bottom: -12px; transform: rotate(6deg); }
    .s4 { background: var(--green); left: 18px; top: -10px; transform: rotate(-16deg); }
  `],
})
export class GetAppPage {
  modules: boolean[][] = this.build();
  rows: number[] = [];
  private build(): boolean[][] {
    const size = 25;
    const quiet = 4;
    const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    let state = 2166136261;
    const target = typeof location !== 'undefined' ? location.origin + '/app' : 'https://gather.example/app';
    for (let i = 0; i < target.length; i++) {
      state ^= target.charCodeAt(i);
      state = Math.imul(state, 16777619) >>> 0;
    }
    const rnd = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0xffffffff;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) grid[y][x] = rnd() > 0.5;
    }
    const finder = (ox: number, oy: number) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const edge = x === 0 || y === 0 || x === 6 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[oy + y][ox + x] = edge || core;
        }
      }
    };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    void quiet;
    this.rows = grid.map((_, y) => y);
    return grid;
  }

  xOf(i: number): number { return 36.8 + i * 9.2; }
  yOf(y: number): number { return 36.8 + y * 9.2; }
}

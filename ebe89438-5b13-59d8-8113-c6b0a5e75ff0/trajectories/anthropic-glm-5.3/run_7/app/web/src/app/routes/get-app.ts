import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicShellComponent } from '../shells/public-shell';

/** The scan code is drawn as vector geometry from the address it points at. */
@Component({
  selector: 'app-scan-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 230 230" width="230" height="230" role="img" [attr.aria-label]="'Scan code for ' + target()">
      <rect width="230" height="230" fill="#ffffff" />
      @for (m of modules(); track $index) {
        <rect [attr.x]="m.x" [attr.y]="m.y" width="9.2" height="9.2" fill="#151515" />
      }
      @for (f of finders(); track $index) {
        <rect [attr.x]="f.x" [attr.y]="f.y" width="54.4" height="54.4" rx="15.456" fill="none"
              stroke="#151515" stroke-width="9.2" />
      }
    </svg>
  `,
  styles: [':host{display:inline-flex}'],
})
export class ScanMatrixComponent {
  target = input.required<string>();

  modules = computed(() => {
    const out: { x: number; y: number }[] = [];
    const v = this.target();
    let h = 2166136261;
    for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); }
    const size = 25;
    const quiet = 4;
    for (let r = quiet; r < size - quiet; r++) {
      for (let c = quiet; c < size - quiet; c++) {
        const inFinder = (r < quiet + 7 && c < quiet + 7)
          || (r < quiet + 7 && c >= size - quiet - 7)
          || (r >= size - quiet - 7 && c < quiet + 7);
        if (inFinder) continue;
        h ^= r * 31 + c * 17;
        h = Math.imul(h, 16777619) >>> 0;
        if ((h & 3) === 0) out.push({ x: c * 9.2, y: r * 9.2 });
      }
    }
    return out;
  });

  finders = computed(() => [
    { x: 4 * 9.2 + 4.6, y: 4 * 9.2 + 4.6 },
    { x: (25 - 4 - 7) * 9.2 + 4.6, y: 4 * 9.2 + 4.6 },
    { x: 4 * 9.2 + 4.6, y: (25 - 4 - 7) * 9.2 + 4.6 },
  ]);
}

@Component({
  selector: 'app-get-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicShellComponent, ScanMatrixComponent, RouterLink],
  template: `
    <app-public-shell>
      <div class="page">
        <h1>Get the App</h1>
        <p class="lede">Point a camera at the code to open this calendar on the device in your hand.</p>
        <div class="art">
          <div class="qr"><app-scan-matrix [target]="address()" /></div>
          <span class="sticker s1" aria-hidden="true"></span>
          <span class="sticker s2" aria-hidden="true"></span>
          <span class="sticker s3" aria-hidden="true"></span>
          <span class="sticker s4" aria-hidden="true"></span>
        </div>
        <a routerLink="/discover" class="btn btn-invert">Discover Events</a>
      </div>
    </app-public-shell>
  `,
  styles: [`
    .page { max-width: 640px; margin: 0 auto; padding: 48px 24px 96px; display: flex; flex-direction: column;
      gap: 20px; align-items: center; text-align: center; }
    h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; }
    .lede { color: var(--ink-64); max-width: 40ch; }
    .art { position: relative; padding: 16px; }
    .qr { box-shadow: var(--shadow-card), var(--ring-onboard); border-radius: var(--r-card); overflow: hidden; }
    .sticker { position: absolute; width: 54px; height: 54px; border-radius: var(--r-card); box-shadow: var(--shadow-card); }
    .s1 { background: #f31a7c; top: 0; right: -26px; transform: rotate(12deg); }
    .s2 { background: #146aeb; bottom: 14px; left: -30px; transform: rotate(-9deg); }
    .s3 { background: #3cbd2c; top: -22px; left: 30px; transform: rotate(24deg); }
    .s4 { background: #d69712; bottom: -20px; right: 40px; transform: rotate(-18deg); }
  `],
})
export class GetAppComponent {
  address = signal(`${location.origin}/discover`);
}

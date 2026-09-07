import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { PublicBarComponent } from '../ui/public-bar.component';
import { ScanCodeComponent } from '../ui/bits';
import { ThemeService } from '../core/theme.service';
import { coverBackground } from '../core/art';

/**
 * A scan code generated at render time from the address it points at, plus four
 * decorative stickers at slight angles, all drawn from geometry.
 */
@Component({
  selector: 'app-get-the-app',
  standalone: true,
  imports: [PublicBarComponent, ScanCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <main id="main" class="wrap">
      <div class="stickers" aria-hidden="true">
        @for (s of stickers(); track s.k) {
          <span
            class="sticker"
            [style.background]="s.background"
            [style.left.%]="s.left"
            [style.top.%]="s.top"
            [style.transform]="'rotate(' + s.rotate + 'deg)'"
          ></span>
        }
      </div>
      <h1 class="head">Get the App</h1>
      <p class="body t-prose">
        Point a camera at the code to open Deku on your phone. Everything here works in a mobile
        browser, so there is nothing to install.
      </p>
      <div class="code card card--lg">
        <app-scan-code [payload]="address()" [size]="220" />
      </div>
      <p class="t-caption addr">{{ address() }}</p>
    </main>
  `,
  styles: [
    `
      .wrap {
        position: relative;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s4);
        padding: 96px var(--s5) var(--s8);
        text-align: center;
        overflow: hidden;
      }
      .stickers { position: absolute; inset: 0; z-index: var(--z-decor); pointer-events: none; }
      .sticker {
        position: absolute;
        width: 116px;
        height: 116px;
        border-radius: var(--r-media);
        opacity: 0.5;
        filter: blur(0.5px);
        box-shadow: var(--elev-card);
      }
      .head { font-family: var(--serif); font-weight: 400; font-size: 44px; line-height: 50px; }
      .body { color: var(--ink-64); max-width: 460px; }
      .code {
        padding: var(--s5);
        background: var(--paper);
        display: inline-flex;
        box-shadow: var(--elev-fine);
      }
      .addr { color: var(--muted); word-break: break-all; max-width: 420px; }
    `,
  ],
})
export class GetTheAppPage implements OnInit {
  private theme = inject(ThemeService);

  readonly address = signal(typeof location !== 'undefined' ? location.origin + '/app' : '/app');

  readonly stickers = computed(() =>
    [
      { k: 'a', left: 8, top: 16, rotate: -8, seed: 'sticker-one' },
      { k: 'b', left: 78, top: 12, rotate: 6, seed: 'sticker-two' },
      { k: 'c', left: 12, top: 68, rotate: 9, seed: 'sticker-three' },
      { k: 'd', left: 80, top: 66, rotate: -5, seed: 'sticker-four' },
    ].map((s) => ({ ...s, background: coverBackground(s.seed) })),
  );

  ngOnInit(): void {
    this.theme.clear();
  }
}

import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { ScanCodeComponent } from '../ui/scan-code.component';
import { TopBarComponent } from '../ui/top-bar.component';

@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [TopBarComponent, ScanCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main class="page" id="main">
      <div class="col">
        <h1 class="t-serif">Get the App</h1>
        <p class="t-prose blurb">
          There is no store download to wait on. Point a camera at the code and the whole product opens in the
          browser you already have, at every width from a phone to a desk.
        </p>

        <div class="scan-stack">
          <span class="sticker s1" aria-hidden="true"></span>
          <span class="sticker s2" aria-hidden="true"></span>
          <app-scan-code [value]="url()" [size]="230" />
          <span class="sticker s3" aria-hidden="true"></span>
          <span class="sticker s4" aria-hidden="true"></span>
        </div>

        <p class="t-caption addr">{{ url() }}</p>
      </div>
    </main>
  `,
  styles: [
    `
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 96px var(--s4) var(--s8);
      }
      .col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s4);
        text-align: center;
        max-width: 480px;
      }
      h1 {
        font-size: 36px;
        line-height: 42px;
      }
      .blurb {
        color: var(--ink-64);
      }
      .scan-stack {
        position: relative;
        padding: var(--s5);
      }
      .sticker {
        position: absolute;
        width: 56px;
        height: 56px;
        border-radius: var(--r-media);
        box-shadow: var(--elev-card);
      }
      .s1 {
        top: -12px;
        left: -28px;
        transform: rotate(-9deg);
        background: #f31a7c;
      }
      .s2 {
        top: -20px;
        right: -24px;
        transform: rotate(7deg);
        background: #146aeb;
      }
      .s3 {
        bottom: -16px;
        left: -20px;
        transform: rotate(11deg);
        background: #3cbd2c;
      }
      .s4 {
        bottom: -22px;
        right: -30px;
        transform: rotate(-6deg);
        background: #d69712;
      }
      .addr {
        color: var(--muted);
        font-family: var(--mono);
      }
    `,
  ],
})
export class GetAppComponent {
  readonly url = computed(() => (typeof location === 'undefined' ? '/' : location.origin));
}

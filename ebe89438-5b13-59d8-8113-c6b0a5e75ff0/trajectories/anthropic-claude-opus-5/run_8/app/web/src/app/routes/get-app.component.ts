import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { clearTheme } from '../core/theme';
import { PublicBarComponent } from '../ui/public-bar.component';
import { ScanCodeComponent } from '../ui/scan-code.component';
import { CoverComponent } from '../ui/cover.component';

@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [PublicBarComponent, ScanCodeComponent, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-public-bar />
    <div class="public-shell">
      <main id="main" class="page holder">
        <div class="copy">
          <h1 class="serif">Get the App</h1>
          <p class="t-longform">
            Point a camera at the code and this calendar opens in the browser you already have. Nothing to install, nothing to
            sign away.
          </p>
          <div class="scan card">
            <app-scan-code [value]="address()" [size]="200" />
            <p class="t-caption addr">{{ address() }}</p>
          </div>
        </div>
        <div class="stickers" aria-hidden="true">
          @for (s of stickers; track s.seed) {
            <div class="sticker card" [style.transform]="'rotate(' + s.angle + 'deg)'">
              <app-cover [seed]="s.seed" [title]="s.title" radius="11px" />
            </div>
          }
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .holder {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--s7);
        align-items: start;
        padding-top: var(--s7);
      }
      @media (min-width: 1000px) {
        .holder {
          grid-template-columns: 1fr 1fr;
        }
      }
      h1 {
        font-size: 40px;
        line-height: 48px;
        font-weight: 400;
        margin-bottom: var(--s4);
      }
      .copy p {
        color: var(--ink-64);
        max-width: 480px;
      }
      .scan {
        margin-top: var(--s5);
        padding: var(--s5);
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: var(--s3);
        border-radius: var(--r-card-lg);
      }
      .addr {
        color: var(--muted);
        word-break: break-all;
        max-width: 240px;
        text-align: center;
      }
      .stickers {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--s5);
      }
      .sticker {
        overflow: hidden;
        border-radius: var(--r-media);
        box-shadow: var(--glass-rim);
      }
    `,
  ],
})
export class GetAppComponent implements OnInit {
  readonly address = signal('');
  readonly stickers = [
    { seed: 'sticker-one', title: 'Thursday Night', angle: -4 },
    { seed: 'sticker-two', title: 'Reading Night', angle: 3 },
    { seed: 'sticker-three', title: 'Track Session', angle: 5 },
    { seed: 'sticker-four', title: 'Book Swap', angle: -6 },
  ];

  ngOnInit(): void {
    clearTheme();
    this.address.set(window.location.origin + '/discover');
  }
}

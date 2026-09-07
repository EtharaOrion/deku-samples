import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TopBarComponent } from '../shared/top-bar.component';
import { ScanCodeComponent, CoverComponent } from '../shared/ui.components';
import { clearTheme } from '../core/theme';

/** The scan code is generated at render time from the address it points at. */
@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [NgStyle, TopBarComponent, ScanCodeComponent, CoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-top-bar />
    <main id="main" class="wrap" role="main">
      <div class="panel">
        <h1 class="display">Get the App</h1>
        <p class="secondary blurb">
          Point a camera at the code to open Deku Events on a phone. It is the
          same product, sized for a smaller screen.
        </p>
        <div class="code-card card card-lg">
          <app-scan-code [text]="url()" [size]="200"
                         label="Scan code opening Deku Events" />
        </div>
        <p class="caption tertiary">{{ url() }}</p>
      </div>

      <!-- four decorative stickers at slight angles -->
      <div class="stickers" aria-hidden="true">
        @for (s of stickers; track s.seed) {
          <div class="sticker" [ngStyle]="{
              left: s.left, top: s.top, transform: 'rotate(' + s.rotate + 'deg)'
            }">
            <app-cover [seed]="s.seed" [size]="96" />
          </div>
        }
      </div>
    </main>
  `,
  styles: [`
    .wrap { position: relative; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 112px var(--s5) var(--s8);
      overflow: hidden; }
    .panel { text-align: center; position: relative; z-index: 1; max-width: 420px; }
    h1 { font-size: 36px; line-height: 44px; }
    .blurb { margin-top: var(--s3); }
    .code-card { display: inline-flex; padding: var(--s4); margin: var(--s5) 0 var(--s3);
      background: var(--paper); }
    .stickers { position: absolute; inset: 0; z-index: 0; }
    .sticker { position: absolute; opacity: 0.85; }
    @media (max-width: 649px) { .stickers { display: none; } }
  `],
})
export class GetAppComponent implements OnInit {
  url = signal('');

  stickers = [
    { seed: 'sticker-a', left: '8%', top: '18%', rotate: -8 },
    { seed: 'sticker-b', left: '80%', top: '22%', rotate: 6 },
    { seed: 'sticker-c', left: '14%', top: '68%', rotate: 5 },
    { seed: 'sticker-d', left: '76%', top: '66%', rotate: -7 },
  ];

  ngOnInit() {
    clearTheme();
    // Read from the address the browser is actually on; never hardcoded.
    this.url.set(window.location.origin);
  }
}

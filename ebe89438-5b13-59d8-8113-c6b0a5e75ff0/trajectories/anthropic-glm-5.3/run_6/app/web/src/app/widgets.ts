import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CATEGORY_HUES, CATEGORY_LABELS, coverColors, scanMatrix, STATUS_LABELS } from './shared';

/** Geometry-drawn category glyphs, on a 24 grid, stroke 1.5, no fill. */
@Component({
  selector: 'cat-icon', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" [attr.stroke]="hue()"
         [attr.stroke-width]="1.5" stroke-linecap="round" stroke-linejoin="round" [attr.aria-hidden]="true">
      @switch (category()) {
        @case ('family') {
          <path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.8V20h13v-9.2"/>
          <path d="M12 17.2c1.6-1.2 2.6-2.1 2.6-3.2 0-.8-.6-1.4-1.4-1.4-.5 0-1 .3-1.2.7-.2-.4-.7-.7-1.2-.7-.8 0-1.4.6-1.4 1.4 0 1.1 1 2 2.6 3.2z"/>
        }
        @case ('books') {
          <rect x="3.5" y="4.5" width="7" height="15" rx="1.2"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.2"/>
          <path d="M10.5 6.5h3M10.5 17.5h3"/>
        }
        @case ('games') {
          <path d="M12 3 20 7.5v9L12 21 4 16.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>
        }
        @case ('tech') {
          <rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M9 10l-2.5 2L9 14M15 10l2.5 2L15 14M13.2 9.2l-2.4 5.6"/>
        }
        @case ('food-and-drink') {
          <path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9.5 8.5c0-1.2 1-1.4 1-2.6M13.5 8.5c0-1.2 1-1.4 1-2.6"/>
        }
        @case ('ai') {
          <path d="M11 5.5a3 3 0 0 0-3 3 3 3 0 0 0-2 2.8 3 3 0 0 0 1.6 2.7A3 3 0 0 0 11 18.5"/>
          <path d="M13 5.5a3 3 0 0 1 3 3 3 3 0 0 1 2 2.8 3 3 0 0 1-1.6 2.7A3 3 0 0 1 13 18.5"/>
          <path d="M12 5.5v13"/>
        }
        @case ('running') {
          <circle cx="15.5" cy="5.5" r="1.6"/><path d="M8.5 8.5l3.5 1.5 2-2.5 2.5 3"/>
          <path d="M13 12.5l-2.5 3-3 .5M14 15l1.5 4M9.5 13.5 6 15.5"/>
        }
        @case ('arts-and-culture') {
          <ellipse cx="12" cy="12" rx="8.5" ry="7"/><circle cx="7.5" cy="10" r=".9"/><circle cx="12" cy="8" r=".9"/>
          <circle cx="16.5" cy="10" r=".9"/><circle cx="9.5" cy="14.5" r=".9"/><circle cx="14.5" cy="14.5" r=".9"/>
        }
        @case ('climate') {
          <circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5S14.5 18.1 12 20.5"/>
          <path d="M14.5 15.5c-2 0-3.5-1.2-3.5-2.8 0-1.3 1-2.2 2.3-2.2 1.6 0 2.7 1.2 2.7 2.9"/>
        }
        @case ('fitness') {
          <path d="M4 9v6M6.5 7.5v9M2.5 10.5v3"/><path d="M20 9v6M17.5 7.5v9M21.5 10.5v3"/>
          <path d="M6.5 12h11"/>
        }
        @case ('wellness') {
          <path d="M12 19.5c-3.6-1.7-5.5-4.2-5.5-7 0-2.2 1.7-4 3.9-4 1 0 1.9.4 2.6 1"/>
          <path d="M12 19.5c3.6-1.7 5.5-4.2 5.5-7 0-2.2-1.7-4-3.9-4-1 0-1.9.4-2.6 1"/>
          <path d="M12 9.5c-2.6-3.4-7.4-2.6-7.4.9 0 2.4 3 3.9 7.4 3.9s7.4-1.5 7.4-3.9c0-3.5-4.8-4.3-7.4-.9z"/>
        }
        @case ('crypto') {
          <circle cx="12" cy="12" r="8.5"/><path d="M9.5 8h3.2a2 2 0 0 1 0 4H9.5zM9.5 12h3.7a2 2 0 0 1 0 4H9.5zM11 6.5v11M13 6.5v11"/>
        }
        @default { <circle cx="12" cy="12" r="8.5"/> }
      }
    </svg>
    @if (label()) { <span class="sr-only">{{ labelName() }}</span> }
  `,
  host: { '[style.display]': '"inline-flex"', '[style.alignItems]': '"center"' },
})
export class CatIconComponent {
  category = input<string>('running');
  size = input<number>(24);
  label = input<boolean>(false);
  hue = computed(() => CATEGORY_HUES[this.category()] || '#146aeb');
  labelName = computed(() => CATEGORY_LABELS[this.category()] || this.category());
}

/** The brand mark: a four-pointed star with concave sides, drawn from geometry. */
@Component({
  selector: 'brand-mark', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 133 134" [attr.aria-hidden]="true" fill="currentColor">
      <path d="M66.5 0 C 70 44, 89 63, 133 67 C 89 71, 70 90, 66.5 134 C 63 90, 44 71, 0 67 C 44 63, 63 44, 66.5 0 Z"/>
    </svg>
  `,
  host: { '[style.display]': '"inline-flex"' },
})
export class BrandMarkComponent {
  size = input<number>(18);
}

/** Generated event cover: gradient ground, two radial flashes, grain, wordmark. */
@Component({
  selector: 'event-cover', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover" [class.cover-lg]="size() === 'lg'" [style.border-radius]="'12.8% / 5.7%'">
      <div class="cover-blurred" [style.background]="c().linear"></div>
      <div class="cover-main" [style.background]="c().linear">
        <div class="cover-radial" [style.background]="c().radial1"></div>
        <div class="cover-radial" [style.background]="c().radial2"></div>
        <div class="cover-grain"></div>
        @if (title()) {
          <div class="cover-title" [style.fontSize]="'12%'">{{ title() }}</div>
        }
        <div class="cover-glow"></div>
        <div class="cover-sheen"></div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block}
    .cover{position:relative;overflow:hidden;aspect-ratio:1}
    .cover-blurred{position:absolute;inset:-2%;filter:brightness(.8) blur(24px) saturate(1.2);mix-blend-mode:multiply;opacity:.2}
    .cover-main{position:absolute;inset:0;overflow:hidden;transform:matrix(1.005,0,0,1.005,0,0);animation:nudge 1000ms linear infinite}
    .cover-radial{position:absolute;inset:0;mix-blend-mode:plus-lighter}
    .cover-grain{
      position:absolute;inset:0;opacity:.06;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .cover-title{
      position:absolute;inset:auto 0 0 0;padding:6% 8%;color:#fff;font-weight:700;line-height:1.1;
      text-shadow:rgba(0,0,0,.2) 0 0 5px;font-size:12%;
      display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
    }
    .cover-glow{
      position:absolute;inset:0;
      background:linear-gradient(135deg, rgba(255,255,255,.55), rgba(255,255,255,0) 60%);
      -webkit-mask-image:radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
      mask-image:radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255,255,255), rgba(255,255,255,0));
    }
    .cover-sheen{
      position:absolute;inset:0;
      background:linear-gradient(160deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%);
      -webkit-mask-image:radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
      mask-image:radial-gradient(128px, rgb(255,255,255), rgba(255,255,255,0));
    }
    :host{filter:saturate(2)}
    :host ::ng-deep{filter:none}
  `],
})
export class EventCoverComponent {
  seed = input<string>('');
  title = input<string>('');
  size = input<'sm' | 'md' | 'lg'>('md');
  c = computed(() => coverColors(this.seed()));
}

/** Status word in a pill, never a colour alone. */
@Component({
  selector: 'status-pill', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="status-pill" [class]="'s-' + status()">{{ label() }}</span>`,
})
export class StatusPillComponent {
  status = input.required<string>();
  label = computed(() => STATUS_LABELS[this.status()] || this.status());
}

/** Avatar generated from the display name: a coloured circle carrying the initial. */
@Component({
  selector: 'cc-avatar', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="avatar" [style.width.px]="size()" [style.height.px]="size()" [style.background]="bg()" [style.color]="fg()"
          [attr.aria-hidden]="true">{{ initial() }}</span>
  `,
  styles: [`
    :host{display:inline-flex}
    .avatar{border-radius:100%;display:inline-flex;align-items:center;justify-content:center;font-weight:600;
      box-shadow:rgba(0,15,58,.08) 0 0 0 .5px inset;font-size:.85em;line-height:1}
  `],
})
export class AvatarComponent {
  name = input<string>('');
  size = input<number>(24);
  initial = computed(() => (this.name().trim()[0] || '·').toUpperCase());
  private hues = ['#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#f31a7c', '#125dce'];
  bg = computed(() => {
    let h = 0; const s = this.name() || 'x';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return this.hues[h % this.hues.length] + '22';
  });
  fg = computed(() => {
    let h = 0; const s = this.name() || 'x';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return this.hues[h % this.hues.length];
  });
}

/** The scan code drawn as vector geometry from a string. */
@Component({
  selector: 'scan-code', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 230 230" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="'Scan code for ' + label()">
      <rect width="230" height="230" fill="var(--paper)"/>
      @for (f of finders; track f.x) {
        <rect [attr.x]="f.x" [attr.y]="f.y" width="34.5" height="34.5" rx="6.5" fill="var(--ink)"/>
        <rect [attr.x]="f.x + 6.5" [attr.y]="f.y + 6.5" width="21.5" height="21.5" rx="3" fill="var(--paper)"/>
        <rect [attr.x]="f.x + 12.2" [attr.y]="f.y + 12.2" width="10.1" height="10.1" rx="2" fill="var(--ink)"/>
      }
      @for (row of m(); track ri; let ri = $index) {
        @for (cell of row; track ci; let ci = $index) {
          @if (cell) {
            <rect [attr.x]="colX(ci)" [attr.y]="rowY(ri)" width="9.2" height="9.2" rx="1.6" fill="var(--ink)"/>
          }
        }
      }
    </svg>
  `,
  host: { '[style.display]': '"inline-block"' },
})
export class ScanCodeComponent {
  value = input.required<string>();
  size = input<number>(160);
  label = input<string>('this address');
  m = computed(() => scanMatrix(this.value()));
  finders = [
    { x: 36.8, y: 36.8 },
    { x: 230 - 36.8 - 34.5, y: 36.8 },
    { x: 36.8, y: 230 - 36.8 - 34.5 },
  ];
  colX(i: number) { return 36.8 + i * 9.2; }
  rowY(i: number) { return 36.8 + i * 9.2; }
}

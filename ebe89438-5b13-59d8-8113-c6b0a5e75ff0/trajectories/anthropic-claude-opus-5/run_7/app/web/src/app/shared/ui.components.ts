import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output,
} from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';
import { avatarColour, coverBackground, initialOf, scanCode } from '../core/art';

/** The brand mark: a four-pointed star with concave sides on the coordinate
 *  box 0 0 133 134, drawn from geometry rather than an image file. */
@Component({
  selector: 'app-brand',
  standalone: true,
  imports: [RouterLink, NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="link" class="lockup" [ngStyle]="{ color: tint || 'inherit' }"
       [attr.aria-label]="'Deku Events, home'">
      <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 133 134"
           fill="currentColor" aria-hidden="true" class="mark">
        <path d="M66.5 0C69 36 97 64 133 66.5 97 69 69 97 66.5 134 64 97 36 69 0 66.5 36 64 64 36 66.5 0Z" />
      </svg>
      @if (showWord) { <span class="wordmark">Deku</span> }
    </a>
  `,
  styles: [`
    .lockup { display: inline-flex; align-items: center; gap: 8px; color: inherit; }
    .lockup:hover { color: inherit; }
    .mark { position: relative; top: -2px; flex: none; }
    .wordmark { font-weight: 700; letter-spacing: -0.02em; font-size: 18px; }
  `],
})
export class BrandComponent {
  @Input() size = 18;
  @Input() link = '/';
  @Input() showWord = true;
  @Input() tint = '';
}

/**
 * A generated cover tile. It carries a glow layer and a sheen layer, both
 * masked and filled with the tile's own colour under a saturate(2) wrapper so
 * the glow reads as coloured light, plus a blurred copy beneath it.
 */
@Component({
  selector: 'app-cover',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cover-wrap" [ngStyle]="{ width: px(size), height: px(size) }">
      <div class="under" [ngStyle]="{ background: bg }" aria-hidden="true"></div>
      <div class="sat">
        <div class="tile" [class.cover-nudge]="drift" [ngStyle]="{ background: bg, borderRadius: radius }">
          <div class="glow" [ngStyle]="{ background: bg }"></div>
          <div class="sheen" [ngStyle]="{ background: bg }"></div>
          <span class="title" *ngIf="title" [ngStyle]="{ fontSize: titleSize }">{{ title }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cover-wrap { position: relative; display: block; flex: none; }
    /* Beneath the cover sits a blurred copy of it. */
    .under {
      position: absolute; inset: 0; z-index: -1;
      filter: brightness(0.8) blur(24px) saturate(1.2);
      mix-blend-mode: multiply; opacity: 0.2;
    }
    /* saturate(2) makes the glow read as coloured light, not a grey halo. */
    .sat { filter: saturate(2); width: 100%; height: 100%; }
    .tile {
      position: relative; width: 100%; height: 100%; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      transform: matrix(1.005, 0, 0, 1.005, 0, 0);
    }
    .cover-nudge { animation: nudge 1000ms linear infinite; }
    .glow {
      position: absolute; inset: 0;
      -webkit-mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
      mask-image: radial-gradient(96px at calc(50% + 10px) calc(50% + 10px), rgb(255, 255, 255), rgba(255, 255, 255, 0));
    }
    .sheen {
      position: absolute; inset: 0;
      -webkit-mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
      mask-image: radial-gradient(128px, rgb(255, 255, 255), rgba(255, 255, 255, 0));
    }
    .title {
      position: relative; color: #ffffff; font-weight: 700;
      text-align: center; padding: 8% ; line-height: 1.15;
      text-shadow: rgba(0, 0, 0, 0.2) 0px 0px 5px;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
    }
  `],
})
export class CoverComponent {
  @Input() seed = 'seed';
  @Input() size: number | string = 120;
  @Input() title = '';
  @Input() drift = false;
  /** Cover tiles use the elliptical radius so the corner curve tracks the
   *  tile's aspect ratio rather than staying constant. */
  @Input() radius = '12.8% / 5.7%';

  get bg(): string { return coverBackground(this.seed); }
  get titleSize(): string {
    const n = typeof this.size === 'number' ? this.size : 120;
    return `${Math.max(9, Math.round(n * 0.12))}px`; // 12% of the square's height
  }
  px(v: number | string): string { return typeof v === 'number' ? `${v}px` : v; }
}

/** Avatars are generated from the display name as a coloured circle carrying
 *  the initial, never a grey silhouette. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="avatar" [ngStyle]="{
      width: size + 'px', height: size + 'px',
      background: colour, fontSize: (size * 0.42) + 'px'
    }" [attr.aria-hidden]="decorative ? 'true' : null"
      [attr.title]="decorative ? null : name">{{ initial }}</span>
  `,
  styles: [`
    .avatar {
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 100%; color: #ffffff; font-weight: 600; flex: none;
      box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset;
      user-select: none;
    }
  `],
})
export class AvatarComponent {
  @Input() name = '';
  @Input() size = 24;
  @Input() decorative = false;
  get colour(): string { return avatarColour(this.name); }
  get initial(): string { return initialOf(this.name); }
}

/** A scan code drawn as vector geometry from the address it points at. */
@Component({
  selector: 'app-scan-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 230 230"
         role="img" [attr.aria-label]="label">
      <rect width="230" height="230" fill="#ffffff" />
      <g fill="#151515">
        @for (m of filled; track m.k) {
          <rect [attr.x]="m.x" [attr.y]="m.y"
                [attr.width]="code.moduleSize" [attr.height]="code.moduleSize" />
        }
      </g>
      <!-- three finder patterns as rounded squares -->
      @for (f of finders; track $index) {
        <g>
          <rect [attr.x]="f.x" [attr.y]="f.y" [attr.width]="fs" [attr.height]="fs"
                [attr.rx]="code.finderRadius" fill="none" stroke="#151515" stroke-width="9.2" />
          <rect [attr.x]="f.x + 18.4" [attr.y]="f.y + 18.4"
                [attr.width]="fs - 36.8" [attr.height]="fs - 36.8"
                [attr.rx]="code.finderRadius / 2.2" fill="#151515" />
        </g>
      }
    </svg>
  `,
})
export class ScanCodeComponent implements OnChanges {
  @Input() text = '';
  @Input() size = 180;
  @Input() label = 'Scan code for this ticket';

  code = scanCode('');
  /** The matrix flattened once per input, so the template draws a single list. */
  filled: { x: number; y: number; k: string }[] = [];

  ngOnChanges() {
    this.code = scanCode(this.text);
    const out: { x: number; y: number; k: string }[] = [];
    this.code.modules.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) out.push({ x: this.mx(x), y: this.my(y), k: `${x}-${y}` });
      });
    });
    this.filled = out;
  }

  /** A quiet zone of 4 modules, so the matrix starts at 4 * 9.2. */
  private readonly quiet = 4 * 9.2;
  get fs() { return 7 * 9.2; }
  get finders() {
    const q = this.quiet;
    const span = 25 * 9.2;
    return [
      { x: q, y: q },
      { x: q + span - this.fs, y: q },
      { x: q, y: q + span - this.fs },
    ];
  }
  mx(i: number) { return this.quiet + i * 9.2; }
  my(i: number) { return this.quiet + i * 9.2; }
}

/** Registration state is carried as a word in a pill, never by colour alone. */
@Component({
  selector: 'app-pill',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [ngClass]="cls">{{ word }}</span>`,
})
export class PillComponent {
  @Input() word = '';
  @Input() cls = 'pill';
}

/** The one spinner in the product, inside a control that is working. */
@Component({
  selector: 'app-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="spinner" viewBox="0 0 50 50" aria-hidden="true">
      <circle cx="25" cy="25" r="20" />
    </svg>
  `,
})
export class SpinnerComponent {}

/** An empty state names the absence, says what to do instead, and offers one
 *  way out. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <h2>{{ heading }}</h2>
      <p>{{ body }}</p>
      @if (actionLink) {
        <a class="btn btn-primary" [routerLink]="actionLink">{{ actionLabel }}</a>
      } @else if (actionLabel) {
        <button type="button" class="btn btn-primary" (click)="action.emit()">{{ actionLabel }}</button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() heading = '';
  @Input() body = '';
  @Input() actionLabel = '';
  @Input() actionLink: string | any[] | null = null;
  @Output() action = new EventEmitter<void>();
}

/** A skeleton block on the skeleton ground, at the radius of the thing it
 *  stands for, holding the final layout so nothing shifts when data lands. */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [NgStyle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="skeleton" [ngStyle]="{ width: w, height: h, borderRadius: radius }"></div>`,
})
export class SkeletonComponent {
  @Input() w = '100%';
  @Input() h = '16px';
  @Input() radius = '4px';
}

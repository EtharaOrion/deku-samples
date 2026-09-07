import { Component, Input, OnChanges } from '@angular/core';

/** A generated avatar: a coloured circle carrying the initial. */
@Component({
  selector: 'cc-avatar',
  standalone: true,
  template: `<span class="avatar" [style.width.px]="size" [style.height.px]="size"
    [style.background]="hue" [style.fontSize.px]="size * 0.42" aria-hidden="true">{{ initial }}</span>`,
  styles: [`
    .avatar { display: inline-flex; align-items: center; justify-content: center;
      border-radius: 100%; color: #fff; font-weight: 600; flex: none;
      box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset; }
  `],
})
export class Avatar implements OnChanges {
  @Input() name = '';
  @Input() size = 24;
  initial = '?';
  hue = '#757575';

  ngOnChanges(): void {
    this.initial = (this.name || '?').trim().charAt(0).toUpperCase() || '?';
    let h = 0;
    for (let i = 0; i < this.name.length; i++) h = (h * 31 + this.name.charCodeAt(i)) >>> 0;
    const gold = h % 360;
    this.hue = `hsl(${gold} 55% 42%)`;
  }
}

import { Component, Input } from '@angular/core';

const AVATAR_HUES = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41'];
function pick(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

/** A coloured circle carrying the initial — never a grey silhouette. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <span class="avatar hairline-avatar" [style.width.px]="size" [style.height.px]="size"
          [style.background]="bg" [style.fontSize.px]="size * 0.42" [attr.aria-hidden]="ariaHidden" role="img" [attr.aria-label]="ariaHidden ? null : name">
      {{ initial }}
    </span>
  `,
  styles: [`
    .avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 100%; color: #ffffff; font-weight: 600; flex: none; }
  `],
})
export class AvatarComponent {
  @Input({ required: true }) name!: string;
  @Input() size = 24;
  @Input() ariaHidden = false;
  get initial() { return (this.name || '?').trim().charAt(0).toUpperCase(); }
  get bg() { return pick(this.name || '?'); }
}

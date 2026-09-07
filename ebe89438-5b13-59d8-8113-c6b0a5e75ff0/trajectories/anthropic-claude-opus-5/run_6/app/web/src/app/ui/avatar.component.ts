import { Component, Input } from '@angular/core';
import { avatarFor } from '../core/art';

/** Avatars are generated from the display name, never a grey silhouette. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <span class="avatar" [style.width.px]="size" [style.height.px]="size"
          [style.background]="art.bg" [style.font-size.px]="size * 0.42"
          [attr.aria-hidden]="decorative ? 'true' : null"
          [attr.role]="decorative ? null : 'img'"
          [attr.aria-label]="decorative ? null : name">
      {{ art.initial }}
    </span>
  `,
  styles: [`
    .avatar {
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 100%; color: #fff; font-weight: 600; flex: none;
      box-shadow: var(--hairline-inset);
    }
  `],
})
export class AvatarComponent {
  @Input() name = '';
  @Input() size = 32;
  @Input() decorative = false;
  get art() { return avatarFor(this.name); }
}

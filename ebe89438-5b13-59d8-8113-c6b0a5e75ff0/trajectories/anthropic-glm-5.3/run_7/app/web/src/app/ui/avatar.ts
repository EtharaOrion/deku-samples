import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const AVATAR_HUES = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41'];

/** A generated avatar: a coloured circle carrying the initial. */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="avatar" [style.background]="hue()" [style.width.px]="size()" [style.height.px]="size()"
          [attr.aria-hidden]="label() ? null : 'true'" [attr.aria-label]="label() || null">{{ initial() }}</span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .avatar {
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 100%; color: #fff; font: 600 13px/1 var(--sans);
      box-shadow: var(--hairline-avatar); flex: none; letter-spacing: 0;
    }
  `],
})
export class AvatarComponent {
  name = input.required<string>();
  size = input(24);
  label = input<string | undefined>(undefined);

  initial = computed(() => (this.name().trim()[0] ?? '?').toUpperCase());
  hue = computed(() => {
    let h = 0;
    const s = this.name();
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_HUES[h % AVATAR_HUES.length];
  });
}

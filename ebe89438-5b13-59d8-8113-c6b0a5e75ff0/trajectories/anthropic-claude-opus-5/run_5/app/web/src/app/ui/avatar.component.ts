import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { avatarColour, initial } from '../core/art';

/**
 * Avatars for accounts with no picture are generated from the display name as a
 * coloured circle carrying the initial, never a grey silhouette. The hairline is
 * an inset shadow, so it never affects layout.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="colour()"
      [style.font-size.px]="size() * 0.44"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      >{{ letter() }}</span
    >
  `,
  styles: [
    `
      :host { display: inline-flex; line-height: 0; flex: none; }
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--r-circle);
        color: #ffffff;
        font-weight: 600;
        line-height: 1;
        box-shadow: var(--hairline-inset);
        flex: none;
      }
    `,
  ],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input(24);
  readonly label = input<string | null>(null);

  readonly colour = computed(() => avatarColour(this.name()));
  readonly letter = computed(() => initial(this.name()));
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const HUES = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff'];

/**
 * An account with no picture gets a coloured circle carrying its initial,
 * generated from the display name, never a grey silhouette.
 */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="av"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.background]="hue()"
      [style.font-size.px]="fontSize()"
      [attr.title]="name()"
      role="img"
      [attr.aria-label]="name()"
      >{{ initial() }}</span
    >
  `,
  styles: [
    `
      .av {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 100%;
        color: #ffffff;
        font-weight: 600;
        box-shadow: rgba(0, 15, 58, 0.08) 0px 0px 0px 0.5px inset;
        flex: none;
        user-select: none;
      }
    `,
  ],
})
export class AvatarComponent {
  name = input<string>('');
  size = input<number>(24);

  readonly initial = computed(() => (this.name().trim()[0] ?? '?').toUpperCase());
  readonly fontSize = computed(() => Math.max(10, Math.round(this.size() * 0.42)));
  readonly hue = computed(() => {
    const n = this.name();
    let h = 0;
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length]!;
  });
}

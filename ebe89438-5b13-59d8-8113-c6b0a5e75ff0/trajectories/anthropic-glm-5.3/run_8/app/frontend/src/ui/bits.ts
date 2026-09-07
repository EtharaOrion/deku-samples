import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { avatarHue, initial } from '../art';
import { Toast } from '../domain';

@Component({
  selector: 'g-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="avatar" [class.avatar-lg]="size === 'lg'" [class.avatar-xl]="size === 'xl'"
          [style.background]="hue" [attr.aria-hidden]="name ? null : 'true'">{{ letter }}</span>
  `,
})
export class Avatar {
  @Input({ required: true }) name!: string;
  @Input() size: 'sm' | 'lg' | 'xl' = 'sm';
  get hue(): string {
    return avatarHue(this.name);
  }
  get letter(): string {
    return initial(this.name);
  }
}

/** A status word in a pill; the colour is additional, never the only mark. */
@Component({
  selector: 'g-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill {{ tone }}"><span class="dot" aria-hidden="true"></span>{{ word }}</span>
  `,
})
export class Pill {
  @Input({ required: true }) word!: string;
  @Input() tone = 'pill-neutral';
}

@Component({
  selector: 'g-date-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="date-chip"><span class="month">{{ month }}</span><span class="day">{{ day }}</span></span>
  `,
})
export class DateChip {
  @Input({ required: true }) iso!: string;
  get month(): string {
    return new Date(this.iso).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  }
  get day(): string {
    return String(new Date(this.iso).getUTCDate()).padStart(2, '0');
  }
}

/** Transient notices: a leading edge in the status hue, announced politely. */
@Component({
  selector: 'g-notices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notice-host" role="status" aria-live="polite">
      @for (n of toast.items(); track n.id) {
        <div class="notice notice-{{ n.tone }}" (click)="toast.dismiss(n.id)">
          <span class="t-row">{{ n.message }}</span>
        </div>
      }
    </div>
  `,
})
export class Notices {
  constructor(public toast: Toast) {}
}


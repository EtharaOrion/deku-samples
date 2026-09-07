import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StatusTone } from '../core/models';

/**
 * Registration state is carried as a word in a pill, never by colour alone: the
 * dot repeats what the word already says.
 */
@Component({
  selector: 'app-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill" [class]="'pill pill--' + tone()">
      <span class="pill__dot" aria-hidden="true"></span>
      <span>{{ word() }}</span>
    </span>
  `,
  styles: [':host { display: inline-flex; }'],
})
export class PillComponent {
  readonly word = input.required<string>();
  readonly tone = input<StatusTone>('neutral');
}

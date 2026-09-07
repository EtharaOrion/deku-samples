import { Component, Input } from '@angular/core';
import { RegistrationStatus, STATUS_TONE, STATUS_WORDS } from '../core/models';

/** Registration state is always a word in a pill, never a colour alone. */
@Component({
  selector: 'app-pill',
  standalone: true,
  template: `
    <span class="pill" [class]="'pill-' + tone">
      <span class="dot" aria-hidden="true"></span>{{ label }}
    </span>
  `,
})
export class PillComponent {
  @Input() status?: RegistrationStatus;
  @Input() text?: string;
  @Input() toneOverride?: string;

  get label() { return this.text ?? (this.status ? STATUS_WORDS[this.status] : ''); }
  get tone() {
    return this.toneOverride ?? (this.status ? STATUS_TONE[this.status] : 'neutral');
  }
}

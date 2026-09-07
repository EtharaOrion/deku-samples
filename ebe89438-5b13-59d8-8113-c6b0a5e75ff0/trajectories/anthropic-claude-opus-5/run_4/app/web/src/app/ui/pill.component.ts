import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  EVENT_STATE_LABELS,
  EVENT_STATE_TONE,
  EventState,
  RegistrationStatus,
  STATUS_LABELS,
  STATUS_TONE,
} from '../core/models';

/** Registration state is always a word in a pill, never a colour alone. */
@Component({
  selector: 'app-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="tone()">{{ label() }}</span>`,
})
export class PillComponent {
  status = input<RegistrationStatus | null>(null);
  eventState = input<EventState | null>(null);
  text = input<string>('');
  tone_ = input<string>('pill-neutral');

  readonly label = computed(() => {
    const s = this.status();
    if (s) return STATUS_LABELS[s];
    const e = this.eventState();
    if (e) return EVENT_STATE_LABELS[e];
    return this.text();
  });

  readonly tone = computed(() => {
    const s = this.status();
    if (s) return STATUS_TONE[s];
    const e = this.eventState();
    if (e) return EVENT_STATE_TONE[e];
    return this.tone_();
  });
}

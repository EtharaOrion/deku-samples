import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { inZone, localZone, parseInstant, zoneLabel } from '../core/tokens';

/** An event's own zone first, the visitor's underneath when the two differ. */
@Component({
  selector: 'app-event-when',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="when">
      <span class="line">{{ main() }}</span>
      @if (sub()) { <span class="sub">{{ sub() }}</span> }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .when { display: inline-flex; flex-direction: column; }
    .line { font-size: 15px; line-height: 22px; }
    .sub { font-size: 13px; line-height: 18px; color: var(--muted); }
  `],
})
export class EventWhenComponent {
  startsAt = input.required<string>();
  endsAt = input.required<string>();
  timeZone = input.required<string>();
  compact = input(false);

  private start = computed(() => parseInstant(this.startsAt()));
  private end = computed(() => parseInstant(this.endsAt()));
  private tz = computed(() => this.timeZone());

  main = computed(() => {
    const s = this.start();
    const e = this.end();
    const tz = this.tz();
    const date = inZone(s, tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const time = `${inZone(s, tz, { hour: 'numeric', minute: '2-digit', hour12: false })}–${inZone(e, tz, { hour: 'numeric', minute: '2-digit', hour12: false })}`;
    const label = zoneLabel(s, tz);
    return `${date} · ${time} ${label}`;
  });

  sub = computed(() => {
    const tz = this.tz();
    const mine = localZone();
    if (mine === tz) return '';
    const s = this.start();
    const e = this.end();
    const date = inZone(s, mine, { weekday: 'short', day: 'numeric', month: 'short' });
    const time = `${inZone(s, mine, { hour: 'numeric', minute: '2-digit', hour12: false })}–${inZone(e, mine, { hour: 'numeric', minute: '2-digit', hour12: false })}`;
    return `${date} · ${time} ${zoneLabel(s, mine)} your time`;
  });
}

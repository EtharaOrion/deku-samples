import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The brand mark: a four-pointed star with concave sides, drawn from geometry. */
@Component({
  selector: 'g-brand',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="link" class="brand {{ tone }}" [attr.aria-label]="label">
      <svg class="star" viewBox="0 0 133 134" fill="currentColor" aria-hidden="true">
        <path [attr.d]="starPath"/>
      </svg>
      <span>Gather</span>
    </a>
  `,
  imports: [RouterLink],
})
export class Brand {
  @Input() link = '/';
  @Input() tone = '';
  starPath = 'M66.5 0 L82 42 L133 67 L82 92 L66.5 134 L51 92 L0 67 L51 42 Z';
  get label(): string {
    return 'Gather, events start here';
  }
}

/** The visitor's local time, live, updating once a minute on the minute. */
@Component({
  selector: 'g-clock',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="clock t-caption nowrap" [attr.aria-live]="'off'">{{ now }}</span>`,
})
export class Clock implements OnInit, OnDestroy {
  now = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  ngOnInit(): void {
    this.tick();
  }
  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
  private tick(): void {
    const d = new Date();
    this.now = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset',
    }).format(d);
    const secondsToNextMinute = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
    this.timer = setTimeout(() => this.tick(), secondsToNextMinute);
  }
}


/* The one place the lockup is tinted: pink, darkening on hover. */
// (styles live in the global sheet under .brand.suspended)

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'cc-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {
  constructor() {
    // The server sets a cookie carrying the event's key colour on the document
    // that carries the event address, so the first paint already wears it.
    const m = /(?:^|;\s*)event_theme=([^;]+)/.exec(document.cookie);
    if (m) {
      const hex = decodeURIComponent(m[1]);
      document.documentElement.style.background = hex;
      document.documentElement.setAttribute('data-theme-hex', hex);
    }
  }
}

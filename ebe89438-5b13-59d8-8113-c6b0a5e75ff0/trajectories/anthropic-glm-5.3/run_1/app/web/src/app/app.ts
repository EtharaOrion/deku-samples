import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Api } from './api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    <router-outlet></router-outlet>
    @if (api.notice(); as n) {
      <div class="notice" [class]="'notice-' + n.kind" role="status" aria-live="polite">{{ n.text }}</div>
    }
  `,
  styles: [':host { display: block; min-height: 100vh; }'],
})
export class App {
  api = inject(Api);
}

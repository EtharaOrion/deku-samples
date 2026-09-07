import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticesComponent } from './chrome';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticesComponent],
  template: `<router-outlet /><app-notices />`,
})
export class AppComponent {}

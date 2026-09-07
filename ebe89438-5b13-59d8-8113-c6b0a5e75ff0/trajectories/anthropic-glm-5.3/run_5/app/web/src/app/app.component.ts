import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NoticesComponent } from './ui/notices.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NoticesComponent],
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {}

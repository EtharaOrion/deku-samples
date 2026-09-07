import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app';
import { ROUTES } from './app/routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(ROUTES, withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withComponentInputBinding()),
    provideHttpClient(),
  ],
}).catch((e) => console.error(e));

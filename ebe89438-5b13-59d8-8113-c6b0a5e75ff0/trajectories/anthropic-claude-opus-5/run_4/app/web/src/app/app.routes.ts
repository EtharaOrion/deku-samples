import { Routes } from '@angular/router';
import { authGuard } from './core/guards';

/**
 * Reserved system paths first, then everything else falls through to the one
 * root-namespace lookup at :slug.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./routes/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'discover',
    loadComponent: () => import('./routes/discover.component').then((m) => m.DiscoverComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./routes/auth.component').then((m) => m.AuthComponent),
    data: { mode: 'login' },
  },
  {
    path: 'signup',
    loadComponent: () => import('./routes/auth.component').then((m) => m.AuthComponent),
    data: { mode: 'signup' },
  },
  {
    path: 'app',
    loadComponent: () => import('./routes/get-app.component').then((m) => m.GetAppComponent),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'calendars',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/calendars.component').then((m) => m.CalendarsComponent),
  },
  {
    path: 'create',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/create.component').then((m) => m.CreateComponent),
  },
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./routes/settings-profile.component').then((m) => m.SettingsProfileComponent),
  },
  { path: 'settings', redirectTo: 'settings/profile', pathMatch: 'full' },
  {
    path: 'event/:slug/manage/overview',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/manage/overview.component').then((m) => m.ManageOverviewComponent),
  },
  {
    path: 'event/:slug/manage/guests',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/manage/guests.component').then((m) => m.ManageGuestsComponent),
  },
  {
    path: 'event/:slug/manage/registration',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./routes/manage/registration.component').then((m) => m.ManageRegistrationComponent),
  },
  {
    path: 't/:code',
    loadComponent: () => import('./routes/ticket.component').then((m) => m.TicketComponent),
  },
  {
    path: ':slug',
    loadComponent: () => import('./routes/slug.component').then((m) => m.SlugComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./routes/not-found.component').then((m) => m.NotFoundComponent),
  },
];

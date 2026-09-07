import { Routes } from '@angular/router';
import { authGuard, hostGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./routes/landing.component').then((m) => m.LandingComponent) },
  { path: 'discover', loadComponent: () => import('./routes/discover.component').then((m) => m.DiscoverComponent) },
  { path: 'login', loadComponent: () => import('./routes/auth.component').then((m) => m.SignInComponent) },
  { path: 'signup', loadComponent: () => import('./routes/auth.component').then((m) => m.SignUpComponent) },
  { path: 'app', loadComponent: () => import('./routes/get-app.component').then((m) => m.GetAppComponent) },
  { path: 'terms', loadComponent: () => import('./routes/legal.component').then((m) => m.LegalComponent) },
  { path: 'suspended', loadComponent: () => import('./routes/suspended.component').then((m) => m.SuspendedComponent) },
  { path: 'not-found', loadComponent: () => import('./routes/not-found.component').then((m) => m.NotFoundComponent) },
  { path: 't/:code', loadComponent: () => import('./routes/ticket.component').then((m) => m.TicketComponent) },

  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () => import('./routes/settings.component').then((m) => m.SettingsComponent),
  },
  { path: 'settings', redirectTo: 'settings/profile', pathMatch: 'full' },
  {
    path: 'calendars',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/calendars.component').then((m) => m.CalendarsComponent),
  },
  {
    path: 'create',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/create.component').then((m) => m.CreateComponent),
  },
  {
    path: 'event/:slug/manage',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage/manage-shell.component').then((m) => m.ManageShellComponent),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview', loadComponent: () => import('./routes/manage/overview.component').then((m) => m.ManageOverviewComponent) },
      { path: 'guests', loadComponent: () => import('./routes/manage/guests.component').then((m) => m.ManageGuestsComponent) },
      {
        path: 'registration',
        loadComponent: () => import('./routes/manage/registration.component').then((m) => m.ManageRegistrationComponent),
      },
    ],
  },

  // The root namespace: one lookup with fixed precedence, resolved last.
  { path: ':slug', loadComponent: () => import('./routes/resolve.component').then((m) => m.ResolveComponent) },
  { path: '**', loadComponent: () => import('./routes/not-found.component').then((m) => m.NotFoundComponent) },
];

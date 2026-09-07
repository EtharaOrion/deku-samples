import { Routes } from '@angular/router';
import { authGuard, hostGuard } from './core/guards';

/**
 * Reserved paths are declared before the root-namespace catch-all, so a slug
 * can never shadow a system route.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./routes/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'discover',
    loadComponent: () => import('./routes/discover').then((m) => m.DiscoverComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./routes/auth-pages').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./routes/auth-pages').then((m) => m.SignupComponent),
  },
  {
    path: 'app',
    loadComponent: () => import('./routes/public-pages').then((m) => m.GetAppComponent),
  },
  {
    path: 'suspended',
    loadComponent: () => import('./routes/public-pages').then((m) => m.SuspendedComponent),
  },
  {
    path: 't/:code',
    loadComponent: () =>
      import('./routes/public-pages').then((m) => m.TicketPageComponent),
  },

  // Every signed-in route sits inside one shell.
  {
    path: '',
    loadComponent: () => import('./shell/app-shell').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'home',
        canActivate: [authGuard],
        loadComponent: () => import('./routes/home').then((m) => m.HomeComponent),
      },
      {
        path: 'settings/profile',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./routes/settings').then((m) => m.SettingsProfileComponent),
      },
      {
        path: 'calendars',
        canActivate: [hostGuard],
        loadComponent: () =>
          import('./routes/calendars').then((m) => m.CalendarsComponent),
      },
      {
        path: 'create',
        canActivate: [hostGuard],
        loadComponent: () => import('./routes/create').then((m) => m.CreateComponent),
      },
      {
        path: 'event/:slug/manage/overview',
        canActivate: [hostGuard],
        loadComponent: () =>
          import('./routes/manage').then((m) => m.ManageOverviewComponent),
      },
      {
        path: 'event/:slug/manage/guests',
        canActivate: [hostGuard],
        loadComponent: () =>
          import('./routes/manage').then((m) => m.ManageGuestsComponent),
      },
      {
        path: 'event/:slug/manage/registration',
        canActivate: [hostGuard],
        loadComponent: () =>
          import('./routes/manage').then((m) => m.ManageRegistrationComponent),
      },
    ],
  },

  {
    path: 'not-found',
    loadComponent: () => import('./routes/public-pages').then((m) => m.NotFoundComponent),
  },

  // The root namespace: an event, a calendar or a profile at one address.
  {
    path: ':slug',
    loadComponent: () => import('./routes/resolver').then((m) => m.RootSlugComponent),
  },

  { path: '**', redirectTo: 'not-found' },
];

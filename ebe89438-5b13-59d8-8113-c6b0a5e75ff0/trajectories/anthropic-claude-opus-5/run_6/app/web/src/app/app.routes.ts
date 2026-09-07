import { Routes } from '@angular/router';
import { authGuard, hostGuard } from './core/guards';
import { ShellComponent } from './ui/shell.component';

/**
 * Reserved system paths are matched first, then the twelve categories and any
 * other root name fall through to the one resolving route.
 */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./routes/landing.component').then((m) => m.LandingComponent) },
  { path: 'discover', loadComponent: () => import('./routes/discover.component').then((m) => m.DiscoverComponent) },
  { path: 'login', loadComponent: () => import('./routes/login.component').then((m) => m.LoginComponent) },
  { path: 'signup', loadComponent: () => import('./routes/signup.component').then((m) => m.SignupComponent) },
  { path: 'app', loadComponent: () => import('./routes/get-app.component').then((m) => m.GetAppComponent) },
  { path: 'suspended', loadComponent: () => import('./routes/suspended.component').then((m) => m.SuspendedComponent) },
  { path: 't/:code', loadComponent: () => import('./routes/ticket.component').then((m) => m.TicketComponent) },

  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: 'home', canActivate: [authGuard],
        loadComponent: () => import('./routes/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'settings/profile', canActivate: [authGuard],
        loadComponent: () => import('./routes/settings-profile.component').then((m) => m.SettingsProfileComponent),
      },
      {
        path: 'calendars', canActivate: [hostGuard],
        loadComponent: () => import('./routes/calendars.component').then((m) => m.CalendarsComponent),
      },
      {
        path: 'create', canActivate: [hostGuard],
        loadComponent: () => import('./routes/create.component').then((m) => m.CreateComponent),
      },
      {
        path: 'event/:slug/manage', canActivate: [hostGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () => import('./routes/manage-overview.component').then((m) => m.ManageOverviewComponent),
          },
          {
            path: 'guests',
            loadComponent: () => import('./routes/manage-guests.component').then((m) => m.ManageGuestsComponent),
          },
          {
            path: 'registration',
            loadComponent: () => import('./routes/manage-registration.component').then((m) => m.ManageRegistrationComponent),
          },
        ],
      },
    ],
  },

  { path: '404', loadComponent: () => import('./routes/not-found.component').then((m) => m.NotFoundComponent) },
  { path: ':slug', loadComponent: () => import('./routes/root-slug.component').then((m) => m.RootSlugComponent) },
  { path: '**', loadComponent: () => import('./routes/not-found.component').then((m) => m.NotFoundComponent) },
];

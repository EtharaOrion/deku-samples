import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./routes/landing').then(m => m.LandingComponent), title: 'Community Calendar' },
  { path: 'discover', loadComponent: () => import('./routes/discover').then(m => m.DiscoverComponent), title: 'Discover Events' },
  { path: 'login', loadComponent: () => import('./routes/login').then(m => m.LoginComponent), title: 'Sign In' },
  { path: 'signup', loadComponent: () => import('./routes/signup').then(m => m.SignupComponent), title: 'Create an account' },
  { path: 'app', loadComponent: () => import('./routes/get-app').then(m => m.GetAppComponent), title: 'Get the App' },
  { path: 'home', loadComponent: () => import('./routes/home').then(m => m.HomeComponent), title: 'Your events' },
  { path: 'calendars', loadComponent: () => import('./routes/calendars').then(m => m.CalendarsComponent), title: 'Your calendars' },
  { path: 'create', loadComponent: () => import('./routes/create').then(m => m.CreateComponent), title: 'Create an event' },
  { path: 'event/:slug/manage/:tab', loadComponent: () => import('./routes/manage').then(m => m.ManageComponent), title: 'Manage' },
  { path: 'settings/profile', loadComponent: () => import('./routes/settings-profile').then(m => m.SettingsProfileComponent), title: 'Your profile' },
  { path: 't/:code', loadComponent: () => import('./routes/ticket').then(m => m.TicketComponent), title: 'Your ticket' },
  { path: 'suspended', loadComponent: () => import('./routes/suspended').then(m => m.SuspendedComponent), title: 'Account Suspended' },
  { path: 'legal', loadComponent: () => import('./routes/legal').then(m => m.LegalComponent), title: 'Terms' },
  // Root-namespace resolution for one segment: system and category names are
  // known here, everything else resolves through the API.
  { path: ':slug', loadComponent: () => import('./routes/root').then(m => m.RootPageComponent) },
  { path: '**', loadComponent: () => import('./routes/not-found').then(m => m.NotFoundComponent), title: 'Page Not Found' },
];

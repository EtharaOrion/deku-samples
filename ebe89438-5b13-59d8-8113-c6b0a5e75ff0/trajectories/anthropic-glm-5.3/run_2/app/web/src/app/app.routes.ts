import { Routes } from '@angular/router';
import { publicGuard, authGuard, hostGuard } from './guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./routes/landing').then(m => m.Landing), title: 'Community Calendar' },
  { path: 'discover', loadComponent: () => import('./routes/discover').then(m => m.Discover), title: 'Discover Events' },
  { path: 'login', loadComponent: () => import('./routes/login').then(m => m.Login), title: 'Sign In' },
  { path: 'signup', loadComponent: () => import('./routes/signup').then(m => m.Signup), title: 'Create Account' },
  { path: 'app', loadComponent: () => import('./routes/get-app').then(m => m.GetApp), title: 'Get the App' },
  { path: 'suspended', loadComponent: () => import('./routes/suspended').then(m => m.Suspended), title: 'Account Suspended' },
  { path: 'terms', loadComponent: () => import('./routes/legal').then(m => m.Legal), title: 'Terms' },

  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./routes/home').then(m => m.Home), title: 'Your Events' },
  { path: 'calendars', canActivate: [authGuard, hostGuard], loadComponent: () => import('./routes/calendars').then(m => m.Calendars), title: 'Your Calendars' },
  { path: 'create', canActivate: [authGuard, hostGuard], loadComponent: () => import('./routes/create').then(m => m.Create), title: 'Create Event' },
  { path: 'settings/profile', canActivate: [authGuard], loadComponent: () => import('./routes/settings-profile').then(m => m.SettingsProfile), title: 'Your Profile' },

  { path: 'event/:slug/manage/overview', canActivate: [authGuard, hostGuard], loadComponent: () => import('./routes/manage-overview').then(m => m.ManageOverview) },
  { path: 'event/:slug/manage/guests', canActivate: [authGuard, hostGuard], loadComponent: () => import('./routes/manage-guests').then(m => m.ManageGuests) },
  { path: 'event/:slug/manage/registration', canActivate: [authGuard, hostGuard], loadComponent: () => import('./routes/manage-registration').then(m => m.ManageRegistration) },

  { path: 't/:code', loadComponent: () => import('./routes/ticket').then(m => m.Ticket) },

  // Root-namespace resolution, lowest precedence.
  { path: ':slug', loadComponent: () => import('./routes/root-resolver').then(m => m.RootResolver) },
  { path: '**', loadComponent: () => import('./routes/not-found').then(m => m.NotFound) },
];

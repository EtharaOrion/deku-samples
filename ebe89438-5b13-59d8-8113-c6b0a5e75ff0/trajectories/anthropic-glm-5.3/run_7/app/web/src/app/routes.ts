import { Routes } from '@angular/router';
import { authGuard, guestOnly, hostGuard, notFoundGuard } from './core/guards';

export const ROUTES: Routes = [
  { path: '', loadComponent: () => import('./routes/landing').then(m => m.LandingComponent), title: 'Community Calendar' },
  { path: 'discover', loadComponent: () => import('./routes/discover').then(m => m.DiscoverComponent), title: 'Discover Events' },
  { path: 'login', canActivate: [guestOnly], loadComponent: () => import('./routes/login').then(m => m.LoginComponent), title: 'Sign In' },
  { path: 'signup', canActivate: [guestOnly], loadComponent: () => import('./routes/signup').then(m => m.SignupComponent), title: 'Create Account' },
  { path: 'app', loadComponent: () => import('./routes/get-app').then(m => m.GetAppComponent), title: 'Get the App' },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./routes/home').then(m => m.HomeComponent), title: 'Your Events' },
  { path: 'calendars', canActivate: [hostGuard], loadComponent: () => import('./routes/calendars').then(m => m.CalendarsComponent), title: 'Your Calendars' },
  { path: 'create', canActivate: [hostGuard], loadComponent: () => import('./routes/create-event').then(m => m.CreateEventComponent), title: 'Create Event' },
  { path: 'event/:slug/manage/overview', canActivate: [hostGuard], loadComponent: () => import('./routes/manage-overview').then(m => m.ManageOverviewComponent), title: 'Dashboard' },
  { path: 'event/:slug/manage/guests', canActivate: [hostGuard], loadComponent: () => import('./routes/manage-guests').then(m => m.ManageGuestsComponent), title: 'Guests' },
  { path: 'event/:slug/manage/registration', canActivate: [hostGuard], loadComponent: () => import('./routes/manage-registration').then(m => m.ManageRegistrationComponent), title: 'Registration' },
  { path: 'event/:slug/manage', redirectTo: 'event/:slug/manage/overview', pathMatch: 'prefix' },
  { path: 'settings/profile', canActivate: [authGuard], loadComponent: () => import('./routes/settings-profile').then(m => m.SettingsProfileComponent), title: 'Your Profile' },
  { path: 't/:code', loadComponent: () => import('./routes/ticket').then(m => m.TicketComponent), title: 'Ticket' },
  { path: 'suspended', loadComponent: () => import('./routes/suspended').then(m => m.SuspendedComponent), title: 'Account Suspended' },
  { path: 'terms', loadComponent: () => import('./routes/legal').then(m => m.LegalComponent), title: 'Terms' },
  { path: 'api', redirectTo: '' },
  // The root namespace: a category, an event, a calendar or a profile.
  { path: ':slug', canActivate: [notFoundGuard], loadComponent: () => import('./routes/resolve').then(m => m.ResolveComponent) },
  { path: '**', loadComponent: () => import('./routes/not-found').then(m => m.NotFoundComponent), title: 'Page Not Found' },
];

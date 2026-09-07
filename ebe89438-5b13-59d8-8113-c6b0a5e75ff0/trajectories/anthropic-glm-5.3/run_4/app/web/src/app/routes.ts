import type { Routes } from '@angular/router';
import { ShellComponent } from './shell/shell.component';
import { authGuard, hostGuard } from './core/guards';

export const ROUTES: Routes = [
  { path: '', component: ShellComponent, children: [
    { path: '', loadComponent: () => import('./pages/landing/landing.component').then((m) => m.LandingComponent) },
    { path: 'discover', loadComponent: () => import('./pages/discover/discover.component').then((m) => m.DiscoverComponent) },
    { path: 'login', loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent) },
    { path: 'signup', loadComponent: () => import('./pages/signup/signup.component').then((m) => m.SignupComponent) },
    { path: 'app', loadComponent: () => import('./pages/get-app/get-app.component').then((m) => m.GetAppComponent) },
    { path: 'home', canActivate: [authGuard], loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent) },
    { path: 'calendars', canActivate: [hostGuard], loadComponent: () => import('./pages/calendars/calendars.component').then((m) => m.CalendarsComponent) },
    { path: 'create', canActivate: [hostGuard], loadComponent: () => import('./pages/composer/composer.component').then((m) => m.ComposerComponent) },
    { path: 'settings/profile', canActivate: [authGuard], loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent) },
    { path: 'event/:slug/manage/:tab', canActivate: [hostGuard], loadComponent: () => import('./pages/manage/manage.component').then((m) => m.ManageComponent) },
    { path: 'event/:slug/manage', redirectTo: 'event/:slug/manage/overview', pathMatch: 'full' },
    { path: 't/:code', loadComponent: () => import('./pages/ticket/ticket.component').then((m) => m.TicketComponent) },
    { path: 'terms', loadComponent: () => import('./pages/legal/legal.component').then((m) => m.LegalComponent) },
    { path: ':slug', loadComponent: () => import('./pages/event-page/event-page.component').then((m) => m.EventPageComponent) },
  ]},
  { path: '404', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
];

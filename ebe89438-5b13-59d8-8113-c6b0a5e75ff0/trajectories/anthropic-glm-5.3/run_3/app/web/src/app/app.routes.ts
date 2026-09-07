import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './api';
import { of, map, catchError, filter, switchMap, take } from 'rxjs';
import { LandingComponent } from './pages/landing';
import { LoginComponent, SignupComponent } from './pages/auth';
import { DiscoverComponent } from './pages/discover';
import { EventPageComponent } from './pages/event';
import { CategoryComponent, GetAppComponent } from './pages/misc';
import { NotFoundComponent } from './pages/bits';
import { SignedShellComponent, HomeComponent, CalendarsComponent } from './pages/signed';
import { CreateComponent, ManageOverviewComponent } from './pages/manage';
import { ManageGuestsComponent } from './pages/manage2';
import { ManageRegistrationComponent } from './pages/manage3';
import { TicketComponent } from './pages/ticket';
import { ProfileComponent } from './pages/profile';

/** Guards resolve the injector once, up front, and close over it. */
const authed = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready$.pipe(
    filter(r => r),
    switchMap(() => auth.account$),
    take(1),
    map(a => (a ? true : router.parseUrl(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)))
  );
};
const hostOnly = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ready$.pipe(
    filter(r => r),
    switchMap(() => auth.account$),
    take(1),
    map(a => (a?.role === 'host' ? true : (a ? router.parseUrl('/not-found') : router.parseUrl(`/login?next=${encodeURIComponent(location.pathname + location.search)}`))))
  );
};

export const routes: Routes = [
  { path: '', component: LandingComponent, title: 'Deku · Community Calendar' },
  { path: 'login', component: LoginComponent, title: 'Sign in · Deku' },
  { path: 'signup', component: SignupComponent, title: 'Create an account · Deku' },
  { path: 'discover', component: DiscoverComponent, title: 'Discover Events · Deku' },
  { path: 'app', component: GetAppComponent, title: 'Get the App · Deku' },
  {
    path: 'home',
    canActivate: [authed],
    component: SignedShellComponent,
    children: [{ path: '', component: HomeComponent, title: 'Your registrations · Deku' }],
  },
  {
    path: 'calendars',
    canActivate: [hostOnly],
    component: SignedShellComponent,
    children: [{ path: '', component: CalendarsComponent, title: 'Calendars · Deku' }],
  },
  {
    path: 'create',
    canActivate: [hostOnly],
    component: SignedShellComponent,
    children: [{ path: '', component: CreateComponent, title: 'Create an event · Deku' }],
  },
  {
    path: 'settings/profile',
    canActivate: [authed],
    component: SignedShellComponent,
    children: [{ path: '', component: ProfileComponent, title: 'Your profile · Deku' }],
  },
  {
    path: 'event/:slug/manage',
    canActivate: [hostOnly],
    component: SignedShellComponent,
    children: [
      { path: 'overview', component: ManageOverviewComponent, title: 'Overview · Deku' },
      { path: 'guests', component: ManageGuestsComponent, title: 'Guests · Deku' },
      { path: 'registration', component: ManageRegistrationComponent, title: 'Registration · Deku' },
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
    ],
  },
  { path: 't/:code', component: TicketComponent, title: 'Ticket · Deku' },
  { path: 'not-found', component: NotFoundComponent },
  // The twelve category names resolve here, before the slug catch-all.
  { path: 'family', component: CategoryComponent, title: 'Family · Deku' },
  { path: 'books', component: CategoryComponent, title: 'Books · Deku' },
  { path: 'games', component: CategoryComponent, title: 'Games · Deku' },
  { path: 'tech', component: CategoryComponent, title: 'Tech · Deku' },
  { path: 'food-and-drink', component: CategoryComponent, title: 'Food & Drink · Deku' },
  { path: 'ai', component: CategoryComponent, title: 'AI · Deku' },
  { path: 'running', component: CategoryComponent, title: 'Running · Deku' },
  { path: 'arts-and-culture', component: CategoryComponent, title: 'Arts & Culture · Deku' },
  { path: 'climate', component: CategoryComponent, title: 'Climate · Deku' },
  { path: 'fitness', component: CategoryComponent, title: 'Fitness · Deku' },
  { path: 'wellness', component: CategoryComponent, title: 'Wellness · Deku' },
  { path: 'crypto', component: CategoryComponent, title: 'Crypto · Deku' },
  { path: ':slug', component: EventPageComponent },
  { path: '**', component: NotFoundComponent },
];

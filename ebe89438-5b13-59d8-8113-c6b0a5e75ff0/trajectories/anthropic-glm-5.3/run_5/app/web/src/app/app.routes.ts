import { Routes } from '@angular/router';
import { authGuard, hostGuard } from './guards';
import { LandingComponent } from './pages/landing.component';
import { DiscoverComponent } from './pages/discover.component';
import { CategoryComponent } from './pages/category.component';
import { EventPageComponent } from './pages/event-page.component';
import { AuthPageComponent } from './pages/auth.component';
import { NotFoundComponent } from './pages/not-found.component';
import { RootResolverComponent } from './pages/root-resolver.component';
import { GetAppComponent } from './pages/get-app.component';
import { LegalComponent } from './pages/legal.component';
import { SuspendedComponent } from './pages/suspended.component';
import { ShellComponent } from './ui/shell.component';
import { HomeComponent } from './pages/home.component';
import { CalendarsComponent } from './pages/calendars.component';
import { CreateComponent } from './pages/create.component';
import { ManageOverviewComponent } from './pages/manage-overview.component';
import { ManageGuestsComponent } from './pages/manage-guests.component';
import { ManageRegistrationComponent } from './pages/manage-registration.component';
import { TicketPageComponent } from './pages/ticket-page.component';
import { SettingsProfileComponent } from './pages/settings-profile.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'login', component: AuthPageComponent, data: { mode: 'login' } },
  { path: 'signup', component: AuthPageComponent, data: { mode: 'signup' } },
  { path: 'app', component: GetAppComponent },
  { path: 'legal', component: LegalComponent },
  { path: 'suspended', component: SuspendedComponent },
  { path: 'not-found', component: NotFoundComponent },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: 'home', component: HomeComponent, canActivate: [authGuard] },
      { path: 'calendars', component: CalendarsComponent, canActivate: [hostGuard] },
      { path: 'create', component: CreateComponent, canActivate: [hostGuard] },
      { path: 'settings/profile', component: SettingsProfileComponent, canActivate: [authGuard] },
      { path: 'event/:slug/manage/overview', component: ManageOverviewComponent, canActivate: [hostGuard] },
      { path: 'event/:slug/manage/guests', component: ManageGuestsComponent, canActivate: [hostGuard] },
      { path: 'event/:slug/manage/registration', component: ManageRegistrationComponent, canActivate: [hostGuard] },
    ],
  },
  { path: 'event/:slug', component: EventPageComponent },
  { path: 'event/:slug/manage', redirectTo: 'event/:slug/manage/overview', pathMatch: 'full' },
  { path: 't/:code', component: TicketPageComponent },
  // The twelve categories resolve at their own address.
  { path: 'family', component: CategoryComponent, data: { category: 'family' } },
  { path: 'books', component: CategoryComponent, data: { category: 'books' } },
  { path: 'games', component: CategoryComponent, data: { category: 'games' } },
  { path: 'tech', component: CategoryComponent, data: { category: 'tech' } },
  { path: 'food-and-drink', component: CategoryComponent, data: { category: 'food-and-drink' } },
  { path: 'ai', component: CategoryComponent, data: { category: 'ai' } },
  { path: 'running', component: CategoryComponent, data: { category: 'running' } },
  { path: 'arts-and-culture', component: CategoryComponent, data: { category: 'arts-and-culture' } },
  { path: 'climate', component: CategoryComponent, data: { category: 'climate' } },
  { path: 'fitness', component: CategoryComponent, data: { category: 'fitness' } },
  { path: 'wellness', component: CategoryComponent, data: { category: 'wellness' } },
  { path: 'crypto', component: CategoryComponent, data: { category: 'crypto' } },
  // One root namespace: /<slug> resolves to an event, calendar or profile.
  { path: ':slug', component: RootResolverComponent },
  { path: '**', component: NotFoundComponent },
];

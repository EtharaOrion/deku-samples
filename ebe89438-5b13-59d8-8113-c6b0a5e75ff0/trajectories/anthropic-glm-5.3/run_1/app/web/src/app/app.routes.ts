import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing';
import { DiscoverComponent } from './pages/discover';
import { ResolverComponent } from './pages/resolver';
import { EventPageComponent } from './pages/event/event-page';
import { AuthCardComponent } from './pages/auth-card';
import { HomeComponent } from './pages/home';
import { ShellComponent } from './pages/shell';
import { ManageOverviewComponent } from './pages/manage/overview';
import { ManageGuestsComponent } from './pages/manage/guests';
import { ManageRegistrationComponent } from './pages/manage/registration';
import { CalendarsComponent } from './pages/calendars';
import { ComposerComponent } from './pages/composer';
import { TicketComponent } from './pages/ticket';
import { SettingsProfileComponent } from './pages/manage/settings';
import { NotFoundComponent, SuspendedComponent, GetAppComponent, LegalComponent } from './pages/system-pages';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'discover', component: DiscoverComponent },
  { path: 'login', component: AuthCardComponent, data: { mode: 'login' } },
  { path: 'signup', component: AuthCardComponent, data: { mode: 'signup' } },
  { path: 'app', component: GetAppComponent },
  { path: 'suspended', component: SuspendedComponent },
  { path: 'terms', component: LegalComponent },
  { path: 't/:code', component: TicketComponent },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'calendars', component: CalendarsComponent },
      { path: 'create', component: ComposerComponent },
      { path: 'settings/profile', component: SettingsProfileComponent },
      { path: 'event/:slug/manage/overview', component: ManageOverviewComponent },
      { path: 'event/:slug/manage/guests', component: ManageGuestsComponent },
      { path: 'event/:slug/manage/registration', component: ManageRegistrationComponent },
    ],
  },
  { path: ':slug', component: ResolverComponent },
  { path: '**', component: NotFoundComponent },
];

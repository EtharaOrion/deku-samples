import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { Root } from './root';
import { authed, hostOnly } from './guards';
import { CATEGORIES } from './domain';

const RESERVED = new Set([
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover', 'settings', 'event', 't',
  'not-found', 'suspended', 'legal', 'category', 'calendar', 'u',
]);

import { UrlMatcher, UrlSegment } from '@angular/router';

/** Matches a single root-namespace segment that is neither reserved nor a category. */
export const rootSlugMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (!segments || segments.length !== 1) return null;
  const seg = segments[0]!.path;
  // Categories resolve here too, with their fixed precedence in ResolvePage.
  if (seg === '' || RESERVED.has(seg)) return null;
  return { consumed: segments };
};

import { PublicShell } from './ui/shells';
import { AppShell } from './ui/shells';

import { LandingPage } from './pages/landing';
import { ResolvePage } from './pages/resolve';
import { DiscoverPage } from './pages/discover';
import { CategoryPage } from './pages/category';
import { EventPage } from './pages/event';
import { CalendarPage } from './pages/calendar';
import { ProfilePage } from './pages/profile';
import { LoginPage, SignupPage } from './pages/auth';
import { LegalPage } from './pages/legal';
import { NotFoundPage, GetAppPage, SuspendedPage } from './pages/notfound';
import { TicketPage } from './pages/ticket';
import { HomePage } from './pages/home';
import { CalendarsPage } from './pages/calendars';
import { CreatePage } from './pages/create';
import { ManageOverviewPage } from './pages/manage-overview';
import { ManageGuestsPage } from './pages/manage-guests';
import { ManageRegistrationPage } from './pages/manage-registration';
import { SettingsPage } from './pages/settings';

bootstrapApplication(Root, {
  providers: [
    provideHttpClient(withFetch()),
    provideRouter([
      {
        path: '',
        component: PublicShell,
        children: [
          { path: '', component: LandingPage, pathMatch: 'full' },
          { path: 'discover', component: DiscoverPage },
          { path: 'app', component: GetAppPage },
          { path: 'legal', component: LegalPage },
          { path: 'suspended', component: SuspendedPage },
          { path: 'login', component: LoginPage },
          { path: 'signup', component: SignupPage },
          { path: 'not-found', component: NotFoundPage },
          { path: 't/:code', component: TicketPage },
          { path: 'category/:key', component: CategoryPage },
          { path: 'event/:slug', component: EventPage },
          { path: 'calendar/:slug', component: CalendarPage },
          { path: 'u/:handle', component: ProfilePage },
          // The root namespace: a single segment that is neither reserved nor
          // a category, resolved with fixed precedence by the server.
          { matcher: rootSlugMatcher, component: ResolvePage },
        ],
      },
      {
        path: '',
        component: AppShell,
        children: [
          { path: 'home', component: HomePage, canActivate: [authed] },
          { path: 'calendars', component: CalendarsPage, canActivate: [hostOnly] },
          { path: 'create', component: CreatePage, canActivate: [hostOnly] },
          { path: 'settings/profile', component: SettingsPage, canActivate: [authed] },
          { path: 'event/:slug/manage/overview', component: ManageOverviewPage, canActivate: [hostOnly] },
          { path: 'event/:slug/manage/guests', component: ManageGuestsPage, canActivate: [hostOnly] },
          { path: 'event/:slug/manage/registration', component: ManageRegistrationPage, canActivate: [hostOnly] },
        ],
      },
      { path: '**', component: NotFoundPage },    ], withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
  ],
}).catch((err) => console.error(err));

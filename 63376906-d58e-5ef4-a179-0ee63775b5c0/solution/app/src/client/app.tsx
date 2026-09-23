import type { JSX } from 'preact';
import { PageShell } from './components/layout';
import { AboutPage } from './pages/about';
import { CareersPage } from './pages/careers';
import { ConsoleApp } from './pages/console/index';
import { ContactPage } from './pages/contact';
import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import { NewsPage } from './pages/news';
import { PrivacyPage } from './pages/privacy';
import { ProductPage } from './pages/product';
import { TechnologyPage } from './pages/technology';
import { VerifyPage } from './pages/verify';
import type { PageState } from './routes';

type RenderedState = Exclude<PageState, { route: 'console' }>;

function surfaceFor(state: RenderedState): 'public' | 'console' {
  return state.route === 'login' ? 'console' : 'public';
}

function body(state: RenderedState): JSX.Element {
  switch (state.route) {
    case 'home':
      return <HomePage stages={state.data.stages} />;
    case 'product':
      return <ProductPage specification={state.data.specification} claims={state.data.claims} />;
    case 'technology':
      return (
        <TechnologyPage
          stages={state.data.stages}
          capacity={state.data.capacity}
          capacity_basis={state.data.capacity_basis}
        />
      );
    case 'about':
      return <AboutPage statistics={state.data.statistics} />;
    case 'careers':
      return <CareersPage positions={state.data.positions} />;
    case 'news':
      return <NewsPage items={state.data.items} />;
    case 'contact':
      return <ContactPage routing={state.data.routing} />;
    case 'privacy':
      return <PrivacyPage />;
    case 'verify':
      return <VerifyPage answer={state.data.answer} />;
    case 'login':
      return <LoginPage />;
  }
}

export function App({ state }: { state: PageState }): JSX.Element {
  if (state.route === 'console') return <ConsoleApp identity={state.data.identity} />;
  return (
    <PageShell route={state.route} surface={surfaceFor(state)}>
      {body(state)}
    </PageShell>
  );
}

import './styles.css';
import { render } from 'preact';
import { Router } from './lib/router.jsx';
import { Shell } from './shell.jsx';
import { Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify } from './routes/public.jsx';
import { Login } from './routes/login.jsx';
import { Board, Intake, RecordView, Reconciliation, Balance, LotView, Genealogy, CertNew, Certificates, CertDetail, Deviations, Overrides } from './console/index.jsx';



const routes = [
  { path: /^\/$/, component: Home },
  { path: /^\/product/, component: Product },
  { path: /^\/technology/, component: Technology },
  { path: /^\/about/, component: About },
  { path: /^\/careers/, component: Careers },
  { path: /^\/news/, component: News },
  { path: /^\/contact/, component: Contact },
  { path: /^\/privacy/, component: Privacy },
  { path: /^\/verify\/([^/]+)$/, component: Verify },
  { path: /^\/login/, component: Login },
  { path: /^\/console\/batches\/([^/]+)\/impact/, component: Genealogy },
  { path: /^\/console\/lots\/([^/]+)\/genealogy/, component: Genealogy },
  { path: /^\/console\/lots\/([^/]+)$/, component: LotView },
  { path: /^\/console\/balance\/([^/]+)$/, component: Balance },
  { path: /^\/console\/certificates\/new\/(lot|claim|recipient|review)$/, component: CertNew },
  { path: /^\/console\/certificates\/([^/]+)$/, component: CertDetail },
  { path: /^\/console\/certificates$/, component: Certificates },
  { path: /^\/console\/intake$/, component: Intake },
  { path: /^\/console\/record$/, component: RecordView },
  { path: /^\/console\/reconciliation$/, component: Reconciliation },
  { path: /^\/console\/deviations$/, component: Deviations },
  { path: /^\/console\/overrides$/, component: Overrides },
  { path: /^\/console$/, component: Board },
];

function App() {
  return (
    <Router routes={routes} shell={Shell} />
  );
}

render(<App />, document.getElementById('app'));

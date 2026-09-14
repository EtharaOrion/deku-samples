import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useRoute, useRouter } from './lib/router.jsx';
import { getToken } from './lib/api.js';
import Home from './views/public/home.jsx';
import Product from './views/public/product.jsx';
import Technology from './views/public/technology.jsx';
import About from './views/public/about.jsx';
import Careers from './views/public/careers.jsx';
import News from './views/public/news.jsx';
import Contact from './views/public/contact.jsx';
import Privacy from './views/public/privacy.jsx';
import Verify from './views/public/verify.jsx';
import Login from './views/login.jsx';
import Board from './views/console/board.jsx';
import Intake from './views/console/intake.jsx';
import Record from './views/console/record.jsx';
import Reconciliation from './views/console/reconciliation.jsx';
import Certificates from './views/console/certificates.jsx';
import NewCert from './views/console/newcert.jsx';
import Balance from './views/console/balance.jsx';
import Lots from './views/console/lots.jsx';

export function AppRoutes({ authed }) {
  const route = useRoute();
  const { nav } = useRouter();
  useEffect(() => {
    if (!authed && (route.startsWith('/console'))) nav('/login');
  }, [authed, route]);
  const p = route.split('?')[0];
  const seg = p.split('/').filter(Boolean);

  if (p === '/') return h(Home);
  if (p === '/product') return h(Product);
  if (p === '/technology') return h(Technology);
  if (p === '/about') return h(About);
  if (p === '/careers') return h(Careers);
  if (p === '/news') return h(News);
  if (p === '/contact') return h(Contact);
  if (p === '/privacy') return h(Privacy);
  if (seg[0] === 'verify') return h(Verify, { number: seg[1] });
  if (p === '/login') return h(Login);

  if (seg[0] === 'console') {
    if (!seg[1]) return h(Board);
    if (seg[1] === 'intake') return h(Intake);
    if (seg[1] === 'record') return h(Record);
    if (seg[1] === 'reconciliation') return h(Reconciliation);
    if (seg[1] === 'certificates') {
      if (seg[2] === 'new') return h(NewCert, { step: seg[3] || 'lot' });
      return h(Certificates, { number: seg[2] });
    }
    if (seg[1] === 'balance') return h(Balance, { id: seg[2] });
    if (seg[1] === 'lots') return h(Lots, { lotRef: seg[2], view: seg[3] });
    return h(Board);
  }
  return h(Home);
}

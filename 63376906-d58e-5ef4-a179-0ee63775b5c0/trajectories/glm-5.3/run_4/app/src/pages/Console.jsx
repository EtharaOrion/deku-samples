import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { TopBar, Footer, Loading, Empty, Banner } from '../components/Chrome.jsx';
import { api, setToken } from '../api.js';
import Board from './Board.jsx';
import Intake from './Intake.jsx';
import RecordView from './RecordView.jsx';
import Reconciliation from './Reconciliation.jsx';
import Certificates from './Certificates.jsx';
import Balance from './Balance.jsx';
import LotDetail from './LotDetail.jsx';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export default function Console({ user, setUser, checked, rest }) {
  const path = '/console' + (rest ? '/' + rest : '');

  useEffect(() => {
    if (checked && !user) route('/login');
  }, [checked, user]);

  if (!checked) return <div class="page"><Loading>Checking your session…</Loading></div>;
  if (!user) return <div class="page"><Loading>The console is reached only with a session.</Loading></div>;

  function signOut() {
    setToken(null);
    setUser(null);
    route('/login');
  }

  return (
    <div class="console">
      <TopBar consoleMode user={user} onSignOut={signOut} />
      <main class="console-main">
        {path === '/console' && <Board user={user} />}
        {path === '/console/intake' && <Intake user={user} />}
        {path === '/console/record' && <RecordView user={user} />}
        {path === '/console/reconciliation' && <Reconciliation user={user} />}
        {path === '/console/certificates' && <Certificates user={user} />}
        {path.startsWith('/console/certificates/') && <Certificates user={user} number={path.split('/')[3]} wizard={path.split('/')[4]} />}
        {path.startsWith('/console/balance/') && <Balance user={user} id={path.split('/')[3]} />}
        {path.startsWith('/console/lots/') && <LotDetail user={user} lot={path.split('/')[3]} view={path.split('/')[4]} />}
      </main>
      <Footer />
    </div>
  );
}

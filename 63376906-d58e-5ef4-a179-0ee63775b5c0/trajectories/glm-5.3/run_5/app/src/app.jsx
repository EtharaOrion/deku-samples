import { useEffect } from 'preact/hooks'
import { usePath, navigate } from './router.jsx';
import { getToken } from './api.js';
import { TopBar, Footer, Login, Logout, useMe } from './components/chrome.jsx';
import { ConsoleBoard, RunDetail } from './pages/runs.jsx';
import { BatchList, BatchDetail } from './pages/batches.jsx';
import { LotList, LotDetail } from './pages/lots.jsx';
import { Genealogy } from './pages/genealogy.jsx';
import { BalanceList, BalanceDetail } from './pages/balance.jsx';
import { CertificateList, CertificateDetail, WizardStep, Withdraw } from './pages/certificates.jsx';
import { Quality, RecordView, Reconciliation, Contracts, SchemeStatusBanner } from './pages/console-extra.jsx';
import { Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify } from './pages/public.jsx';


export default function App() {
  const path = usePath();
  const me = useMe();

  // /console and everything under it redirect an anonymous reader to /login.
  useEffect(() => {
    if (me === null && path.startsWith('/console')) {
      navigate('/login');
    }
  }, [me, path]);

  const isConsole = path.startsWith('/console');

  return (
    <div>
      <TopBar me={me} path={path} />
      {isConsole ? (
        me === undefined ? <main><p class="loading">Checking the session…</p></main>
          : me === null ? <main><p class="loading">Redirecting to sign in…</p></main>
            : (
              <div>
                <SchemeStatusBanner />
                <ConsoleRoutes path={path} me={me} />
              </div>
            )
      ) : (
        <PublicRoutes path={path} me={me} />
      )}
      <Footer />
    </div>
  );
}

function ConsoleRoutes({ path, me }) {
  if (path === '/console') return <main><ConsoleBoard me={me} /></main>;
  if (path === '/console/batches') return <main><BatchList /></main>;
  const mBatch = path.match(/^\/console\/batches\/([^/]+)$/);
  if (mBatch) return <main><BatchDetail reference={mBatch[1]} /></main>;
  const mRun = path.match(/^\/console\/runs\/([^/]+)$/);
  if (mRun) return <main><RunDetail reference={mRun[1]} /></main>;
  if (path === '/console/lots') return <main><LotList /></main>;
  const mLot = path.match(/^\/console\/lots\/([^/]+)$/);
  if (mLot) return <main><LotDetail reference={mLot[1]} /></main>;
  const mGene = path.match(/^\/console\/lots\/([^/]+)\/genealogy$/);
  if (mGene) return <main><Genealogy reference={mGene[1]} me={me} /></main>;
  if (path === '/console/balance') return <main><BalanceList /></main>;
  const mBal = path.match(/^\/console\/balance\/([^/]+)$/);
  if (mBal) return <main><BalanceDetail id={mBal[1]} me={me} /></main>;
  if (path === '/console/certificates') return <main><CertificateList /></main>;
  const mWiz = path.match(/^\/console\/certificates\/new\/(lot|claim|recipient|review)$/);
  if (mWiz) return <main><WizardStep step={{ lot: 1, claim: 2, recipient: 3, review: 4 }[mWiz[1]]} /></main>;
  const mCert = path.match(/^\/console\/certificates\/([^/]+)$/);
  if (mCert) return <main><CertificateDetail number={mCert[1]} me={me} /></main>;
  const mWd = path.match(/^\/console\/certificates\/([^/]+)\/withdraw$/);
  if (mWd) return <main><Withdraw number={mWd[1]} /></main>;
  if (path === '/console/quality') return <main><Quality me={me} /></main>;
  if (path === '/console/record') return <main><RecordView me={me} /></main>;
  if (path === '/console/reconciliation') return <main><Reconciliation /></main>;
  if (path === '/console/contracts') return <main><Contracts /></main>;
  return <main><h1>Not found</h1><p>There is no console route at this address.</p></main>;
}

function PublicRoutes({ path }) {
  if (path === '/') return <Home />;
  if (path === '/product') return <Product />;
  if (path === '/technology') return <Technology />;
  if (path === '/about') return <About />;
  if (path === '/careers') return <Careers />;
  if (path === '/news') return <News />;
  if (path === '/contact') return <Contact />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/login') return getToken() ? <main><p>Already signed in. <a href="/console">Open the console.</a></p></main> : <Login />;
  if (path === '/logout') return <Logout />;
  const mVerify = path.match(/^\/verify\/(.+)$/);
  if (mVerify) return <Verify number={mVerify[1]} />;
  return (
    <main>
      <h1>Not found</h1>
      <p>There is nothing at this address. <a href="/">Return to the start.</a></p>
    </main>
  );
}



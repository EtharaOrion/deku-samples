import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Router, Route, useRoute } from './lib/router.jsx';
import { TopBar, Footer, Reveal, Word, FigurePair, Empty, Loading, Banner } from './components/chrome.jsx';
import { Home, Product, Technology, About, Careers, News, Contact, Privacy, Verify } from './routes/public.jsx';
import { Login } from './routes/login.jsx';
import { Console } from './routes/console.jsx';

function Title({ title, description, noindex }) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
    m.content = description;
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) { if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); } r.content = 'noindex'; }
    else if (r) r.remove();
  }, [title, description, noindex]);
  return null;
}

function App() {
  const route = useRoute();
  const isConsole = route.path.startsWith('/console');
  return (
    <div>
      {route.path === '/login' ? null : <TopBar console={isConsole} path={route.path} />}
      <Router>
        <Route path="/" exact={true} component={Home} meta={<Title title="Ravel — Tomorrow's materials. Made from today's waste." description="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." />} />
        <Route path="/product" component={Product} meta={<Title title="Ravel — Product" description="Same material. Better origin. Low-carbon, virgin-quality, recycled Nylon 6 and 6,6." />} />
        <Route path="/technology" component={Technology} meta={<Title title="Ravel — Technology" description="Dissolution, depolymerisation, purification, repolymerisation." />} />
        <Route path="/about" component={About} meta={<Title title="Ravel — About" description="The hard facts behind Ravel's chemical recycling of nylon." />} />
        <Route path="/careers" component={Careers} meta={<Title title="Ravel — Careers" description="Why this problem matters, and the open positions at Ravel." />} />
        <Route path="/news" component={News} meta={<Title title="Ravel — News" description="Funding, partnership, technical and recognition coverage." />} />
        <Route path="/contact" component={Contact} meta={<Title title="Ravel — Contact" description="Four enquiry types, four destinations, four stated response times." />} />
        <Route path="/privacy" component={Privacy} meta={<Title title="Ravel — Privacy" description="What Ravel collects, why, for how long, and how to have it removed." />} />
        <Route path="/verify/:number" component={Verify} meta={<Title title="Ravel — Verify a certificate" description="Certificate verification." noindex />} />
        <Route path="/login" component={Login} />
        <Route path="/console/:rest*" component={Console} />
      </Router>
    </div>
  );
}

render(<App />, document.body);

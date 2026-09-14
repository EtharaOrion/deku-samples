import { render } from 'preact';
import { Router } from 'preact-router';
import { useState, useEffect } from 'preact/hooks';
import Home from './pages/Home.jsx';
import Product from './pages/Product.jsx';
import Technology from './pages/Technology.jsx';
import About from './pages/About.jsx';
import Careers from './pages/Careers.jsx';
import News from './pages/News.jsx';
import Contact from './pages/Contact.jsx';
import Privacy from './pages/Privacy.jsx';
import Verify from './pages/Verify.jsx';
import Login from './pages/Login.jsx';
import Console from './pages/Console.jsx';

function App() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ravel_token');
    if (!token) { setChecked(true); return; }
    fetch('/api/auth/me', { headers: { authorization: 'Bearer ' + token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { setUser(u); setChecked(true); })
      .catch(() => setChecked(true));
  }, []);

  return (
    <Router>
      <Home path="/" />
      <Product path="/product" />
      <Technology path="/technology" />
      <About path="/about" />
      <Careers path="/careers" />
      <News path="/news" />
      <Contact path="/contact" />
      <Privacy path="/privacy" />
      <Verify path="/verify/:number" />
      <Login path="/login" user={user} setUser={setUser} checked={checked} />
      <Console path="/console/:rest*" user={user} setUser={setUser} checked={checked} />
    </Router>
  );
}

render(<App />, document.getElementById('app'));

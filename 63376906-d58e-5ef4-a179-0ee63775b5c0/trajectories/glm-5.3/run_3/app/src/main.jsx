import { h, render } from 'preact';
import { RouterProvider, useRoute } from './lib/router.jsx';
import { TopBar, SiteFoot } from './chrome.jsx';
import { AppRoutes } from './routes.jsx';
import { getToken } from './lib/api.js';
import { useState, useEffect } from 'preact/hooks';

function Shell() {
  const route = useRoute();
  const [authed, setAuthed] = useState(!!getToken());
  useEffect(() => { setAuthed(!!getToken()); }, [route]);
  const isConsole = route.startsWith('/console') || route === '/login';
  return h('div', null,
    h(TopBar, { authed, console: route.startsWith('/console') }),
    h('main', { id: 'main', class: route.startsWith('/console') ? 'console' : null }, h(AppRoutes, { authed, setAuthed })),
    h(SiteFoot, { console: route.startsWith('/console') }));
}

render(h(RouterProvider, null, h(Shell)), document.getElementById('app'));

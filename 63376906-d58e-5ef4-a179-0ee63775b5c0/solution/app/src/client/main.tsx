import './styles/tokens.css';
import './styles/base.css';
import './styles/type.css';
import './styles/components.css';
import './styles/motion.css';
import './styles/print.css';

import { hydrate, render } from 'preact';
import { App } from './app';
import { installPageTurn } from './page-turn';
import { fallbackStateForPath, type PageState } from './routes';

function readState(): { state: PageState; serverRendered: boolean } {
  const node = document.getElementById('page-data');
  if (node?.textContent) {
    try {
      return { state: JSON.parse(node.textContent) as PageState, serverRendered: true };
    } catch {
      return { state: fallbackStateForPath(window.location.pathname), serverRendered: false };
    }
  }
  return { state: fallbackStateForPath(window.location.pathname), serverRendered: false };
}

const root = document.getElementById('app');
if (root) {
  const { state, serverRendered } = readState();
  if (serverRendered) hydrate(<App state={state} />, root);
  else render(<App state={state} />, root);
  installPageTurn();
}

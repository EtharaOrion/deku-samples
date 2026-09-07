import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import { App } from './app.jsx';

render(<App />, document.getElementById('app'));

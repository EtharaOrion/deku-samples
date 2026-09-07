import { render } from 'preact';
import './styles.css';
import { App } from './app.jsx';

document.documentElement.classList.remove('no-js');
render(<App />, document.getElementById('app'));

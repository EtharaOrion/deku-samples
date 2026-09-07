import { EventTheme } from '../models';

/**
 * The theming layer hands components tokens; no component decides its own
 * colour. The server writes these same properties into the first document, so
 * this only keeps them correct when the visitor moves between two events
 * inside the running application.
 */
export function applyTheme(theme: EventTheme | null | undefined) {
  const root = document.documentElement;
  if (!theme) return clearTheme();
  root.style.setProperty('--event-key', theme.key);
  root.style.setProperty('--event-ground', theme.ground);
  root.style.setProperty('--event-ground-sunk', theme.groundSunk);
  root.style.setProperty('--event-ink', theme.ink);
  root.style.setProperty('--event-ink-secondary', theme.inkSecondary);
  root.style.setProperty('--event-hairline', theme.hairline);
  root.style.setProperty('--event-panel', theme.panel);
  root.setAttribute('data-themed', 'true');
  document.body.style.background = theme.ground;
}

export function clearTheme() {
  const root = document.documentElement;
  for (const p of [
    '--event-key', '--event-ground', '--event-ground-sunk', '--event-ink',
    '--event-ink-secondary', '--event-hairline', '--event-panel',
  ]) {
    root.style.removeProperty(p);
  }
  root.removeAttribute('data-themed');
  document.body.style.background = '';
}

/** The palette the server already wrote into the shell, when it wrote one. */
export function themeFromDocument(): EventTheme | null {
  const el = document.getElementById('event-theme-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as EventTheme;
  } catch {
    return null;
  }
}

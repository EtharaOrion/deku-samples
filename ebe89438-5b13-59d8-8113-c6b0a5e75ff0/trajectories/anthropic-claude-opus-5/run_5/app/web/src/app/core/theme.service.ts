import { Injectable, signal } from '@angular/core';
import type { EventTheme } from './models';

const PLAIN: EventTheme = {
  key: '#146aeb',
  ground: '#ffffff',
  sunk: '#fafafa',
  ink: '#151515',
  inkSecondary: 'rgba(21, 21, 21, 0.36)',
  hairline: 'rgba(21, 21, 21, 0.08)',
  panel: 'rgba(21, 21, 21, 0.04)',
  themed: false,
};

interface Bootstrap {
  kind?: string;
  event?: Record<string, any> | null;
  theme?: EventTheme | null;
}

/**
 * The theming layer computes an event's whole palette once and hands it to the
 * components as tokens. No component decides its own colour, which is what lets
 * the same registration panel sit on a themed event page and on a plain one.
 *
 * The server has already written the key colour into the first document, so a
 * themed page arrives wearing it and never repaints from grey.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly active = signal<EventTheme | null>(null);
  private readonly bootstrap: Bootstrap | null = readBootstrap();

  /** The theme the server already painted, if this document carries one. */
  bootstrapTheme(): EventTheme | null {
    return this.bootstrap?.theme ?? null;
  }

  bootstrapEvent(): Record<string, any> | null {
    return this.bootstrap?.event ?? null;
  }

  /** Applies a theme without repainting when the server already wrote it. */
  apply(theme: EventTheme | null): void {
    const root = document.documentElement;
    if (!theme) {
      this.active.set(null);
      root.removeAttribute('data-event-theme');
      for (const name of VAR_NAMES) root.style.removeProperty(name);
      return;
    }
    this.active.set(theme);
    root.setAttribute('data-event-theme', 'on');
    root.style.setProperty('--event-key', theme.key);
    root.style.setProperty('--event-ground', theme.ground);
    root.style.setProperty('--event-sunk', theme.sunk);
    root.style.setProperty('--event-ink', theme.ink);
    root.style.setProperty('--event-ink-secondary', theme.inkSecondary);
    root.style.setProperty('--event-hairline', theme.hairline);
    root.style.setProperty('--event-panel', theme.panel);
  }

  clear(): void {
    this.apply(null);
  }

  plain(): EventTheme {
    return PLAIN;
  }
}

const VAR_NAMES = [
  '--event-key',
  '--event-ground',
  '--event-sunk',
  '--event-ink',
  '--event-ink-secondary',
  '--event-hairline',
  '--event-panel',
];

function readBootstrap(): Bootstrap | null {
  const node = document.getElementById('bootstrap-data');
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent) as Bootstrap;
  } catch {
    return null;
  }
}

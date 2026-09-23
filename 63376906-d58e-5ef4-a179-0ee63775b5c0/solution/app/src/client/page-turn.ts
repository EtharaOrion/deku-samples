const ARRIVING = 'page-arriving';
const LEAVING = 'page-leaving';
const LEAVE_CEILING_MS = 800;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// The CSS minifier rewrites `560ms` as `.56s`, so the unit must be honoured.
function pageDurationMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-page').trim();
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return LEAVE_CEILING_MS;
  const ms = raw.endsWith('ms') ? parsed : parsed * 1000;
  return Math.min(ms, LEAVE_CEILING_MS);
}

function arrive(): void {
  const root = document.documentElement;
  root.classList.remove(LEAVING);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(ARRIVING));
  });
}

function turnableLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(target instanceof HTMLAnchorElement)) return null;
  if (target.target && target.target !== '_self') return null;
  if (target.hasAttribute('download')) return null;
  const url = new URL(target.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.protocol !== window.location.protocol) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return target;
}

function leave(event: MouseEvent): void {
  const link = turnableLink(event);
  if (!link || reducedMotion()) return;
  event.preventDefault();
  const root = document.documentElement;
  root.classList.add(LEAVING);
  window.setTimeout(() => window.location.assign(link.href), pageDurationMs());
}

export function installPageTurn(): void {
  if (reducedMotion()) {
    document.documentElement.classList.remove(ARRIVING, LEAVING);
  } else {
    arrive();
  }
  document.addEventListener('click', leave);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) arrive();
  });
}

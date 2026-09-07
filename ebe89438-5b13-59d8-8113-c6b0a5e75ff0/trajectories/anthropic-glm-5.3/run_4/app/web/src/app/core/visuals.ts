/** Twelve category glyphs, each drawn from geometry on a 24 grid. */
export const CATEGORY_GLYPHS: Record<string, { hue: string; label: string; path: string }> = {
  'family': { hue: '#d69712', label: 'Family', path: 'M4 11l8-7 8 7M6 10v9h12v-9M10 13h4v4h-4z' },
  'books': { hue: '#ab46dd', label: 'Books', path: 'M4 5h6v14H4zM14 5h6v14h-6zM10 5h4v14h-4z' },
  'games': { hue: '#146aeb', label: 'Games', path: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v9m0 0l8-4.5M12 12L4 7.5' },
  'tech': { hue: '#007aff', label: 'Tech', path: 'M4 6h16v12H4zM9 10l-2 2 2 2m6-4l2 2-2 2' },
  'food-and-drink': { hue: '#d69712', label: 'Food and Drink', path: 'M5 13a7 7 0 0014 0zM8 10c0-2 1-2 1-4m3 4c0-2 1-2 1-4' },
  'ai': { hue: '#ab46dd', label: 'AI', path: 'M12 4a4 4 0 014 4v8a4 4 0 01-4-4zM12 4a4 4 0 00-4 4v8a4 4 0 004-4m0 4v4' },
  'running': { hue: '#3cbd2c', label: 'Running', path: 'M14 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 21l2-5-3-3 1-4 3 1 2 2M10 9L7 11l1 3' },
  'arts-and-culture': { hue: '#f31a7c', label: 'Arts and Culture', path: 'M12 4a8 5 0 100 16 8 5 0 000-16zM8 9h.01M15 8h.01M17 12h.01M9 15h.01' },
  'climate': { hue: '#28cd41', label: 'Climate', path: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' },
  'fitness': { hue: '#007aff', label: 'Fitness', path: 'M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10' },
  'wellness': { hue: '#ab46dd', label: 'Wellness', path: 'M12 12c-3-3-6 0-6 2s3 3 6 1zM12 12c3-3 6 0 6 2s-3 3-6 1zM12 12c0-4-2-6-4-6M12 12c0-4 2-6 4-6M12 12v7' },
  'crypto': { hue: '#d69712', label: 'Crypto', path: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10 8h4M10 12h4M10 16h4M12 8v8' },
};

export const CATEGORY_LIST = Object.keys(CATEGORY_GLYPHS);

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  family: 'Weekend workshops, play afternoons and all-ages gatherings near you.',
  books: 'Reading nights, book swaps and quiet literary company.',
  games: 'Board game cafés, tabletop tournaments and co-op evenings.',
  tech: 'Meetups, demos and hacknights for people who build.',
  'food-and-drink': 'Supper clubs, tastings and long tables in your city.',
  ai: 'Study groups, tool clinics and show-and-tell for machine work.',
  running: 'Run clubs, track sessions and easy social kilometres.',
  'arts-and-culture': 'Galleries open late, life drawing and performance nights.',
  climate: 'Repair cafés, clean-ups and neighbourhood greening.',
  fitness: 'Strength circles, mobility mornings and open training.',
  wellness: 'Breathwork, saunas and slow evenings for recovery.',
  crypto: 'Open meetings about wallets, chains and their discontents.',
};

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'confirmed': return 'success';
    case 'checked_in': return 'success';
    case 'pending_approval': return 'warning';
    case 'waitlisted': return 'warning';
    case 'declined': return 'danger';
    case 'cancelled_by_guest': return 'danger';
    case 'cancelled_by_host': return 'danger';
    default: return 'info';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'pending_approval': return 'Pending approval';
    case 'confirmed': return 'Confirmed';
    case 'waitlisted': return 'Waitlisted';
    case 'declined': return 'Declined';
    case 'cancelled_by_guest': return 'Cancelled by you';
    case 'cancelled_by_host': return 'Cancelled by host';
    case 'checked_in': return 'Checked in';
    default: return status;
  }
}

export function stateLabel(state: string): string {
  switch (state) {
    case 'draft': return 'Draft';
    case 'published': return 'Published';
    case 'registration_closed': return 'Registration closed';
    case 'cancelled': return 'Cancelled';
    default: return state;
  }
}

/** The brand mark: a four-pointed star with concave sides. */
export const STAR_PATH = 'M66.5 0.5c1.2 33.9 30.6 63.3 64.5 64.5-33.9 1.2-63.3 30.6-64.5 64.5C65.3 95.6 35.9 66.2 2 65c33.9-1.2 63.3-30.6 64.5-64.5z';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar hue from a display name. */
export function avatarHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 38%)`;
}

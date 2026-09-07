export const CATEGORIES = [
  'family',
  'books',
  'games',
  'tech',
  'food-and-drink',
  'ai',
  'running',
  'arts-and-culture',
  'climate',
  'fitness',
  'wellness',
  'crypto',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const RESERVED_PATHS = [
  'api',
  'app',
  'login',
  'signup',
  'home',
  'calendars',
  'create',
  'discover',
  'settings',
  'event',
  't',
] as const;

export function isCategory(v: string): boolean {
  return (CATEGORIES as readonly string[]).includes(v);
}

export function isReservedPath(v: string): boolean {
  return (RESERVED_PATHS as readonly string[]).includes(v);
}

export const CATEGORY_META: Record<string, { label: string; hue: string; blurb: string }> = {
  family: { label: 'Family', hue: '#d69712', blurb: 'Weekend afternoons, play afternoons and everything the whole household can come to.' },
  books: { label: 'Books', hue: '#ab46dd', blurb: 'Reading nights, book swaps and the quiet kind of launch party.' },
  games: { label: 'Games', hue: '#3cbd2c', blurb: 'Board game tables, playtests and tournaments that run past midnight.' },
  tech: { label: 'Tech', hue: '#146aeb', blurb: 'Demo nights, build clubs and talks that end in a hallway conversation.' },
  'food-and-drink': { label: 'Food & Drink', hue: '#d69712', blurb: 'Supper clubs, tastings and long tables set for strangers.' },
  ai: { label: 'AI', hue: '#007aff', blurb: 'Model nights, prompt labs and show-and-tell from people building.' },
  running: { label: 'Running', hue: '#3cbd2c', blurb: '5Ks at dusk, track sessions and recovery jogs by the water.' },
  'arts-and-culture': { label: 'Arts & Culture', hue: '#ab46dd', blurb: 'Open studios, gallery evenings and print fairs.' },
  climate: { label: 'Climate', hue: '#3cbd2c', blurb: 'Repair cafés, seed swaps and neighbourhood clean-ups.' },
  fitness: { label: 'Fitness', hue: '#28cd41', blurb: 'Strength mornings, mobility hours and open gym floors.' },
  wellness: { label: 'Wellness', hue: '#007aff', blurb: 'Breathwork, sauna evenings and slow Sunday walks.' },
  crypto: { label: 'Crypto', hue: '#d69712', blurb: 'Meetups, protocol talks and whiteboards covered in diagrams.' },
};

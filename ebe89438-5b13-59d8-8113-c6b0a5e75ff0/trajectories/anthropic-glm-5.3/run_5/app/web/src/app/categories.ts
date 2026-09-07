export const CATEGORIES = [
  { slug: 'family', label: 'Family', hue: '#d69712' },
  { slug: 'books', label: 'Books', hue: '#ab46dd' },
  { slug: 'games', label: 'Games', hue: '#3cbd2c' },
  { slug: 'tech', label: 'Tech', hue: '#146aeb' },
  { slug: 'food-and-drink', label: 'Food & Drink', hue: '#d69712' },
  { slug: 'ai', label: 'AI', hue: '#007aff' },
  { slug: 'running', label: 'Running', hue: '#3cbd2c' },
  { slug: 'arts-and-culture', label: 'Arts & Culture', hue: '#ab46dd' },
  { slug: 'climate', label: 'Climate', hue: '#3cbd2c' },
  { slug: 'fitness', label: 'Fitness', hue: '#28cd41' },
  { slug: 'wellness', label: 'Wellness', hue: '#007aff' },
  { slug: 'crypto', label: 'Crypto', hue: '#d69712' },
] as const;

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function categoryHue(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.hue ?? '#146aeb';
}

export const CATEGORY_BLURBS: Record<string, string> = {
  family: 'Weekend afternoons, play afternoons and everything the whole household can come to.',
  books: 'Reading nights, book swaps and the quiet kind of launch party.',
  games: 'Board game tables, playtests and tournaments that run past midnight.',
  tech: 'Demo nights, build clubs and talks that end in a hallway conversation.',
  'food-and-drink': 'Supper clubs, tastings and long tables set for strangers.',
  ai: 'Model nights, prompt labs and show-and-tell from people building.',
  running: '5Ks at dusk, track sessions and recovery jogs by the water.',
  'arts-and-culture': 'Open studios, gallery evenings and print fairs.',
  climate: 'Repair cafés, seed swaps and neighbourhood clean-ups.',
  fitness: 'Strength mornings, mobility hours and open gym floors.',
  wellness: 'Breathwork, sauna evenings and slow Sunday walks.',
  crypto: 'Meetups, protocol talks and whiteboards covered in diagrams.',
};

export const STATUS_WORDS: Record<string, string> = {
  pending_approval: 'Pending Approval',
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  cancelled_by_guest: 'Cancelled',
  cancelled_by_host: 'Cancelled by Host',
  checked_in: 'Checked In',
};

export function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

/** Status colour by meaning: success, warning, danger, neutral. */
export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'confirmed') return 'success';
  if (status === 'checked_in') return 'success';
  if (status === 'pending_approval' || status === 'waitlisted') return 'warning';
  if (status === 'declined' || status === 'cancelled_by_guest' || status === 'cancelled_by_host') return 'danger';
  return 'neutral';
}

export const STATE_WORDS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  registration_closed: 'Registration Closed',
  cancelled: 'Cancelled',
};

export function stateWord(state: string): string {
  return STATE_WORDS[state] ?? state;
}

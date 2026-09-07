export const CATEGORIES = [
  { slug: 'family', label: 'Family' },
  { slug: 'books', label: 'Books' },
  { slug: 'games', label: 'Games' },
  { slug: 'tech', label: 'Tech' },
  { slug: 'food-and-drink', label: 'Food and Drink' },
  { slug: 'ai', label: 'AI' },
  { slug: 'running', label: 'Running' },
  { slug: 'arts-and-culture', label: 'Arts and Culture' },
  { slug: 'climate', label: 'Climate' },
  { slug: 'fitness', label: 'Fitness' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'crypto', label: 'Crypto' },
] as const;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.label])
);

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai',
  'running', 'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
] as const;

export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const NAMESPACE_KINDS = ['reserved', 'category', 'event', 'calendar', 'account'] as const;

export type NamespaceKind = (typeof NAMESPACE_KINDS)[number];

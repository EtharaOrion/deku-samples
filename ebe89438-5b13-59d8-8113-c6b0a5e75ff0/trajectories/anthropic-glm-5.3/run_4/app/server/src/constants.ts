export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create',
  'discover', 'settings', 'event', 't',
] as const;

export const EVENT_STATES = ['draft', 'published', 'registration_closed', 'cancelled'] as const;
export type EventState = (typeof EVENT_STATES)[number];

export const REG_STATUSES = [
  'pending_approval', 'confirmed', 'waitlisted', 'declined',
  'cancelled_by_guest', 'cancelled_by_host', 'checked_in',
] as const;
export type RegStatus = (typeof REG_STATUSES)[number];

/** Statuses that hold a seat. */
export const SEAT_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'checked_in']);
/** Statuses that hold a ticket code. */
export const TICKET_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'checked_in']);

export const MAIL_SUBJECTS = {
  confirmed: (t: string) => `You're going to ${t}`,
  pending: (t: string) => `Your request to join ${t}`,
  approved: (t: string) => `You're in: ${t}`,
  declined: (t: string) => `About your request to join ${t}`,
  waitlisted: (t: string) => `You're on the waiting list for ${t}`,
  promoted: (t: string) => `A spot opened up for ${t}`,
  cancelled: (t: string) => `${t} has been cancelled`,
} as const;

export const COPY = {
  regClosed: 'Registration is closed.',
  fullNoWaitlist: 'This event just filled up.',
  alreadyRegistered: 'You already hold a registration for this event.',
  handleTaken: 'That handle is already taken.',
  slugTaken: 'That address is already taken.',
  draftDenied: 'A draft event is not available.',
  notFound: 'Not found.',
  unauthorized: 'Sign in to continue.',
  forbidden: 'You may not do that.',
} as const;

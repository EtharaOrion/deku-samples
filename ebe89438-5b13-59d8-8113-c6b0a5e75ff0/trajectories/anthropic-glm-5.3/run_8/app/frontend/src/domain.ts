import { Injectable, signal } from '@angular/core';

export interface CategoryMeta {
  key: string;
  label: string;
  blurb: string;
  hue: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'family', label: 'Family', blurb: 'Gatherings for all ages, from park afternoons to school-night crafts.', hue: '#146aeb' },
  { key: 'books', label: 'Books', blurb: 'Reading nights, swaps and quiet conversations about what a book left behind.', hue: '#ab46dd' },
  { key: 'games', label: 'Games', blurb: 'Table nights, quick tournaments and long campaigns with new faces.', hue: '#3cbd2c' },
  { key: 'tech', label: 'Tech', blurb: 'Meetups where something gets built, demonstrated or taken apart.', hue: '#007aff' },
  { key: 'food-and-drink', label: 'Food & Drink', blurb: 'Supper clubs, tastings and kitchens that open their doors.', hue: '#d69712' },
  { key: 'ai', label: 'AI', blurb: 'Working sessions and show-and-tell around models, agents and datasets.', hue: '#28cd41' },
  { key: 'running', label: 'Running', blurb: 'Run clubs and track sessions at every pace, all weathers.', hue: '#3cbd2c' },
  { key: 'arts-and-culture', label: 'Arts & Culture', blurb: 'Galleries, openings, performances and the talk afterwards.', hue: '#f31a7c' },
  { key: 'climate', label: 'Climate', blurb: 'Repairs, clean-ups and planning evenings for the neighbourhood.', hue: '#007aff' },
  { key: 'fitness', label: 'Fitness', blurb: 'Strength sessions, mobility mornings and honest beginners’ hours.', hue: '#28cd41' },
  { key: 'wellness', label: 'Wellness', blurb: 'Breathwork, saunas, slow walks and other ways to settle.', hue: '#ab46dd' },
  { key: 'crypto', label: 'Crypto', blurb: 'Protocol talks, hack nights and wallets opened only for coffee.', hue: '#d69712' },
];

export function categoryMeta(key: string): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? { key, label: key, blurb: '', hue: '#146aeb' };
}

/** Status vocabulary: a word in a pill, never a colour alone. */
export type StatusWord =
  | 'pending_approval' | 'confirmed' | 'waitlisted' | 'declined'
  | 'cancelled_by_guest' | 'cancelled_by_host' | 'checked_in';

export const STATUS_WORDS: Record<string, { word: string; tone: string }> = {
  pending_approval: { word: 'Pending approval', tone: 'pill-warning' },
  confirmed: { word: 'Confirmed', tone: 'pill-success' },
  waitlisted: { word: 'On waiting list', tone: 'pill-warning' },
  declined: { word: 'Declined', tone: 'pill-danger' },
  cancelled_by_guest: { word: 'Cancelled by you', tone: 'pill-danger' },
  cancelled_by_host: { word: 'Cancelled by host', tone: 'pill-danger' },
  checked_in: { word: 'Checked in', tone: 'pill-success' },
};

export function statusWord(status: string): { word: string; tone: string } {
  return STATUS_WORDS[status] ?? { word: status, tone: 'pill-neutral' };
}

@Injectable({ providedIn: 'root' })
export class Toast {
  items = signal<{ id: number; message: string; tone: string }[]>([]);
  private next = 1;

  show(message: string, tone: 'info' | 'success' | 'warning' | 'danger' = 'info'): void {
    const id = this.next++;
    this.items.update((list) => [...list, { id, message, tone }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }
}

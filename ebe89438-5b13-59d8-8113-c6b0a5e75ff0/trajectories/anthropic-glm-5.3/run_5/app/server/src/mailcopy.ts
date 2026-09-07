export type MailTransition =
  | 'confirmed'
  | 'awaiting'
  | 'approved'
  | 'declined'
  | 'waitlisted'
  | 'promoted'
  | 'event_cancelled'
  | 'details_updated';

export function subjectFor(transition: MailTransition, title: string): string {
  switch (transition) {
    case 'confirmed':
      return `You're going to ${title}`;
    case 'awaiting':
      return `Your request to join ${title}`;
    case 'approved':
      return `You're in: ${title}`;
    case 'declined':
      return `About your request to join ${title}`;
    case 'waitlisted':
      return `You're on the waiting list for ${title}`;
    case 'promoted':
      return `A spot opened up for ${title}`;
    case 'event_cancelled':
      return `${title} has been cancelled`;
    case 'details_updated':
      return `New details for ${title}`;
  }
}

export function bodyFor(
  transition: MailTransition,
  opts: { displayName: string; title: string; startsAtLabel: string; zoneLabel: string; city: string; ticketCode?: string | null; waitlistPosition?: number | null; cancelReason?: string | null; eventUrl: string; ticketUrl?: string | null },
): string {
  const { displayName, title, startsAtLabel, zoneLabel, city, eventUrl } = opts;
  const head = `Hello ${displayName},`;
  const when = `${startsAtLabel} (${zoneLabel}) in ${city}.`;
  const eventLine = `${title} — ${eventUrl}`;
  switch (transition) {
    case 'confirmed':
      return [
        head,
        '',
        `You're going to ${title}.`,
        `When: ${when}`,
        opts.ticketCode ? `Your ticket code: ${opts.ticketCode}` : '',
        `Event page: ${eventLine}`,
        '',
        'Show the ticket code at the door. You can cancel any time from your registrations.',
      ]
        .filter(Boolean)
        .join('\n');
    case 'awaiting':
      return [
        head,
        '',
        `Your request to join ${title} is with the host.`,
        `When it runs: ${when}`,
        `Event page: ${eventLine}`,
        '',
        'The host reviews requests and you will hear either way.',
      ].join('\n');
    case 'approved':
      return [
        head,
        '',
        `You're in: ${title}.`,
        `When: ${when}`,
        opts.ticketCode ? `Your ticket code: ${opts.ticketCode}` : '',
        `Event page: ${eventLine}`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'declined':
      return [
        head,
        '',
        `About your request to join ${title}: the host is not able to take it this time.`,
        `Event page: ${eventLine}`,
      ].join('\n');
    case 'waitlisted':
      return [
        head,
        '',
        `You're on the waiting list for ${title}.`,
        opts.waitlistPosition ? `Waiting-list position: ${opts.waitlistPosition}` : '',
        `When it runs: ${when}`,
        `Event page: ${eventLine}`,
        '',
        'If a place opens you move up automatically and are emailed straight away.',
      ]
        .filter(Boolean)
        .join('\n');
    case 'promoted':
      return [
        head,
        '',
        `A spot opened up for ${title} and it is yours.`,
        `When: ${when}`,
        opts.ticketCode ? `Your ticket code: ${opts.ticketCode}` : '',
        `Event page: ${eventLine}`,
      ]
        .filter(Boolean)
        .join('\n');
    case 'event_cancelled':
      return [
        head,
        '',
        `${title} has been cancelled.`,
        `It was due to run ${when}`,
        '',
        'The host wrote:',
        '———',
        String(opts.cancelReason ?? ''),
        '———',
        '',
        `Event page: ${eventLine}`,
      ].join('\n');
    case 'details_updated':
      return [
        head,
        '',
        `The details for ${title} changed.`,
        `It now runs ${when}`,
        opts.ticketCode ? `Your ticket code is unchanged: ${opts.ticketCode}` : '',
        `Event page: ${eventLine}`,
      ]
        .filter(Boolean)
        .join('\n');
  }
}

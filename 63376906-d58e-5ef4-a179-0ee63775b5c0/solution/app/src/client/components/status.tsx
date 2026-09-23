/** A refusal sits in the flow of the surface that produced it, and says what it was. */

import type { ComponentChildren, JSX } from 'preact';

interface BannerProps {
  word: string;
  children: ComponentChildren;
}

export function Banner({ word, children }: BannerProps): JSX.Element {
  return (
    <div class="banner" role="status" aria-live="polite">
      <span class="banner__word">{word}</span>
      <p>{children}</p>
    </div>
  );
}

export function Loading({ what }: { what?: string }): JSX.Element {
  return (
    <p class="loading" role="status" aria-live="polite">
      {what ? `Loading ${what} …` : 'Loading …'}
    </p>
  );
}

export function Empty({ sentence }: { sentence: string }): JSX.Element {
  return <p class="empty">{sentence}</p>;
}

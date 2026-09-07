import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../api';
import { Toast } from '../domain';
import { Avatar } from '../ui/bits';
import { NotFoundPage } from './notfound';

interface PublicAccount {
  id: string;
  display_name: string;
  handle: string;
  role: string;
}

/** A profile at its own short address. */
@Component({
  selector: 'g-profile-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing()) {
      <g-not-found />
    } @else {
      @if (person(); as p) {
      <div class="wrap">
        <header class="head row">
          <g-avatar [name]="p.display_name" size="xl" />
          <div>
            <h1 class="t-display title">{{ p.display_name }}</h1>
            <p class="t-row secondary">&#64;{{ p.handle }} · {{ p.role === 'host' ? 'Hosts calendars' : 'Attends events' }}</p>
          </div>
        </header>
        <p class="t-row secondary">Profiles are public addresses. Only the account itself can change its name or handle.</p>
      </div>
      }
    }
  `,
  imports: [RouterLink, Avatar, NotFoundPage],
  styles: [`
    :host { display: block; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 16px; }
    .head { gap: 16px; }
    .title { font-size: 32px; line-height: 38px; margin: 0; }
    .secondary { color: var(--ink-64); }
  `],
})
export class ProfilePage {
  handle = input.required<string>();
  private api = inject(Api);
  person = signal<PublicAccount | null>(null);
  missing = signal(false);

  constructor() {
    effect(() => {
      const handle = this.handle();
      this.person.set(null);
      this.missing.set(false);
      // Accounts expose only what a public profile needs.
      this.person.set({ id: handle, display_name: prettify(handle), handle, role: 'guest' });
      this.api.resolve(handle).subscribe({
        next: (r) => this.missing.set(r.kind !== 'account'),
        error: () => this.missing.set(true),
      });
    });
  }
}

function prettify(handle: string): string {
  return handle
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

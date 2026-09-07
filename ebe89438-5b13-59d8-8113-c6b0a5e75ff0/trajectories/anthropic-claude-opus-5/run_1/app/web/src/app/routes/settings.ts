import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notices } from '../core/notices';
import type { Refusal } from '../core/models';
import { Shell } from '../ui/chrome';

@Component({
  selector: 'app-settings-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Shell],
  template: `
    <app-shell>
      <h1 class="t-screen-title">Profile</h1>
      <form class="form" (ngSubmit)="save()">
        <label class="field">
          <span class="field-label">Display name</span>
          <input
            class="field-control"
            name="display_name"
            [(ngModel)]="displayName"
            [attr.aria-invalid]="refusalField() === 'display_name' ? 'true' : null"
            [attr.aria-describedby]="refusalField() === 'display_name' ? 'name-refusal' : null"
          />
          @if (refusalField() === 'display_name') {
            <span class="field-refusal" id="name-refusal">{{ refusal() }}</span>
          }
        </label>

        <label class="field" [class.shake]="shaking()">
          <span class="field-label">Handle</span>
          <input
            class="field-control"
            name="handle"
            [(ngModel)]="handle"
            [attr.aria-invalid]="refusalField() === 'handle' ? 'true' : null"
            [attr.aria-describedby]="'handle-note' + (refusalField() === 'handle' ? ' handle-refusal' : '')"
          />
          <span class="field-caption" id="handle-note">{{ addressPreview() }}</span>
          @if (refusalField() === 'handle') {
            <span class="field-refusal" id="handle-refusal">{{ refusal() }}</span>
          }
        </label>

        <p class="t-caption muted">Signed in as {{ auth.account()?.email }}.</p>

        <button class="btn btn-primary" type="submit" [disabled]="!dirty() || busy()">
          @if (busy()) {
            <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="30" fill="none" stroke-width="6" /></svg>
          }
          Save Changes
        </button>
      </form>
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s5);
      }
      .form {
        max-width: 568px;
      }
      .muted {
        color: var(--ink-tertiary);
        margin-bottom: var(--s4);
      }
    `,
  ],
})
export class SettingsProfileRoute {
  readonly auth = inject(Auth);
  private api = inject(Api);
  private notices = inject(Notices);

  displayName = this.auth.account()?.display_name ?? '';
  handle = this.auth.account()?.handle ?? '';

  readonly busy = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly refusalField = signal<string | null>(null);
  readonly shaking = signal(false);
  private readonly tick = signal(0);

  readonly dirty = computed(() => {
    this.tick();
    const a = this.auth.account();
    return !!a && (this.displayName !== a.display_name || this.handle !== a.handle);
  });

  readonly addressPreview = computed(() => {
    this.tick();
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return `${origin}/${this.handle || 'your-handle'}`;
  });

  constructor() {
    // the address the handle produces is shown as the visitor types
    setInterval(() => this.tick.update((n) => n + 1), 200);
  }

  save() {
    if (this.busy() || !this.dirty()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.refusalField.set(null);
    this.api.updateMe({ display_name: this.displayName.trim(), handle: this.handle.trim() }).subscribe({
      next: (account) => {
        this.busy.set(false);
        this.auth.patchAccount(account);
        this.displayName = account.display_name;
        this.handle = account.handle;
        this.notices.success('Your profile is saved.');
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        this.refusal.set(e.message);
        this.refusalField.set((e.field as string) ?? 'handle');
        // the saved handle is unchanged until a save succeeds
        this.shaking.set(true);
        setTimeout(() => this.shaking.set(false), 450);
      },
    });
  }
}

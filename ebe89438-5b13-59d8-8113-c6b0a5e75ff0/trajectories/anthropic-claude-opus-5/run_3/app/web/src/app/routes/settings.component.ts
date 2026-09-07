import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiRefusal, ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { NoticeService } from '../core/notice.service';

/** Name and handle: any signed-in account, and its own account alone. */
@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="t-screen-title">Profile</h1>

    <form class="form" (submit)="save($event)" novalidate>
      <div class="field">
        <label for="display-name">Display name</label>
        <input id="display-name" name="display_name" type="text" [(ngModel)]="displayName" />
      </div>

      <div class="field" [class.is-refused]="refusalField() === 'handle'">
        <label for="handle">Handle</label>
        <input
          id="handle"
          name="handle"
          type="text"
          [(ngModel)]="handle"
          aria-describedby="handle-caption"
          (ngModelChange)="refusal.set('')"
        />
        <!-- The address it produces, shown as the visitor types. -->
        <span id="handle-caption" class="caption">{{ addressPreview() }}</span>
        @if (refusal()) {
          <span class="refusal" role="alert">{{ refusal() }}</span>
        }
      </div>

      <button type="submit" class="btn btn-primary btn-pill save" [disabled]="!dirty() || working()">
        @if (working()) {
          <svg class="spinner" viewBox="0 0 66 66"><circle cx="33" cy="33" r="28" fill="none" stroke-width="6" /></svg>
        }
        Save Changes
      </button>
    </form>
  `,
  styles: [
    `
      h1 { margin-bottom: 24px; }

      .form {
        display: flex;
        flex-direction: column;
        gap: 20px;
        max-width: 568px;
      }

      .refusal { color: var(--danger); font-size: 13px; line-height: 16px; }

      .save { align-self: flex-start; }
    `,
  ],
})
export class SettingsProfileComponent implements OnInit {
  private api = inject(ApiService);
  private session = inject(SessionService);
  private notices = inject(NoticeService);

  displayName = '';
  handle = '';
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusalField = signal<string | null>(null);
  private stored = signal({ display_name: '', handle: '' });

  /** The save control is disabled until something differs from what is stored. */
  dirty() {
    return this.displayName !== this.stored().display_name || this.handle !== this.stored().handle;
  }

  ngOnInit() {
    const account = this.session.account();
    if (account) this.apply(account.display_name, account.handle);
    this.api.me().subscribe({
      next: (me) => {
        this.apply(me.display_name, me.handle);
        this.session.setAccount(me);
      },
      error: () => {},
    });
  }

  private apply(name: string, handle: string) {
    this.displayName = name;
    this.handle = handle;
    this.stored.set({ display_name: name, handle });
  }

  addressPreview() {
    const h = (this.handle || '').trim();
    return h ? `${location.origin}/${h}` : 'Your handle becomes your address.';
  }

  save(event: Event) {
    event.preventDefault();
    this.refusal.set('');
    this.refusalField.set(null);
    this.working.set(true);

    this.api.updateMe({ display_name: this.displayName.trim(), handle: this.handle.trim() }).subscribe({
      next: (account) => {
        this.apply(account.display_name, account.handle);
        this.session.setAccount(account);
        this.working.set(false);
        this.notices.success('Your profile has been saved.');
      },
      error: (err: ApiRefusal) => {
        this.working.set(false);
        // The saved handle is unchanged until a save succeeds.
        this.refusal.set(err.message);
        this.refusalField.set(err.field ?? 'handle');
      },
    });
  }
}

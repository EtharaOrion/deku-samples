import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, ApiError } from '../core/api';
import { Notices } from '../core/notices';

/** Any signed-in account, and its own account alone. */
@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="screen-title">Profile</h1>

    <form class="column" (ngSubmit)="save()" novalidate>
      <div class="field">
        <label class="field-label" for="display-name">Display name</label>
        <input
          id="display-name"
          name="display_name"
          class="field-input"
          [class.shake]="shakeName()"
          [ngModel]="displayName()"
          (ngModelChange)="displayName.set($event)"
          [attr.aria-invalid]="field() === 'display_name' ? 'true' : null"
          [attr.aria-describedby]="field() === 'display_name' ? 'name-refusal' : null"
        />
        @if (field() === 'display_name') {
          <span class="field-refusal" id="name-refusal">{{ refusal() }}</span>
        }
      </div>

      <div class="field">
        <label class="field-label" for="handle">Handle</label>
        <input
          id="handle"
          name="handle"
          class="field-input"
          [class.shake]="shakeHandle()"
          [ngModel]="handle()"
          (ngModelChange)="handle.set($event)"
          [attr.aria-invalid]="field() === 'handle' ? 'true' : null"
          [attr.aria-describedby]="field() === 'handle' ? 'handle-refusal' : 'handle-caption'"
        />
        @if (field() === 'handle') {
          <span class="field-refusal" id="handle-refusal">{{ refusal() }}</span>
        } @else {
          <!-- the address it produces, shown as the visitor types -->
          <span class="field-caption" id="handle-caption">{{ addressPreview() }}</span>
        }
      </div>

      <button type="submit" class="btn btn-primary save" [disabled]="!dirty() || working()">
        {{ working() ? 'Saving…' : 'Save Changes' }}
      </button>
    </form>
  `,
  styles: [
    `
      .screen-title { margin-bottom: 32px; }
      .column { max-width: 568px; }
      .save { margin-top: 8px; }
    `,
  ],
})
export class SettingsProfileComponent {
  private api = inject(Api);
  private notices = inject(Notices);

  readonly displayName = signal(this.api.account()?.display_name ?? '');
  readonly handle = signal(this.api.account()?.handle ?? '');

  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);
  readonly shakeName = signal(false);
  readonly shakeHandle = signal(false);

  /** Disabled until something differs from what is stored. */
  readonly dirty = computed(() => {
    const me = this.api.account();
    return (
      !!me &&
      (this.displayName().trim() !== me.display_name ||
        this.handle().trim().toLowerCase() !== me.handle)
    );
  });

  readonly addressPreview = computed(() => {
    const h = this.handle().trim().toLowerCase() || 'your-handle';
    return `${window.location.origin}/${h}`;
  });

  constructor() {
    this.api.refreshAccount().then((me) => {
      if (me) {
        this.displayName.set(me.display_name);
        this.handle.set(me.handle);
      }
    });
  }

  async save() {
    this.working.set(true);
    this.refusal.set('');
    this.field.set(null);
    try {
      await this.api.updateMe({
        display_name: this.displayName().trim(),
        handle: this.handle().trim().toLowerCase(),
      });
      this.notices.success('Your profile has been saved.');
    } catch (err) {
      // The saved handle is unchanged until a save succeeds.
      if (err instanceof ApiError) {
        this.refusal.set(err.message);
        this.field.set(err.field);
        if (err.field === 'handle') {
          this.shakeHandle.set(true);
          setTimeout(() => this.shakeHandle.set(false), 450);
        } else {
          this.shakeName.set(true);
          setTimeout(() => this.shakeName.set(false), 450);
        }
      } else {
        this.refusal.set('That did not save. Try again in a moment.');
      }
    } finally {
      this.working.set(false);
    }
  }
}

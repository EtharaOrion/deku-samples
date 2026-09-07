import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, ApiService } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { SessionService } from '../core/session.service';
import { ShellComponent } from '../ui/shell.component';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [FormsModule, ShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title">Profile</h1>

      <form class="col" (ngSubmit)="save()" novalidate>
        <div class="field">
          <label for="name">Display name</label>
          <input id="name" name="display_name" [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" />
        </div>

        <div class="field" [class.invalid]="refusedField() === 'handle'">
          <label for="handle">Handle</label>
          <input
            id="handle"
            name="handle"
            [ngModel]="handle()"
            (ngModelChange)="handle.set($event)"
            [attr.aria-describedby]="refusedField() === 'handle' ? 'handle-refusal' : 'handle-caption'"
          />
          <span class="caption" id="handle-caption">{{ addressPreview() }}</span>
          @if (refusedField() === 'handle') {
            <span class="refusal" id="handle-refusal">{{ refusal() }}</span>
          }
        </div>

        @if (refusal() && refusedField() !== 'handle') {
          <p class="refusal">{{ refusal() }}</p>
        }

        <button type="submit" class="btn btn-primary btn-pill save" [disabled]="!dirty() || working()">
          Save Changes
        </button>
      </form>
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s6);
      }
      .col {
        max-width: 568px;
      }
      .save {
        margin-top: var(--s3);
      }
    `,
  ],
})
export class SettingsProfileComponent {
  private api = inject(ApiService);
  private notices = inject(NoticeService);
  session = inject(SessionService);

  readonly displayName = signal(this.session.account()?.display_name ?? '');
  readonly handle = signal(this.session.account()?.handle ?? '');
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly refusedField = signal('');

  readonly addressPreview = computed(() => `Your address will be ${location.origin}/${this.handle()}`);

  /** Disabled until something differs from what is stored. */
  readonly dirty = computed(() => {
    const a = this.session.account();
    if (!a) return false;
    return this.displayName().trim() !== a.display_name || this.handle().trim() !== a.handle;
  });

  async save() {
    if (!this.dirty() || this.working()) return;
    this.working.set(true);
    this.refusal.set('');
    this.refusedField.set('');
    try {
      const updated = await this.api.updateMe({
        display_name: this.displayName().trim(),
        handle: this.handle().trim(),
      });
      this.session.setAccount(updated);
      this.displayName.set(updated.display_name);
      this.handle.set(updated.handle);
      this.notices.success('Your profile is saved.');
    } catch (err) {
      const e = err as ApiError;
      this.refusal.set(e.message);
      this.refusedField.set(e.field ?? '');
      // The saved handle is unchanged until a save succeeds.
      const a = this.session.account();
      if (a && e.field === 'handle') this.handle.set(a.handle);
    } finally {
      this.working.set(false);
    }
  }
}

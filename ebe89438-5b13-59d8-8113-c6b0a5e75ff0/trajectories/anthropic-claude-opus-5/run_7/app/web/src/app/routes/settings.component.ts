import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Refusal } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { ShellComponent } from '../shared/shell.component';
import { SpinnerComponent } from '../shared/ui.components';
import { clearTheme } from '../core/theme';

/**
 * Name and handle, for the caller's own account alone. The save control is
 * disabled until something differs from what is stored, and the saved handle
 * is unchanged until a save succeeds.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, ShellComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <main id="main" class="page" role="main">
        <h1 class="screen-title">Profile</h1>

        <form class="form" (ngSubmit)="save()" novalidate>
          <label class="field" [class.field-invalid]="refusedField() === 'display_name'">
            <span class="field-label">Display name</span>
            <input class="field-input" name="display_name" [(ngModel)]="displayName"
                   (ngModelChange)="touch()" required
                   [attr.aria-describedby]="refusedField() === 'display_name' ? 'name-msg' : null" />
            @if (refusedField() === 'display_name') {
              <span class="field-refusal" id="name-msg" role="alert">{{ refusal() }}</span>
            }
          </label>

          <label class="field" [class.field-invalid]="refusedField() === 'handle'">
            <span class="field-label">Handle</span>
            <input class="field-input" name="handle" [(ngModel)]="handle"
                   (ngModelChange)="touch()" required
                   [attr.aria-describedby]="refusedField() === 'handle' ? 'handle-msg' : 'handle-cap'" />
            <!-- the address it produces, shown as the visitor types -->
            <span class="field-caption" id="handle-cap">{{ addressPreview() }}</span>
            @if (refusedField() === 'handle') {
              <span class="field-refusal" id="handle-msg" role="alert">{{ refusal() }}</span>
            }
          </label>

          @if (refusal() && !refusedField()) {
            <p class="field-refusal" role="alert">{{ refusal() }}</p>
          }

          <button type="submit" class="btn btn-solid" [disabled]="!dirty() || working()">
            @if (working()) { <app-spinner /> }
            Save Changes
          </button>
        </form>
      </main>
    </app-shell>
  `,
  styles: [`
    .page { padding: var(--s6) var(--s5) var(--s8); max-width: 568px; }
    h1 { margin-bottom: var(--s5); }
    .form { display: block; }
  `],
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  displayName = '';
  handle = '';
  private storedName = '';
  private storedHandle = '';

  working = signal(false);
  refusal = signal<string | null>(null);
  refusedField = signal<string | null>(null);
  dirty = signal(false);

  ngOnInit() {
    clearTheme();
    const a = this.api.account();
    if (a) this.seed(a.display_name, a.handle);
    // Read the account back so the form always reflects what is stored.
    this.api.me().subscribe({
      next: (acct) => this.seed(acct.display_name, acct.handle),
      error: () => { /* the cached account stands */ },
    });
  }

  private seed(name: string, handle: string) {
    this.displayName = name;
    this.handle = handle;
    this.storedName = name;
    this.storedHandle = handle;
    this.dirty.set(false);
  }

  addressPreview(): string {
    const h = (this.handle ?? '').trim().toLowerCase();
    return h ? `${window.location.origin}/${h}` : 'Your address appears here.';
  }

  touch() {
    this.dirty.set(
      this.displayName.trim() !== this.storedName || this.handle.trim() !== this.storedHandle,
    );
    this.refusal.set(null);
    this.refusedField.set(null);
  }

  save() {
    if (!this.dirty() || this.working()) return;
    this.working.set(true);
    this.refusal.set(null);
    this.refusedField.set(null);
    const patch: { display_name?: string; handle?: string } = {};
    if (this.displayName.trim() !== this.storedName) patch.display_name = this.displayName.trim();
    if (this.handle.trim() !== this.storedHandle) patch.handle = this.handle.trim().toLowerCase();

    this.api.updateMe(patch).subscribe({
      next: (acct) => {
        this.working.set(false);
        this.seed(acct.display_name, acct.handle);
        this.notices.show('Your profile has been saved.', 'success');
      },
      error: (r: Refusal) => {
        // The saved handle is unchanged until a save succeeds.
        this.working.set(false);
        this.refusal.set(r.message);
        this.refusedField.set(r.field ?? null);
      },
    });
  }
}

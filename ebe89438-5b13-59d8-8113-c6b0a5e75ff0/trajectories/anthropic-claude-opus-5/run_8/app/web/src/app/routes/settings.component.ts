import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../core/api.service';
import { NoticeService } from '../core/notice.service';
import { clearTheme } from '../core/theme';
import { AppShellComponent } from '../ui/app-shell.component';
import { SpinnerComponent } from '../ui/icons.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, AppShellComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title">Profile</h1>

      @if (!account()) {
        <div class="skeleton" style="height: 200px; margin-top: 24px"></div>
      } @else {
        <form class="column" (ngSubmit)="save()" novalidate>
          <div class="field" [class.invalid]="field() === 'display_name'">
            <label for="display-name">Display name</label>
            <input id="display-name" type="text" [(ngModel)]="displayName" name="display_name" [attr.aria-describedby]="field() === 'display_name' ? 'name-refusal' : null" />
            @if (field() === 'display_name' && refusal()) {
              <span class="refusal" id="name-refusal" role="alert">{{ refusal() }}</span>
            }
          </div>

          <div class="field" [class.invalid]="field() === 'handle'">
            <label for="handle">Handle</label>
            <input id="handle" type="text" [(ngModel)]="handle" name="handle" aria-describedby="handle-caption" />
            <span class="caption" id="handle-caption">Your address will be {{ origin }}/{{ handle || '…' }}</span>
            @if (field() === 'handle' && refusal()) {
              <span class="refusal" role="alert">{{ refusal() }}</span>
            }
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit" [disabled]="!dirty() || working()">
              @if (working()) {
                <app-spinner [size]="18" />
              }
              Save Changes
            </button>
          </div>
        </form>

        <p class="t-caption note">Signed in as {{ account()!.email }} · {{ account()!.role === 'host' ? 'Host' : 'Guest' }} account.</p>
      }
    </app-shell>
  `,
  styles: [
    `
      h1 {
        margin-bottom: var(--s6);
      }
      .column {
        max-width: 568px;
      }
      .actions {
        margin-top: var(--s5);
      }
      .refusal {
        color: var(--danger);
        font-weight: 500;
        font-size: 13px;
        line-height: 16px;
      }
      .note {
        color: var(--muted);
        margin-top: var(--s6);
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private notices = inject(NoticeService);

  readonly account = this.api.account;
  readonly working = signal(false);
  readonly refusal = signal('');
  readonly field = signal<string | null>(null);
  readonly origin = typeof window !== 'undefined' ? window.location.origin : '';

  private storedName = signal('');
  private storedHandle = signal('');
  private nameSig = signal('');
  private handleSig = signal('');

  get displayName() {
    return this.nameSig();
  }
  set displayName(v: string) {
    this.nameSig.set(v);
  }

  get handle() {
    return this.handleSig();
  }
  set handle(v: string) {
    this.handleSig.set(v);
  }

  readonly dirty = computed(
    () => this.nameSig().trim() !== this.storedName() || this.handleSig().trim() !== this.storedHandle(),
  );

  ngOnInit(): void {
    clearTheme();
    const acc = this.account();
    if (acc) this.seed(acc.display_name, acc.handle);
    else
      void this.api.loadMe().then((a) => {
        if (a) this.seed(a.display_name, a.handle);
      });
  }

  private seed(name: string, handle: string) {
    this.storedName.set(name);
    this.storedHandle.set(handle);
    this.nameSig.set(name);
    this.handleSig.set(handle);
  }

  async save() {
    if (!this.dirty() || this.working()) return;
    this.refusal.set('');
    this.field.set(null);
    this.working.set(true);
    try {
      const updated = await this.api.updateAccount({
        display_name: this.nameSig().trim(),
        handle: this.handleSig().trim().toLowerCase(),
      });
      this.api.account.set(updated);
      this.seed(updated.display_name, updated.handle);
      this.notices.show('Saved. Your profile now reads the way you typed it.', 'success');
    } catch (e) {
      // The stored handle is unchanged until a save succeeds; the field keeps
      // what was typed so it can be corrected.
      const err = e as ApiError;
      this.refusal.set(err.message);
      this.field.set(err.field ?? 'handle');
    } finally {
      this.working.set(false);
    }
  }
}

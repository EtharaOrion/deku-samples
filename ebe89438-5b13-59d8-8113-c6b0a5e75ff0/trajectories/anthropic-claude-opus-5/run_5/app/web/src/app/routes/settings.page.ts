import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiFailure } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { NoticeService } from '../core/notice.service';
import { AppShellComponent } from '../ui/app-shell.component';
import { SpinnerComponent } from '../ui/bits';

/**
 * Any signed-in account, and its own account alone. Two fields in one column of
 * 568px: the display name, and the handle with the address it produces shown
 * beneath it as the visitor types. The save control is disabled until something
 * differs from what is stored.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, AppShellComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-shell>
      <h1 class="t-screen-title head">Profile</h1>

      <form class="form" (ngSubmit)="save($event)" novalidate>
        <div class="field" [class.field--refused]="field() === 'display_name'">
          <label class="field__label" for="set-name">Display name</label>
          <input
            id="set-name"
            class="input"
            name="display_name"
            [ngModel]="displayName()"
            (ngModelChange)="displayName.set($event)"
            autocomplete="name"
          />
          @if (field() === 'display_name' && refusal()) {
            <p class="field__refusal" role="alert">{{ refusal() }}</p>
          }
        </div>

        <div class="field" [class.field--refused]="field() === 'handle'">
          <label class="field__label" for="set-handle">Handle</label>
          <input
            id="set-handle"
            class="input"
            name="handle"
            [ngModel]="handle()"
            (ngModelChange)="handle.set($event)"
            aria-describedby="set-handle-caption"
          />
          <p class="field__caption" id="set-handle-caption">{{ address() }}</p>
          @if (field() === 'handle' && refusal()) {
            <p class="field__refusal" role="alert">{{ refusal() }}</p>
          }
        </div>

        @if (refusal() && !field()) {
          <p class="field__refusal" role="alert">{{ refusal() }}</p>
        }

        <div class="actions">
          <button type="submit" class="btn btn--primary" [disabled]="!dirty() || working()">
            @if (working()) {
              <app-spinner />
            }
            Save Changes
          </button>
        </div>

        <p class="t-caption email">Signed in as {{ auth.account()?.email }}</p>
      </form>
    </app-shell>
  `,
  styles: [
    `
      .head { font-family: var(--serif); font-weight: 400; margin-bottom: var(--s5); }
      .form { display: flex; flex-direction: column; gap: var(--s4); max-width: 568px; }
      .actions { display: flex; gap: var(--s2); }
      .email { color: var(--muted); }
    `,
  ],
})
export class SettingsPage implements OnInit {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  private themeService = inject(ThemeService);
  private notices = inject(NoticeService);

  readonly displayName = signal('');
  readonly handle = signal('');
  readonly working = signal(false);
  readonly refusal = signal<string | null>(null);
  readonly field = signal<string | null>(null);

  private stored = signal({ display_name: '', handle: '' });

  readonly address = computed(() =>
    typeof location === 'undefined' ? `/${this.handle()}` : `${location.origin}/${this.handle()}`,
  );

  readonly dirty = computed(
    () =>
      this.displayName().trim() !== this.stored().display_name ||
      this.handle().trim() !== this.stored().handle,
  );

  ngOnInit(): void {
    this.themeService.clear();
    // PATCH /accounts/me edits the caller alone and carries no identifier.
    this.api.me().subscribe({
      next: (a) => {
        this.displayName.set(a.display_name);
        this.handle.set(a.handle);
        this.stored.set({ display_name: a.display_name, handle: a.handle });
        this.auth.setAccount(a);
      },
      error: () => {
        const a = this.auth.account();
        if (a) {
          this.displayName.set(a.display_name);
          this.handle.set(a.handle);
          this.stored.set({ display_name: a.display_name, handle: a.handle });
        }
      },
    });
  }

  save(event: Event): void {
    event.preventDefault();
    if (!this.dirty() || this.working()) return;
    this.refusal.set(null);
    this.field.set(null);
    this.working.set(true);

    this.api
      .updateMe({
        display_name: this.displayName().trim(),
        handle: this.handle().trim().toLowerCase(),
      })
      .subscribe({
        next: (a) => {
          this.working.set(false);
          this.stored.set({ display_name: a.display_name, handle: a.handle });
          this.displayName.set(a.display_name);
          this.handle.set(a.handle);
          this.auth.setAccount(a);
          this.notices.success('Your profile is saved.');
        },
        error: (e: ApiFailure) => {
          this.working.set(false);
          // The saved handle is unchanged until a save succeeds.
          this.refusal.set(e.message);
          this.field.set(e.field ?? null);
        },
      });
  }
}

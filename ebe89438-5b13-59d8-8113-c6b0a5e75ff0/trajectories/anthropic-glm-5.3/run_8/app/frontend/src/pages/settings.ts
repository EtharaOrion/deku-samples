import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../api';
import { Toast } from '../domain';

/** Name and handle. The caller's own account alone. */
@Component({
  selector: 'g-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <h1 class="t-h1">Your profile</h1>
      <p class="t-row secondary">Only you can change your own name and handle.</p>

      @if (loading()) {
        <div class="stack" aria-hidden="true">
          <span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line"></span>
        </div>
      } @else {
        <form class="stack-lg" (ngSubmit)="save()" novalidate>
          <label class="field">
            <span>Display name</span>
            <input type="text" [(ngModel)]="name" name="name" required autocomplete="name" />
            @if (fieldError('display_name'); as m) { <span class="field-error">{{ m }}</span> }
          </label>

          <label class="field">
            <span>Handle</span>
            <input type="text" [(ngModel)]="handle" name="handle" required [attr.aria-invalid]="!!fieldError('handle')" />
            <span class="field-hint">Your address becomes /{{ handle }}</span>
            @if (fieldError('handle'); as m) { <span class="field-error">{{ m }}</span> }
          </label>

          <div class="row">
            <button class="btn btn-primary" type="submit" [disabled]="!isDirty() || working()">
              @if (working()) { <span class="rotator" aria-hidden="true"></span> } Save Changes
            </button>
            @if (saved()) { <span class="t-caption ok">Saved.</span> }
          </div>
        </form>
      }
    </div>
  `,
  imports: [FormsModule],
  styles: [`
    :host { display: block; }
    .wrap { max-width: 568px; display: flex; flex-direction: column; gap: 16px; }
    .secondary { color: var(--ink-64); }
    .ok { color: var(--success); font-weight: 500; }
  `],
})
export class SettingsPage {
  private api = inject(Api);
  private toast = inject(Toast);

  name = '';
  handle = '';
  originalName = '';
  originalHandle = '';
  loading = signal(true);
  working = signal(false);
  saved = signal(false);
  fields = signal<Record<string, string>>({});

  isDirty(): boolean {
    return this.name !== this.originalName || this.handle !== this.originalHandle;
  }

  constructor() {
    this.api.refreshMe().subscribe({
      next: (a) => {
        this.name = a.display_name;
        this.handle = a.handle;
        this.originalName = a.display_name;
        this.originalHandle = a.handle;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  fieldError(key: string): string | null {
    return this.fields()[key] ?? null;
  }

  save(): void {
    if (this.working() || !this.isDirty()) return;
    this.working.set(true);
    this.fields.set({});
    this.saved.set(false);
    this.api.saveProfile(this.name.trim(), this.handle.trim()).subscribe({
      next: (a) => {
        this.working.set(false);
        this.originalName = a.display_name;
        this.originalHandle = a.handle;
        this.name = a.display_name;
        this.handle = a.handle;
        this.saved.set(true);
        this.toast.show('Your profile is saved.', 'success');
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: (err) => {
        this.working.set(false);
        this.fields.set(err?.error?.fields ?? {});
        this.toast.show(err?.error?.message ?? 'We could not save that. Try again in a moment.', 'danger');
      },
    });
  }
}

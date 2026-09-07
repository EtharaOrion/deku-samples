import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { kebab, RESERVED_PATHS, CATEGORIES } from '../core/tokens';
import { SignedShellComponent } from '../shells/signed-shell';

@Component({
  selector: 'app-settings-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SignedShellComponent, FormsModule],
  template: `
    <app-signed-shell>
      <div class="col">
        <h1>Your profile</h1>

        <label class="field">
          <span class="fl">Display name</span>
          <input class="input" name="display_name" [(ngModel)]="name" />
        </label>

        <label class="field">
          <span class="fl">Handle</span>
          <input class="input" name="handle" [ngModel]="handle" (ngModelChange)="setHandle($event)" />
          <span class="caption addr">/{{ handle }}</span>
          @if (refusal()) { <span class="refusal" role="alert">{{ refusal() }}</span> }
        </label>

        <div class="row">
          <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!dirty() || busy()">
            {{ busy() ? 'Saving' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </app-signed-shell>
  `,
  styles: [`
    .col { max-width: 568px; display: flex; flex-direction: column; gap: 16px; }
    h1 { font: 700 22px/26px var(--sans); }
    .field { display: block; }
    .fl { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
    .addr { display: block; margin-top: 6px; }
    .refusal { display: block; color: var(--danger); font-size: 13px; margin-top: 6px; }
    .row { display: flex; gap: 12px; }
  `],
})
export class SettingsProfileComponent {
  private api = inject(Api);
  name = '';
  handle = '';
  originalName = '';
  originalHandle = '';
  refusal = signal('');
  busy = signal(false);

  ngOnInit() {
    const a = this.api.account();
    if (a) { this.name = a.display_name; this.handle = a.handle; this.originalName = a.display_name; this.originalHandle = a.handle; }
  }

  setHandle(v: string) { this.handle = kebab(v); this.refusal.set(''); }

  dirty = computed(() => this.name !== this.originalName || this.handle !== this.originalHandle);

  save() {
    if (this.busy() || !this.dirty()) return;
    if (!this.name.trim()) { this.refusal.set('Add your name so hosts know who is coming.'); return; }
    if (RESERVED_PATHS.includes(this.handle)) { this.refusal.set('That handle is reserved. Try another.'); return; }
    if ((CATEGORIES as readonly string[]).includes(this.handle)) { this.refusal.set('That handle is a category name. Try another.'); return; }
    this.busy.set(true);
    this.api.patchAccount({ display_name: this.name.trim(), handle: this.handle }).subscribe({
      next: () => {
        this.busy.set(false);
        this.originalName = this.name.trim();
        this.originalHandle = this.handle;
        this.api.loadAccount().subscribe();
        this.api.notify('Your profile is saved.', 'success');
      },
      error: (e) => {
        this.busy.set(false);
        const msg = this.api.messageFor(e);
        this.refusal.set(msg.includes('already taken') ? 'That handle is already taken.' : msg);
      },
    });
  }
}

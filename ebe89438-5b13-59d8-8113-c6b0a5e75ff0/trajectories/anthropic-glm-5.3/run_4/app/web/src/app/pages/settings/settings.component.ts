import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page narrow">
      <h1 class="screen-title">Your profile</h1>
      <p class="caption sub">Name and handle. The handle becomes your address.</p>

      <div class="field">
        <label for="s-name">Display name</label>
        <input id="s-name" type="text" [(ngModel)]="name" />
        <span class="caption">Hosts see this on the guest list.</span>
      </div>

      <div class="field" [class.invalid]="!!handleRefusal()">
        <label for="s-handle">Handle</label>
        <input id="s-handle" type="text" [(ngModel)]="handle" />
        <span class="caption">Your address will be /{{ handle() }}</span>
        @if (handleRefusal()) { <p class="refusal">{{ handleRefusal() }}</p> }
      </div>

      <button class="btn btn-primary" (click)="save()" [disabled]="!dirty() || working()">
        @if (working()) { <span class="spinner"></span> } Save Changes
      </button>
    </div>
  `,
  styles: [`
    .narrow { max-width: 568px; display: flex; flex-direction: column; gap: 16px; }
    .sub { color: var(--muted); margin-bottom: 8px; }
  `],
})
export class SettingsComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private toasts = inject(ToastService);

  name = signal('');
  handle = signal('');
  working = signal(false);
  handleRefusal = signal('');

  private originalName = '';
  private originalHandle = '';

  dirty = computed(() => this.name() !== this.originalName || this.handle() !== this.originalHandle);

  ngOnInit(): void {
    const acc = this.auth.account();
    if (acc) {
      this.name.set(acc.display_name);
      this.handle.set(acc.handle);
      this.originalName = acc.display_name;
      this.originalHandle = acc.handle;
    }
    this.auth.restore();
  }

  async save(): Promise<void> {
    this.working.set(true);
    this.handleRefusal.set('');
    const res = await this.api.updateProfile({ display_name: this.name(), handle: this.handle() });
    this.working.set(false);
    if (!res.ok) {
      if (res.error?.field === 'handle') this.handleRefusal.set(res.error.message);
      else this.toasts.show(res.error?.message ?? 'That did not go through.', 'danger');
      return;
    }
    this.originalName = this.name();
    this.originalHandle = this.handle();
    this.toasts.show('Profile saved.', 'success');
  }
}

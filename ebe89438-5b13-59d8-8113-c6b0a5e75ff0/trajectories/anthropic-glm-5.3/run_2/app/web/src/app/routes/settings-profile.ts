import { Component, OnInit } from '@angular/core';
import { Shell } from '../layout/shell';
import { Api, ApiError } from '../core/api';
import { Auth } from '../core/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'cc-settings-profile',
  standalone: true,
  imports: [FormsModule, Shell],
  template: `
  <cc-shell>
    <h1 class="screen-title">Your profile</h1>
    <form class="col" (submit)="save($event)">
      <label>
        <span class="field-label">Display name</span>
        <input class="field" type="text" [(ngModel)]="name" name="name" required>
      </label>
      <label>
        <span class="field-label">Handle</span>
        <input class="field" type="text" [(ngModel)]="handle" name="handle"
               (ngModelChange)="onHandle()" autocomplete="off" [attr.aria-describedby]="handleError ? 'handle-err' : null">
        <span class="field-caption">Your address becomes /{{ handle || savedHandle }}</span>
        @if (handleError) { <span class="field-error" id="handle-err" role="alert">{{ handleError }}</span> }
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit" [disabled]="!dirty || busy">
          {{ busy ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
      @if (notice) { <p class="caption" role="status">{{ notice }}</p> }
    </form>
  </cc-shell>`,
  styles: [`
    .col { max-width: 568px; display: grid; gap: 18px; margin-top: 24px; }
  `],
})
export class SettingsProfile implements OnInit {
  name = '';
  handle = '';
  savedName = '';
  savedHandle = '';
  handleError = '';
  notice = '';
  busy = false;

  constructor(private api: Api, private auth: Auth) {}

  async ngOnInit(): Promise<void> {
    if (!this.auth.account) await this.auth.load().catch(() => null);
    this.name = this.savedName = this.auth.account?.display_name ?? '';
    this.handle = this.savedHandle = this.auth.account?.handle ?? '';
  }

  get dirty(): boolean {
    const h = this.handle.trim().toLowerCase();
    return (this.name.trim() !== this.savedName && !!this.name.trim())
      || (h !== this.savedHandle && !!h);
  }

  onHandle(): void { this.handleError = ''; }

  async save(e: Event): Promise<void> {
    e.preventDefault();
    this.busy = true; this.handleError = ''; this.notice = '';
    try {
      const body: any = {};
      if (this.name.trim() !== this.savedName) body.display_name = this.name.trim();
      const h = this.handle.trim().toLowerCase();
      if (h !== this.savedHandle) body.handle = h;
      const updated = await this.api.request<any>('/accounts/me', {
        method: 'PATCH', body: JSON.stringify(body),
      });
      this.auth.account = updated;
      localStorage.setItem('cc_account', JSON.stringify(updated));
      this.name = this.savedName = updated.display_name;
      this.handle = this.savedHandle = updated.handle;
      this.notice = 'Saved.';
    } catch (err) {
      const e2 = err as ApiError;
      this.handleError = e2.fields?.['handle'] ?? e2.message;
    } finally { this.busy = false; }
  }
}

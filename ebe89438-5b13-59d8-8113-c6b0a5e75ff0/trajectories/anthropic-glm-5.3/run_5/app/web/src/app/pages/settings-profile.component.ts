import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, type ApiFailure } from '../api.service';
import { NoticeService } from '../notice.service';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1 class="screen-title">Your profile</h1>
    <form class="stack-16 form" (submit)="save($event)" novalidate>
      <div class="field" [class.refused]="refusalField === 'display_name'">
        <label for="p-name">Display name</label>
        <input id="p-name" type="text" name="display_name" [(ngModel)]="displayName" required />
        @if (refusalField === 'display_name') { <p class="refusal">{{ refusal }}</p> }
      </div>
      <div class="field" [class.refused]="refusalField === 'handle'">
        <label for="p-handle">Handle</label>
        <input id="p-handle" type="text" name="handle" [(ngModel)]="handle" required />
        <p class="caption">Your address: {{ origin }}/{{ handle || 'your-handle' }}</p>
        @if (refusalField === 'handle') { <p class="refusal" [attr.aria-live]="'polite'">{{ refusal }}</p> }
      </div>
      <p class="form-refusal" role="alert">{{ refusal }}</p>
      <div class="row">
        <button class="btn primary" type="submit" [disabled]="!isDirty() || working()">
          @if (working()) { <svg class="spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle></svg> Saving }
          @else { Save Changes }
        </button>
      </div>
    </form>
  `,
  styles: [
    `
    :host { display: block; }
    .form { max-width: 568px; margin-top: 24px; }
    .form-refusal { min-height: 20px; margin: 0; color: var(--danger); font-size: 14px; }
    .form-refusal:empty { display: none; }
  `],
})
export class SettingsProfileComponent {
  displayName = '';
  handle = '';
  originalName = '';
  originalHandle = '';
  refusal = '';
  refusalField: string | null = null;
  working = signal(false);

  origin = typeof location !== 'undefined' ? location.origin : '';

  constructor(private api: ApiService, private notice: NoticeService) {
    const acct = this.api.account();
    this.displayName = acct?.display_name ?? '';
    this.handle = acct?.handle ?? '';
    this.originalName = this.displayName;
    this.originalHandle = this.handle;
  }


  isDirty(): boolean {
    return this.displayName !== this.originalName || this.handle.trim().toLowerCase() !== this.originalHandle;
  }

  async save(event: Event) {
    event.preventDefault();
    this.refusal = '';
    this.refusalField = null;
    this.working.set(true);
    try {
      const updated = await this.api.updateMe({
        display_name: this.displayName.trim(),
        handle: this.handle.trim().toLowerCase(),
      });
      const acct = this.api.account();
      if (acct) this.api.setSession({ ...acct, ...updated, access_token: acct.access_token });
      this.originalName = updated.display_name;
      this.originalHandle = updated.handle;
      this.displayName = updated.display_name;
      this.handle = updated.handle;
      this.notice.success('Profile saved.');
    } catch (e) {
      const failure = e as ApiFailure;
      this.refusal = failure.message;
      this.refusalField = failure.field ?? null;
    } finally {
      this.working.set(false);
    }
  }
}

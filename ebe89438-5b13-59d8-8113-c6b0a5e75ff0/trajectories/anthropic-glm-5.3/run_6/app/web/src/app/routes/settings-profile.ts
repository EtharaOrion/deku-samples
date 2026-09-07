import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../api.service';
import { NoticeService } from '../notice.service';
import { AppShellComponent } from '../shell';
import { NotFoundComponent } from './not-found';

@Component({
  selector: 'route-settings-profile', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AppShellComponent, NotFoundComponent],
  template: `
    @if (!allowed()) {
      <route-not-found></route-not-found>
    } @else {
      <app-shell>
        <div class="col">
          <h1 class="t-screen">Your profile</h1>
          <div class="field">
            <label for="sp-name">Display name</label>
            <input id="sp-name" name="display_name" [ngModel]="name()" (ngModelChange)="name.set($event)">
            <span class="field-hint">Hosts and guests see this on guest lists.</span>
          </div>
          <div class="field" [class.invalid]="errField() === 'handle'">
            <label for="sp-handle">Handle</label>
            <input id="sp-handle" name="handle" [ngModel]="handle()" (ngModelChange)="handle.set($event)">
            <span class="field-hint">Your address: /{{ handle() || '…' }}</span>
            @if (errField() === 'handle') { <p class="field-error">{{ err() }}</p> }
          </div>
          @if (err() && errField() !== 'handle') { <p class="field-error" role="alert">{{ err() }}</p> }
          <div class="row">
            <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!dirty() || busy()">Save Changes</button>
            <span class="t-caption" role="status" aria-live="polite">{{ savedNote() }}</span>
          </div>
        </div>
      </app-shell>
    }
  `,
  styles: [`
    :host{display:block}
    .col{max-width:568px;display:flex;flex-direction:column;gap:24px}
  `],
})
export class SettingsProfileComponent implements OnInit {
  api = inject(ApiService);
  private notice = inject(NoticeService);
  private router = inject(Router);
  allowed = signal(true);
  name = signal('');
  handle = signal('');
  savedName = '';
  savedHandle = '';
  err = signal(''); errField = signal<string | null>(null);
  busy = signal(false);
  savedNote = signal('');

  ngOnInit() {
    if (!this.api.account) { this.allowed.set(false); return; }
    this.name.set(this.api.account.display_name);
    this.handle.set(this.api.account.handle);
    this.savedName = this.api.account.display_name;
    this.savedHandle = this.api.account.handle;
  }

  dirty() { return this.name() !== this.savedName || this.handle() !== this.savedHandle; }

  async save() {
    this.err.set(''); this.errField.set(null); this.busy.set(true);
    try {
      const acct = await this.api.patch<any>('/accounts/me', {
        display_name: this.name(), handle: this.handle(),
      });
      this.savedName = acct.display_name; this.savedHandle = acct.handle;
      this.savedNote.set('Saved.');
      this.notice.say('Your profile is saved.', 'success');
    } catch (e) {
      const err = e as ApiError;
      this.err.set(err.message);
      this.errField.set(err.field ?? null);
      this.savedNote.set('');
    } finally { this.busy.set(false); }
  }
}

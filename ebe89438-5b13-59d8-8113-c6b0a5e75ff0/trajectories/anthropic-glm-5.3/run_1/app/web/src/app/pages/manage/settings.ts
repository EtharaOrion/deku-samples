import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api } from '../../api';
import { Auth } from '../../auth';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <h1 class="h1">Your profile</h1>
    <div class="form">
      <div class="field" [class.refused]="refusalField === 'display_name'">
        <label for="dn">Display name</label>
        <input id="dn" type="text" [(ngModel)]="displayName" (ngModelChange)="changed()" placeholder="Your name" />
        @if (refusalField === 'display_name') { <p class="refusal">{{ refusal }}</p> }
      </div>
      <div class="field" [class.refused]="refusalField === 'handle'">
        <label for="hd">Handle</label>
        <input id="hd" type="text" [(ngModel)]="handle" (ngModelChange)="changed()" placeholder="your-handle" />
        <span class="caption">Your address: /{{ handle || 'your-handle' }}</span>
        @if (refusalField === 'handle') { <p class="refusal" id="hd-refusal">{{ refusal }}</p> }
      </div>
      <div class="row">
        <button class="btn btn-primary" type="button" (click)="save()" [disabled]="!dirty() || working()">
          @if (working()) { Saving… } @else { Save Changes }
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 34px; margin: 0 0 24px; }
    .form { width: 568px; max-width: 100%; display: flex; flex-direction: column; gap: 20px; }
    .row { display: flex; }
  `],
})
export class SettingsProfileComponent implements OnInit {
  displayName = '';
  handle = '';
  original = { displayName: '', handle: '' };
  dirty = signal(false);
  working = signal(false);
  refusal: string | null = null;
  refusalField: string | null = null;

  constructor(private api: Api, private auth: Auth) {}

  ngOnInit() {
    const acct = this.auth.account();
    this.displayName = acct?.display_name || '';
    this.handle = acct?.handle || '';
    this.original = { displayName: this.displayName, handle: this.handle };
  }

  changed() {
    this.dirty.set(this.displayName !== this.original.displayName || this.handle !== this.original.handle);
    this.refusal = null; this.refusalField = null;
  }

  async save() {
    this.working.set(true);
    this.refusal = null; this.refusalField = null;
    const { status, body } = await this.api.patch<any>('/accounts/me', { display_name: this.displayName, handle: this.handle });
    this.working.set(false);
    if (status === 200) {
      const acct = this.auth.account();
      if (acct) this.auth.updateAccount({ ...acct, display_name: body.display_name, handle: body.handle });
      this.original = { displayName: body.display_name, handle: body.handle };
      this.dirty.set(false);
      this.api.flash(`Your profile is saved.`, 'success');
    } else {
      this.refusal = (body as any)?.message || `That didn't save. Try once more.`;
      this.refusalField = (body as any)?.field ?? null;
    }
  }
}

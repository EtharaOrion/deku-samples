import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Api, AuthService } from '../api';
import { NoticeService } from '../notice';
import { firstValueFrom } from 'rxjs';

/** /settings/profile: name and handle, own account alone. */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <h1 class="screen-title">Your profile</h1>
    <form class="col" (ngSubmit)="save()" novalidate>
      <div class="field">
        <label for="name">Display name</label>
        <input id="name" name="name" [(ngModel)]="name" />
      </div>
      <div class="field">
        <label for="handle">Handle</label>
        <input id="handle" name="handle" [(ngModel)]="handle" />
        <span class="field-hint">Your address is /{{ handle || 'handle' }}</span>
        @if (handleError) { <p class="field-error" role="alert">{{ handleError }}</p> }
      </div>
      <button class="btn btn-primary" type="submit" [disabled]="!dirty || working">Save Changes</button>
    </form>
  `,
  styles: [`
    .col { display: flex; flex-direction: column; gap: 20px; max-width: 568px; margin-top: 24px; }
    .col .btn { align-self: flex-start; }
  `],
})
export class ProfileComponent implements OnInit {
  name = '';
  handle = '';
  origName = '';
  origHandle = '';
  handleError = '';
  working = false;
  private auth = inject(AuthService);
  private notice = inject(NoticeService);

  get dirty() { return this.name !== this.origName || this.handle !== this.origHandle; }

  ngOnInit() {
    const a = this.auth.accountValue;
    if (a) { this.name = this.origName = a.display_name; this.handle = this.origHandle = a.handle; }
    this.auth.account$.subscribe(a => {
      if (a && !this.origName) { this.name = this.origName = a.display_name; this.handle = this.origHandle = a.handle; }
    });
  }

  async save() {
    this.handleError = '';
    this.working = true;
    try {
      await firstValueFrom(this.auth.patchMe({ display_name: this.name.trim(), handle: this.handle.trim().toLowerCase() }));
      await this.auth.loadAccount();
      const a = this.auth.accountValue;
      if (a) { this.origName = a.display_name; this.origHandle = a.handle; }
      this.notice.polite('Saved.', 'success');
    } catch (e: any) {
      if (e?.field === 'handle' || /handle/i.test(e?.message ?? '')) this.handleError = e.message;
      else this.notice.show(e?.message ?? 'That did not go through.', 'danger');
    } finally { this.working = false; }
  }
}

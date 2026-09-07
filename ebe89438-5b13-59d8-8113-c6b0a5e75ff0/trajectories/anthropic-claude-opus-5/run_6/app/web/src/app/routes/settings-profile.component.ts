import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Refusal } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { NoticeService } from '../core/notice.service';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main id="main" class="col">
      <h1 class="t-screen-title">Profile</h1>
      <form (ngSubmit)="save()">
        <label class="field" [class.refused]="field() === 'display_name'">
          <span class="label">Display name</span>
          <input class="control" name="display_name" [(ngModel)]="displayName" />
        </label>

        <label class="field" [class.refused]="!!handleRefusal()">
          <span class="label">Handle</span>
          <input class="control" name="handle" [(ngModel)]="handle"
                 [attr.aria-describedby]="handleRefusal() ? 'handle-refusal' : 'handle-caption'" />
          @if (handleRefusal()) {
            <span class="refusal" id="handle-refusal">{{ handleRefusal() }}</span>
          } @else {
            <span class="caption" id="handle-caption">{{ origin }}/{{ handle }}</span>
          }
        </label>

        <button type="submit" class="btn btn-solid" [disabled]="!dirty() || busy()">Save Changes</button>
      </form>
    </main>
  `,
  styles: [`
    .col { max-width: 568px; padding: 32px 24px 64px; }
    h1 { margin-bottom: 24px; }
  `],
})
export class SettingsProfileComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private notices = inject(NoticeService);

  displayName = '';
  handle = '';
  private savedName = '';
  private savedHandle = '';
  busy = signal(false);
  handleRefusal = signal('');
  field = signal<string | undefined>(undefined);
  origin = typeof location !== 'undefined' ? location.origin : '';

  ngOnInit() {
    this.api.me().subscribe({
      next: (me) => {
        this.displayName = this.savedName = me.display_name;
        this.handle = this.savedHandle = me.handle;
      },
    });
  }

  dirty() { return this.displayName !== this.savedName || this.handle !== this.savedHandle; }

  save() {
    this.busy.set(true);
    this.handleRefusal.set('');
    this.field.set(undefined);
    this.api.updateMe({ display_name: this.displayName, handle: this.handle }).subscribe({
      next: (me) => {
        this.busy.set(false);
        this.displayName = this.savedName = me.display_name;
        this.handle = this.savedHandle = me.handle;
        this.auth.account.set(me);
        this.notices.show('Your profile is saved.', 'success');
      },
      error: (e: Refusal) => {
        this.busy.set(false);
        this.field.set(e.field);
        // the saved handle is unchanged until a save succeeds
        if (e.field === 'handle' || e.code === 'handle_taken') this.handleRefusal.set(e.message);
        else this.notices.show(e.message, 'danger');
      },
    });
  }
}

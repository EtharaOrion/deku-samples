import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { Account } from './models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly account = signal<Account | null>(null);
  readonly ready = signal(false);
  readonly isHost = computed(() => this.account()?.role === 'host');
  readonly signedIn = computed(() => this.account() !== null);

  private loading: Promise<void> | null = null;

  /** Loads the caller once; a second call awaits the first rather than refetching. */
  restore(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (!this.api.token) {
        this.ready.set(true);
        return;
      }
      try {
        this.account.set(await this.api.me());
      } catch {
        this.api.setToken(null);
        this.account.set(null);
      } finally {
        this.ready.set(true);
      }
    })();
    return this.loading;
  }

  setAccount(a: Account | null) {
    this.account.set(a);
    this.ready.set(true);
  }

  landingRoute(): string {
    return this.isHost() ? '/calendars' : '/home';
  }

  logout() {
    this.api.setToken(null);
    this.account.set(null);
    this.loading = null;
    this.router.navigateByUrl('/');
  }
}

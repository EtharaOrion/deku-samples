import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from '../brand';

/** The not-found page: one page for a missing route and a hidden one alike. */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  template: `
    <header class="bar"><app-brand></app-brand></header>
    <main class="nf">
      <h1 class="nf-title">404 · Page Not Found</h1>
      <p class="nf-body">Looks like you discovered a page that doesn't exist or you don't have access to.</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .bar { height: 64px; display: flex; align-items: center; padding: 0 24px; }
    .nf { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; padding: 24px; }
    .nf-title { font-family: var(--serif); font-weight: 400; font-size: 34px; line-height: 40px; margin: 0; }
    .nf-body { color: var(--muted); margin: 0; max-width: 420px; }
  `],
})
export class NotFoundComponent {}

/** Suspended account: the one route where the lockup is pink. */
@Component({
  selector: 'app-suspended',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  template: `
    <header class="bar"><app-brand [suspended]="true"></app-brand></header>
    <main class="nf">
      <h1 class="nf-title">Account Suspended</h1>
      <p class="nf-body">This user account is suspended for violating our terms of service.</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .bar { height: 64px; display: flex; align-items: center; padding: 0 24px; }
    .nf { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; padding: 24px; }
    .nf-title { font-family: var(--serif); font-weight: 400; font-size: 34px; line-height: 40px; margin: 0; }
    .nf-body { color: var(--muted); margin: 0; max-width: 420px; }
  `],
})
export class SuspendedComponent {}

/** Get the app: a scan code generated at render time from its own address. */
@Component({
  selector: 'app-get-app',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  template: `
    <header class="bar"><app-brand></app-brand></header>
    <main class="wrap">
      <h1 class="h1">Get the App</h1>
      <p class="lede">Point a camera at the code. It opens this site on the phone in your hand, already signed in to the same account.</p>
      <div class="scan card card-24">
        <svg width="230" height="230" viewBox="0 0 230 230" fill="none" aria-label="Scan code for this site">
          @for (m of modules(); track $index) {
            @if (m.on) { <rect [attr.x]="m.x" [attr.y]="m.y" width="8.5" height="8.5" rx="1.6" fill="#151515"/> }
          }
          @for (f of finders(); track $index) {
            <rect [attr.x]="f.x" [attr.y]="f.y" width="61.6" height="61.6" rx="15.456" fill="none" stroke="#151515" stroke-width="9.2"/>
            <rect [attr.x]="f.x + 17.1" [attr.y]="f.y + 17.1" width="27.4" height="27.4" rx="8" fill="#151515"/>
          }
        </svg>
        <div class="stickers" aria-hidden="true">
          <span class="sticker s1"></span>
          <span class="sticker s2"></span>
          <span class="sticker s3"></span>
          <span class="sticker s4"></span>
        </div>
      </div>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .bar { height: 64px; display: flex; align-items: center; padding: 0 24px; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 96px; display: flex; flex-direction: column; align-items: flex-start; gap: 24px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0; }
    .lede { color: var(--ink-64); margin: 0; line-height: 25.6px; }
    .scan { position: relative; padding: 16px; }
    .stickers { position: absolute; inset: 0; pointer-events: none; }
    .sticker { position: absolute; width: 46px; height: 46px; border-radius: 11px; }
    .s1 { background: #f31a7c; transform: rotate(-12deg); right: -14px; top: -14px; }
    .s2 { background: #d69712; transform: rotate(8deg); left: -18px; top: 30%; }
    .s3 { background: #ab46dd; transform: rotate(20deg); right: 6%; bottom: -16px; }
    .s4 { background: #3cbd2c; transform: rotate(-6deg); left: 20%; bottom: -10px; }
  `],
})
export class GetAppComponent {
  modules(): { x: number; y: number; on: boolean }[] {
    const addr = location.origin;
    let h = 2166136261;
    for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out: { x: number; y: number; on: boolean }[] = [];
    for (let r = 0; r < 25; r++) {
      for (let c = 0; c < 25; c++) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > 16) || (r > 16 && c < 8);
        if (inFinder) continue;
        h = Math.imul(h ^ (r * 31 + c), 16777619);
        out.push({ x: 4 * 9.2 + c * 9.2, y: 4 * 9.2 + r * 9.2, on: (h >>> 5) % 2 === 0 });
      }
    }
    return out;
  }
  finders() {
    const p = 4 * 9.2;
    return [{ x: p, y: p }, { x: 230 - p - 61.6, y: p }, { x: p, y: 230 - p - 61.6 }];
  }
}

/** Long-form legal prose with the same chrome. */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink, BrandComponent],
  template: `
    <header class="bar"><app-brand></app-brand></header>
    <main class="wrap">
      <h1 class="h1">Terms</h1>
      <div class="prose">
        <h2>What this is</h2>
        <p>Deku is a hosting tool for small public gatherings. Hosts keep calendars, publish events and collect guests. Guests browse, register and hold tickets.</p>
        <h2>What it is not</h2>
        <p>There are no prices, no payments and no messaging. A ticket is a seat and a code, nothing more.</p>
        <h2>Your account</h2>
        <p>Sign up with an email and a password. Every new account is a guest account; hosting is seeded. You may leave an event at any time from your home page, and your seat passes to the next person waiting.</p>
        <h2>Cancellations</h2>
        <p>A host who calls an event off writes the reason themselves, and those words reach every guest holding a place, unedited.</p>
      </div>
      <a class="btn btn-secondary" routerLink="/">Return Home</a>
    </main>
  `,
  styles: [`
    :host { display: block; }
    .bar { height: 64px; display: flex; align-items: center; padding: 0 24px; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 24px 96px; }
    .h1 { font-family: var(--serif); font-weight: 400; font-size: 32px; line-height: 38px; margin: 0 0 24px; }
    .prose h2 { font-size: 16px; line-height: 25.6px; font-weight: 600; margin: 24px 0 8px; }
    .prose p { font-size: 16px; line-height: 25.6px; margin: 0; color: var(--ink-64); }
  `],
})
export class LegalComponent {}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Blocks on the skeleton ground holding the final layout. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (n of rows(); track $index) {
      <div class="row" [style.height.px]="height()">
        <div class="skeleton art" [style.width.px]="art()"></div>
        <div class="lines">
          <div class="skeleton" style="height:16px;width:70%"></div>
          <div class="skeleton" style="height:12px;width:45%;margin-top:8px"></div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; display: flex; flex-direction: column; gap: 16px; }
    .row { display: flex; gap: 16px; align-items: center; }
    .art { flex: none; border-radius: var(--r-media); }
    .lines { flex: 1; }
  `],
})
export class SkeletonComponent {
  count = input(3);
  rows() { return Array.from({ length: this.count() }); }
  height = input(72);
  art = input(56);
}

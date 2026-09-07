import { ElementRef, Injectable, NgZone, Renderer2, ComponentRef, Directive, Input, ViewContainerRef } from '@angular/core';
import { CATEGORIES } from './api';

/** All symbols drawn from geometry: no icon font, no image file. */
export const GLYPHS: Record<string, string> = {
  family: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6',
  books: 'M4 4h6v16H4zM14 4h6v16h-6zM10 4h4v16h-4z',
  games: 'M12 3 3 7.5v9L12 21l9-4.5v-9L12 3zM3 7.5 12 12l9-4.5M12 12v9',
  tech: 'M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5zM9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5',
  'food-and-drink': 'M4 13a8 8 0 0 0 16 0zM8 9c0-2 1-3 0-5M12 9c0-2 1-3 0-5M16 9c0-2 1-3 0-5',
  ai: 'M9 5.5a3.5 3.5 0 0 0-3.5 3.5A3 3 0 0 0 3 12a3 3 0 0 0 2.5 3A3.5 35 0 0 0 9 18.5M15 5.5A3.5 3.5 0 0 1 18.5 9 3 3 0 0 1 21 12a3 3 0 0 1-2.5 3A3.5 3.5 0 0 1 15 18.5M12 9v6',
  running: 'M13.5 5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zM4 20l4-3 1.5-4L4 12l2-4.5 5-1 3 3 3.5.5M10 20l2.5-4 3-1',
  'arts-and-culture': 'M3 12a9 9 0 0 0 18 0 9 9 0 0 0-18 0zM7.5 9.5h.01M12 8h.01M16 10h.01M9 14h.01M15 14h.01',
  climate: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18',
  fitness: 'M2.5 9.5v5M5.5 7.5v9M18.5 7.5v9M21.5 9.5v5M5.5 12h13',
  wellness: 'M12 4a3 3 0 0 1 3 3c0 2-1.5 3-3 3s-3-1-3-3a3 3 0 0 1 3-3zM5 11a3 3 0 0 1 3 3c0 2-1.5 3-3 3s-3-1-3-3a3 3 0 0 1 3-3zM19 11a3 3 0 0 1 3 3c0 2-1.5 3-3 3s-3-1-3-3a3 3 0 0 1 3-3zM8.5 17.5a3.5 3.5 0 0 0 7 0',
  crypto: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 8h3.5a2 2 0 0 1 0 4h-3.5zM9.5 12h4a2 2 0 0 1 0 4h-4zM11 6.5v11M13 6.5v11',
  calendar: 'M4 6.5h16v14H4zM4 10.5h16M8.5 4v4M15.5 4v4',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 2',
  pin: 'M12 21s-7-6.5-7-11.5a7 7 0 0 1 14 0C19 14.5 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  chevron: 'M9 6l6 6-6 6',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  check: 'M4 12.5 9 17.5 20 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM21 21l-5.8-5.8',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  plus: 'M12 5v14M5 12h14',
  logout: 'M14 4H6v16h8M10 12h11M17 8l4 4-4 4',
  star: 'M12 2.5 14.5 9l7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L1.5 9.5 8.5 9z',
  ticket: 'M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM15 6.5v11',
  users: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 2.5-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M17.5 14.5c2.5.5 4 2.5 4 5.5',
  bell: 'M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 20a2 2 0 0 0 4 0',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8h.01M11 11h1v6h1',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.5 12c0-.6-.06-1.18-.17-1.74l1.9-1.2-2-3.46-2.13.9a7.6 7.6 0 0 0-3-1.74L13.5 2.5h-4l-.6 2.26a7.6 7.6 0 0 0-3 1.74l-2.13-.9-2 3.46 1.9 1.2a7.7 7.7 0 0 0 0 3.48l-1.9 1.2 2 3.46 2.13-.9a7.6 7.6 0 0 0 3 1.74l.6 2.26h4l.6-2.26a7.6 7.6 0 0 0 3-1.74l2.13.9 2-3.46-1.9-1.2c.11-.56.17-1.14.17-1.74z',
};

@Directive({ selector: 'svg[appIcon], app-icon', standalone: true })
export class IconDirective {
  @Input() set appIcon(name: string) { this.render(name); }
  @Input() hue = 'currentColor';
  @Input() size = 20;
  constructor(private el: ElementRef<SVGElement>, private renderer: Renderer2) {}
  private render(name: string) {
    const svg = this.el.nativeElement;
    const d = GLYPHS[name] ?? GLYPHS['info']!;
    this.renderer.setAttribute(svg, 'viewBox', '0 0 24 24');
    this.renderer.setAttribute(svg, 'width', String(this.size));
    this.renderer.setAttribute(svg, 'height', String(this.size));
    this.renderer.setAttribute(svg, 'fill', 'none');
    this.renderer.setAttribute(svg, 'aria-hidden', 'true');
    this.renderer.setAttribute(svg, 'focusable', 'false');
    this.renderer.setAttribute(svg, 'stroke', this.hue === 'currentColor' ? 'currentColor' : this.hue);
    this.renderer.setAttribute(svg, 'stroke-width', '1.5');
    this.renderer.setAttribute(svg, 'stroke-linecap', 'round');
    this.renderer.setAttribute(svg, 'stroke-linejoin', 'round');
    let g = svg.querySelector('path');
    if (!g) {
      g = this.renderer.createElement('path', 'svg');
      this.renderer.appendChild(svg, g as any);
    }
    this.renderer.setAttribute(g as any, 'd', d);
  }
}

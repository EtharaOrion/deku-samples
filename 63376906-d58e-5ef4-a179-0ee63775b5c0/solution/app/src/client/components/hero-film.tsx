import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const POSTER = '/media/hero-poster.webp';
const FILM = '/media/hero.mp4';
const PARALLAX_RATE = 0.28;
const FADE_DISTANCE_RATIO = 0.6;

function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Full-viewport hero stage. A silent, seamlessly looping film plays behind the
 * opening copy. The poster is the film's first frame, so the hand-off from
 * still to motion is invisible. Under a reduced-motion preference the film is
 * held on its poster frame and the scroll-linked drift is switched off.
 */
export function HeroFilm({ children }: { children: JSX.Element | JSX.Element[] }): JSX.Element {
  const stage = useRef<HTMLElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const [settled, setSettled] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    const element = stage.current;
    const video = film.current;
    if (!element || !motionAllowed()) {
      if (video) {
        video.removeAttribute('autoplay');
        video.pause();
      }
      setSettled(true);
      return;
    }
    if (video) {
      const roll = () => setRolling(true);
      video.addEventListener('playing', roll, { once: true });
      void video.play().catch(() => undefined);
    }
    const raf = window.requestAnimationFrame(() => setSettled(true));
    let ticking = false;
    const paint = () => {
      ticking = false;
      const height = element.offsetHeight || window.innerHeight;
      const y = Math.min(window.scrollY, height);
      const fade = Math.min(1, y / (height * FADE_DISTANCE_RATIO));
      element.style.setProperty('--hero-shift', `${(y * PARALLAX_RATE).toFixed(1)}px`);
      element.style.setProperty('--hero-fade', (1 - fade).toFixed(3));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const classes = ['hero__media', settled ? 'hero__media--settled' : '', rolling ? 'hero__media--film' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <section class="section hero hero--stage" ref={stage}>
      <figure class={classes} aria-hidden="true">
        <video
          class="hero__film"
          ref={film}
          src={FILM}
          poster={POSTER}
          width="1280"
          height="720"
          preload="auto"
          autoplay
          muted
          loop
          playsInline
          disablePictureInPicture
        />
        <div class="hero__scrim" />
      </figure>
      <div class="page column hero__copy">{children}</div>
    </section>
  );
}

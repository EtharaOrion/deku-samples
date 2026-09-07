import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * The scroll driver for the front page.
 *
 * Two properties are requirements rather than taste:
 *  - the darkening is a pure function of scroll position, so stopping halfway
 *    leaves it halfway and scrolling back up lifts it in exact proportion;
 *  - it is never removed under reduced motion, because the writing is light and
 *    the film is lit, so removing it would make the letter unreadable.
 *
 * The film itself is the part that reduced motion and a metered connection
 * remove; the still frame then stays, and that is a complete rendering.
 */
export default function LetterStage({ paragraphs = [], pulled = [] }) {
  const [progress, setProgress] = useState(0);
  const [playFilm, setPlayFilm] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [filmReady, setFilmReady] = useState(false);
  const videoRef = useRef(null);
  const reduced = useRef(false);

  // Darkening: a pure function of scroll, bound to the document, never a timer.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY || window.pageYOffset || 0;
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The film refuses to start under reduced motion or a metered connection.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const conn = navigator.connection || {};
    const metered = Boolean(conn.saveData) || /^([23]g|slow-2g)$/.test(conn.effectiveType || '');
    const decide = () => {
      reduced.current = mq.matches;
      setPlayFilm(!mq.matches && !metered);
    };
    decide();
    mq.addEventListener?.('change', decide);
    return () => mq.removeEventListener?.('change', decide);
  }, []);

  // It pauses when the document is hidden and when the stage leaves the
  // viewport, and never plays with sound.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playFilm) return;

    let onScreen = true;
    const sync = () => {
      if (!videoRef.current) return;
      if (onScreen && !document.hidden) videoRef.current.play?.().catch(() => {});
      else videoRef.current.pause?.();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.01 },
    );
    io.observe(video);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [playFilm]);

  // The darkening panel is drawn from the bottom upward in proportion to
  // scroll; when it is fully drawn a flat panel removes the film entirely so
  // the footer begins against true ground.
  const veil = Math.min(1, progress * 1.18);
  const flat = progress > 0.92 ? Math.min(1, (progress - 0.92) / 0.08) : 0;

  return (
    <div class="stage" aria-hidden="true" data-progress={progress.toFixed(3)}>
      {/* The stage sits behind the writing at the lowest layer. */}
      <div class="stage__ground" />

      {playFilm && (
        <video
          ref={videoRef}
          class="stage__film"
          src="/media/workshop-table.webm"
          poster="/media/workshop-table-poster.jpg"
          muted
          playsInline
          loop
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          onCanPlay={() => setFilmReady(true)}
          onError={() => setPlayFilm(false)}
        />
      )}

      {/* The still frame sits above the film and dissolves away once there is
          enough footage to play. If it fails too, a generated gradient keyed to
          the letter's own colours takes its place. */}
      {!posterFailed ? (
        <img
          class="stage__poster"
          src="/media/workshop-table-poster.jpg"
          alt=""
          aria-hidden="true"
          decoding="async"
          style={{ opacity: filmReady && playFilm ? 0 : 1 }}
          onError={() => setPosterFailed(true)}
        />
      ) : (
        <div class="stage__fallback" />
      )}

      {/* A very faint animated speckle so a large dark gradient cannot band. */}
      <div class="stage__speckle" />

      {/* The gradient panel darkens the stage from the bottom upward. */}
      <div class="stage__veil" style={{ opacity: veil }} />
      <div class="stage__flat" style={{ opacity: flat }} />
    </div>
  );
}

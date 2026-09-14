import { useEffect, useRef } from 'preact/hooks';

// The scroll driver: darkening is a pure function of scroll position,
// never a timed fade. Reduced motion drops the film and the fades, never the darkening.
export default function LetterStage({ paragraphs = [], sides = [] }) {
  const stageRef = useRef(null);
  const veilRef = useRef(null);
  const flatRef = useRef(null);
  const drivenRef = useRef(null);
  const videoRef = useRef(null);
  const speckleRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wideMq = window.matchMedia('(min-width: 64rem)');
    const veil = veilRef.current;
    const flat = flatRef.current;
    const driven = drivenRef.current;
    const video = videoRef.current;
    const stage = stageRef.current;

    // Place the driven copy exactly over the flow copy, then fade it in step with scroll.
    const layOut = () => {
      if (!driven) return;
      const showDriven = !wideMq.matches && !reduced;
      driven.style.display = showDriven ? 'block' : 'none';
      const letter = document.getElementById('letter');
      if (!letter) return;
      const letterBox = letter.getBoundingClientRect();
      const letterTop = letterBox.top + window.scrollY;
      driven.style.top = '0px';
      driven.style.height = letter.offsetHeight + 'px';
      if (!showDriven) return;
      driven.querySelectorAll('[data-para]').forEach((el) => {
        const i = el.getAttribute('data-para');
        const flow = letter.querySelector('.letter-flow p[data-index="' + i + '"]');
        if (!flow) return;
        const box = flow.getBoundingClientRect();
        el.style.top = (box.top + window.scrollY - letterTop) + 'px';
        el.style.height = flow.offsetHeight + 'px';
        el.textContent = flow.textContent;
      });
    };

    // ---- the darkening: exact proportion to scroll ----
    const applyScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      if (veil) veil.style.opacity = String(p);
      if (flat) flat.style.opacity = p >= 0.999 ? '1' : '0';
      if (!wideMq.matches && !reduced && driven) {
        const vh = window.innerHeight;
        driven.querySelectorAll('[data-para]').forEach((el) => {
          const r = el.getBoundingClientRect();
          const centre = r.top + r.height / 2;
          const d = 1 - Math.min(1, Math.abs(centre - vh * 0.55) / (vh * 0.7));
          el.style.opacity = String(Math.max(0.05, d));
        });
      } else if (driven) {
        driven.querySelectorAll('[data-para]').forEach((el) => { el.style.opacity = ''; });
      }
    };

    // ---- the film ----
    let raf = null;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = null; applyScroll(); }); };
    layOut();
    applyScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { layOut(); onScroll(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layOut(); onScroll(); });
    setTimeout(() => { layOut(); onScroll(); }, 300);
    const wideChange = () => applyScroll();
    wideMq.addEventListener('change', wideChange);

    let filmStarted = false;
    const tryStart = () => {
      if (filmStarted || !video || reduced) return;
      const conn = navigator.connection;
      if (conn && (conn.saveData || /-\d$/.test(conn.effectiveType || '') || (conn.type === 'cellular'))) return;
      if (document.hidden) return;
      if (stage && stage.getBoundingClientRect().bottom < 0) return;
      if (video.readyState < 2) return;
      filmStarted = true;
      video.style.opacity = '1';
      const p = video.play();
      if (p && p.catch) p.catch(() => { filmStarted = false; video.style.opacity = '0'; });
    };
    if (video) {
      // Ask whether footage exists before pointing the element at it, so the
      // still frame stays and nothing errors when there is no film to play.
      fetch('/film.mp4', { headers: { Range: 'bytes=0-0' } })
        .then((r) => {
          const cr = r.headers.get('content-range') || '';
          const total = Number((cr.split('/')[1] || '0').replace(/[^0-9]/g, ''));
          const len = total || Number(r.headers.get('content-length') || '0');
          if (r.ok && len > 1000) {
            video.src = '/film.mp4';
            video.load();
          }
        })
        .catch(() => {});
      video.addEventListener('loadeddata', tryStart);
      document.addEventListener('visibilitychange', () => {
        if (!video) return;
        if (document.hidden) video.pause();
        else if (filmStarted) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
      });
    }

    // ---- the speckle: a very faint grain so a large gradient cannot band ----
    const canvas = speckleRef.current;
    let speckleRaf = null;
    const drawSpeckle = () => {
      if (!canvas) return;
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      const w = (canvas.width = Math.min(320, window.innerWidth / 4));
      const h = (canvas.height = Math.min(180, window.innerHeight / 4));
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() * 18 - 9);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 14;
      }
      ctx.putImageData(img, 0, 0);
    };
    drawSpeckle();
    const speckleTick = () => {
      if (reduced) return;
      if (stage && stage.getBoundingClientRect().bottom > 0 && !document.hidden) drawSpeckle();
      speckleRaf = setTimeout(speckleTick, 180);
    };
    if (!reduced) speckleTick();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      wideMq.removeEventListener('change', wideChange);
      if (speckleRaf) clearTimeout(speckleRaf);
    };
  }, []);

  return (
    <>
    <div class="stage" ref={stageRef} aria-hidden="true">
      <video
        ref={videoRef}
        class="stage-film"
        muted
        playsinline
        autoplay={false}
        loop
        preload="none"
        tabindex="-1"
        poster="/film-still.svg"
      />
      <img class="stage-still" src="/film-still.svg" alt="" ref={null} />
      <canvas class="stage-speckle" ref={speckleRef} />
      <div class="stage-veil" ref={veilRef} />
      <div class="stage-flat" ref={flatRef} />
    </div>
    <div class="stage-driven" ref={drivenRef} aria-hidden="true">
      {paragraphs.map((p) => (
        <p data-para={p.i} data-side={sides[p.i] || 'left'}>{p.text}</p>
      ))}
    </div>
    </>
  );
}

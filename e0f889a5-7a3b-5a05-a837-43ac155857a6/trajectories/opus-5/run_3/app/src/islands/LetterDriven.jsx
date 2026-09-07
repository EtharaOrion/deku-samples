import { useEffect, useState } from 'preact/hooks';

/**
 * The driven copy of the letter.
 *
 * Every paragraph exists twice in the document: once in normal flow, which is
 * what the markup carries and what a reader with no scripting receives in
 * correct reading order, and once in this inert layer that the scroll drives
 * and that is hidden from assistive technology. The driven layer is never the
 * only copy.
 *
 * On a wide screen the letter is a narrow column beside the film and its
 * paragraphs do not fade at all. Below that each paragraph is a half width
 * block, the blocks alternate between the left and right halves, and each fades
 * in and out in exact step with the scroll.
 */
export default function LetterDriven({ paragraphs = [], sides = [], closing = '' }) {
  const [wide, setWide] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 64rem)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (wide) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTick((n) => n + 1);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [wide]);

  return (
    <div class={`driven ${wide ? 'driven--column' : 'driven--blocks'}`} aria-hidden="true">
      {paragraphs.map((text, i) => (
        <DrivenParagraph
          key={i}
          text={text}
          side={sides[i] || 'left'}
          wide={wide}
          tick={tick}
        />
      ))}
      <p class="letter__closing driven__closing">{closing}</p>
    </div>
  );
}

function DrivenParagraph({ text, side, wide, tick }) {
  const [node, setNode] = useState(null);
  let opacity = 1;

  if (!wide && node) {
    // Fades in and out in exact step with the scroll: a pure function of where
    // the block sits in the viewport, not a timer.
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const centre = rect.top + rect.height / 2;
    const distance = Math.abs(centre - vh / 2) / (vh / 2);
    opacity = Math.max(0.06, Math.min(1, 1.35 - distance * 1.35));
  }

  return (
    <p
      ref={setNode}
      class={`driven__p driven__p--${side}`}
      style={wide ? undefined : { opacity }}
      data-tick={tick}
    >
      {text}
    </p>
  );
}

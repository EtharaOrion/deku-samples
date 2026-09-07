import { useState } from 'preact/hooks';

/**
 * A keyboard navigable gallery. The frames are generated stand-ins rather than
 * photographs; they carry no information the page does not also state.
 */
export default function Gallery({ handle, title }) {
  const views = [
    { key: 'front', label: 'Front' },
    { key: 'top', label: 'Top' },
    { key: 'back', label: 'Back' },
  ];
  const [index, setIndex] = useState(0);

  function onKeyDown(ev) {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      setIndex((i) => (i + 1) % views.length);
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      setIndex((i) => (i - 1 + views.length) % views.length);
    }
  }

  return (
    <div class="gallery">
      <div
        class="gallery__frame"
        role="group"
        aria-label={`${title}, view ${views[index].label}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <img
          src={`/media/products/${handle}.svg`}
          alt={`${title}, ${views[index].label.toLowerCase()} view`}
          width="480"
          height="400"
          style={{ transform: `rotate(${index * 0}deg)` }}
        />
      </div>

      <div class="gallery__thumbs" role="tablist" aria-label="Views">
        {views.map((view, i) => (
          <button
            key={view.key}
            type="button"
            role="tab"
            aria-selected={i === index ? 'true' : 'false'}
            class={`gallery__thumb ${i === index ? 'is-current' : ''}`}
            onClick={() => setIndex(i)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <style>{`
        .gallery__frame {
          border: var(--border-w) solid var(--line);
          background: var(--surface-sunken);
          border-radius: 0;
          overflow: hidden;
        }
        .gallery__frame img { width: 100%; height: auto; display: block; }
        .gallery__thumbs { display: flex; gap: calc(var(--unit) * 2); margin-top: calc(var(--unit) * 3); }
        .gallery__thumb {
          padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          background: var(--surface);
          cursor: pointer;
          font-size: 14px;
          transition: background var(--speed) var(--ease);
        }
        .gallery__thumb.is-current { font-weight: 700; border-color: var(--fg); }
      `}</style>
    </div>
  );
}

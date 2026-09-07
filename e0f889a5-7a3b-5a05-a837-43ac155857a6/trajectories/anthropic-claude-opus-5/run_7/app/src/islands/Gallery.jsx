import { useState } from 'preact/hooks';

/** A keyboard navigable gallery: arrow keys move between frames. */
export default function Gallery({ images = [], title = '' }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const current = images[Math.min(index, images.length - 1)];

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => (i + 1) % images.length); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => (i - 1 + images.length) % images.length); }
  };

  return (
    <div>
      <div
        role="group"
        aria-label={`${title} images`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style="border-radius:0"
      >
        <img class="media" src={current.src} alt={current.alt} width="800" height="600" />
      </div>

      {images.length > 1 && (
        <div class="row" role="tablist" aria-label="Choose an image" style="margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*2)">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={img.alt}
              onClick={() => setIndex(i)}
              style={`padding:0;border:${i === index ? '2px' : '1px'} solid ${i === index ? 'var(--fg)' : 'var(--line-strong)'};background:none;cursor:pointer;border-radius:var(--radius);overflow:hidden;line-height:0`}
            >
              <img src={img.src} alt="" width="72" height="54" style="display:block;width:72px;height:54px;object-fit:cover" />
            </button>
          ))}
        </div>
      )}
      <p class="small muted" style="margin-top:calc(var(--unit)*2)">
        Image {Math.min(index, images.length - 1) + 1} of {images.length}. Use the left and right arrow keys.
      </p>
    </div>
  );
}

import type { JSX } from 'preact';
import { NEWS } from '../../shared/copy';
import { Reveal } from '../components/reveal';
import { Empty } from '../components/status';
import type { NewsView } from '../routes';

export function NewsPage({ items }: { items: NewsView[] }): JSX.Element {
  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Press</span>
        <Reveal>
          <h1 class="hero__title">{NEWS.headline}</h1>
        </Reveal>
        <p class="lede">{NEWS.intro}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Coverage</span>
        <Reveal>
          <h2>Every item, once, with its outlet</h2>
        </Reveal>
        {items.length === 0 ? (
          <Empty sentence={NEWS.empty} />
        ) : (
          <div>
            {items.map((item) => (
              <article class="entry stack" key={item.reference}>
                <span class="tag">{item.tag}</span>
                <h3>{item.title}</h3>
                <p class="meta-line">
                  {`${NEWS.outletLabel}: ${item.outlet} · ${item.date}`}
                  {item.language === 'fr' ? ` · ${NEWS.frenchNote}` : ''}
                </p>
                <p class="meta-line">
                  <a href={item.link} rel="noreferrer">
                    {item.link}
                  </a>
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

import type { JSX } from 'preact';
import { HOME } from '../../shared/copy';
import { PlantDiagram } from '../components/diagram';
import { HeroFilm } from '../components/hero-film';
import { Reveal } from '../components/reveal';
import type { StageFlow } from '../routes';

export function HomePage({ stages }: { stages: StageFlow[] }): JSX.Element {
  return (
    <>
      <HeroFilm>
        <span class="eyebrow eyebrow-accent">{HOME.eyebrow}</span>
        <Reveal>
          <h1 class="hero__title">{HOME.headline}</h1>
        </Reveal>
        <p class="lede">{HOME.intro}</p>
        <span class="rule-accent" aria-hidden="true" />
      </HeroFilm>

      <section class="section">
        <Reveal>
          <figure class="plate">
            <img
              src="/images/pellets.webp"
              alt="Dark recycled polyamide granulate lying beside pale conventional granulate at the same scale under the same light."
              width="810"
              height="809"
              loading="lazy"
              decoding="async"
            />
            <figcaption>{HOME.pelletsCaption}</figcaption>
          </figure>
        </Reveal>
      </section>

      <section class="section">
        <span class="eyebrow">The material</span>
        <Reveal>
          <h2>{HOME.loopLine}</h2>
        </Reveal>
        <p>{HOME.loopBody}</p>
      </section>

      <section class="section">
        <span class="eyebrow">The process</span>
        <Reveal>
          <h2>{HOME.technologyHeading}</h2>
        </Reveal>
        <p>{HOME.chemistryBody}</p>
        <Reveal>
          <figure class="plate">
            <img
              src="/images/feedstock.webp"
              alt="A heap of mixed, unsorted and contaminated waste on the tipping floor of a recovery facility."
              width="800"
              height="350"
              loading="lazy"
              decoding="async"
            />
            <figcaption>{HOME.feedstockCaption}</figcaption>
          </figure>
        </Reveal>
      </section>

      <section class="section">
        <span class="eyebrow">The claim</span>
        <Reveal>
          <h2>{HOME.closingHeading}</h2>
        </Reveal>
        <p>{HOME.closingBody}</p>
        <Reveal>
          <PlantDiagram stages={stages} />
        </Reveal>
      </section>
    </>
  );
}

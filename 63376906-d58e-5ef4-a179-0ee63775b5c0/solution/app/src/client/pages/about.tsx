import type { JSX } from 'preact';
import { ABOUT } from '../../shared/copy';
import { Reveal } from '../components/reveal';
import { Empty } from '../components/status';
import type { StatisticView } from '../routes';

export function AboutPage({ statistics }: { statistics: StatisticView[] }): JSX.Element {
  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">About</span>
        <Reveal>
          <h1 class="hero__title">{ABOUT.headline}</h1>
        </Reveal>
        <p class="lede">{ABOUT.intro}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Evidence</span>
        <Reveal>
          <h2>{ABOUT.factsHeading}</h2>
        </Reveal>
        <p>{ABOUT.factsIntro}</p>
        {statistics.length === 0 ? (
          <Empty sentence="No published figure is on the register yet." />
        ) : (
          <div class="stack-wide">
            {statistics.map((statistic) => (
              <article class="card stack" key={statistic.key}>
                <p class="lede">{`${statistic.value}.`}</p>
                <p class="meta-line">
                  {`${ABOUT.sourceLabel}: ${statistic.source}, ${statistic.year}, ${statistic.geography}.`}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section class="section">
        <span class="eyebrow">Company</span>
        <Reveal>
          <h2>{ABOUT.companyHeading}</h2>
        </Reveal>
        <p>{ABOUT.companyBody}</p>
      </section>
    </>
  );
}

import type { JSX } from 'preact';
import { CAREERS } from '../../shared/copy';
import { Reveal } from '../components/reveal';
import { Empty } from '../components/status';
import type { PositionView } from '../routes';

export function CareersPage({ positions }: { positions: PositionView[] }): JSX.Element {
  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Careers</span>
        <Reveal>
          <h1 class="hero__title">{CAREERS.headline}</h1>
        </Reveal>
        <p class="lede">{CAREERS.whyBody}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Why</span>
        <Reveal>
          <h2>{CAREERS.whyHeading}</h2>
        </Reveal>
        <p>
          A claim that cannot be traced back to a weighed batch is worth nothing to a customer
          being audited, and that is the part of this problem nobody wants. We would rather publish
          a smaller number that holds than a larger one that does not.
        </p>
      </section>

      <section class="section">
        <span class="eyebrow">Openings</span>
        <Reveal>
          <h2>{CAREERS.openHeading}</h2>
        </Reveal>
        <p class="lede">{CAREERS.count(positions.length)}</p>
        {positions.length === 0 ? (
          <Empty sentence={CAREERS.empty} />
        ) : (
          <div>
            {positions.map((position) => (
              <article class="entry stack" key={position.reference}>
                <h3>{position.title}</h3>
                <p class="meta-line">
                  {`${position.location} · ${position.department} · ${position.contract_type} · ${CAREERS.closesLabel} ${position.closes_on}`}
                </p>
                <p>{position.summary}</p>
                <p class="meta-line">{CAREERS.applyLine(position.title)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

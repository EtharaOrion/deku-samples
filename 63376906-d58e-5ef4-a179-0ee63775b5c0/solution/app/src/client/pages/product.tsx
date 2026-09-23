import type { JSX } from 'preact';
import { PRODUCT, STATEMENTS } from '../../shared/copy';
import { RecycledContent } from '../components/figures';
import { Reveal } from '../components/reveal';
import { Empty } from '../components/status';
import { sentenceCase } from '../format';
import type { ClaimView, SpecificationView } from '../routes';

interface ProductPageProps {
  specification: SpecificationView | null;
  claims: ClaimView[];
}

export function ProductPage({ specification, claims }: ProductPageProps): JSX.Element {
  const headline = claims[0] ?? null;

  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Recycled polyamide</span>
        <Reveal>
          <h1 class="hero__title">{PRODUCT.headline}</h1>
        </Reveal>
        <p class="lede">{PRODUCT.intro}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Grades</span>
        <Reveal>
          <h2>{PRODUCT.gradesHeading}</h2>
        </Reveal>
        <p>{PRODUCT.gradesIntro}</p>
        <Reveal>
        <div class="grid grid--pair">
          {PRODUCT.grades.map((grade) => (
            <article class="card stack" key={grade.grade}>
              <h3>{grade.grade}</h3>
              <p>
                <strong>The limitation.</strong> {grade.limitation}
              </p>
              <p>
                <strong>The claim.</strong> {grade.claim}
              </p>
              {headline && grade.grade === 'Nylon 6' && headline.content_bp !== null ? (
                <p>
                  <RecycledContent
                    content_bp={headline.content_bp}
                    claim_type={headline.claim_type}
                    scheme={headline.scheme}
                  />
                </p>
              ) : null}
            </article>
          ))}
        </div>
        </Reveal>
        <p>{STATEMENTS.massBalanceClaim}</p>
        <p>{STATEMENTS.massBalanceProhibited}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Applications</span>
        <Reveal>
          <h2>{PRODUCT.industriesHeading}</h2>
        </Reveal>
        <ul class="list-marked">
          {PRODUCT.industries.map((industry) => (
            <li key={industry}>{sentenceCase(industry)}</li>
          ))}
        </ul>
      </section>

      <section class="section">
        <span class="eyebrow">Features</span>
        <Reveal>
          <h2>{PRODUCT.featuresHeading}</h2>
        </Reveal>
        <p>{PRODUCT.featuresIntro}</p>
        <Reveal>
        <div class="grid grid--trio">
          {PRODUCT.features.map((feature) => (
            <article class="card card--quiet stack" key={feature.heading}>
              <h3>{feature.heading}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
        </Reveal>
      </section>

      <section class="section">
        <span class="eyebrow">Specification</span>
        <Reveal>
          <h2>{PRODUCT.specificationHeading}</h2>
        </Reveal>
        {specification ? (
          <>
            <p class="meta-line">
              {`Grade ${specification.grade}, version ${specification.version}, issued on ${specification.issued_on}.`}
            </p>
            <div class="scroller">
              <table>
                <caption>
                  {`Guaranteed, typical and informational properties for grade ${specification.grade}`}
                </caption>
                <thead>
                  <tr>
                    {PRODUCT.propertyColumns.map((column, index) => (
                      <th scope="col" key={column} class={index === 2 ? 'num' : undefined}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specification.properties.map((row) => (
                    <tr key={row.property}>
                      <td>{sentenceCase(row.property)}</td>
                      <td>{row.method}</td>
                      <td class="num">{row.limit}</td>
                      <td>{row.unit}</td>
                      <td>{sentenceCase(row.basis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="meta-line">
              {`${PRODUCT.virginReferenceLabel}: ${specification.virgin_reference.reference}, ${specification.virgin_reference.source}, ${specification.virgin_reference.date}.`}
            </p>
          </>
        ) : (
          <Empty sentence="No specification has been published for this grade yet." />
        )}
        <dl class="pair-list">
          {claims.map((claim) => (
            <div key={claim.reference}>
              <dt>{claim.claim}</dt>
              <dd>
                {claim.content_bp !== null ? (
                  <RecycledContent
                    content_bp={claim.content_bp}
                    claim_type={claim.claim_type}
                    scheme={claim.scheme}
                  />
                ) : (
                  <span class="figure__depends">
                    {`Claimed by mass balance under scheme ${claim.scheme}`}
                  </span>
                )}
                <p>{claim.evidence}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

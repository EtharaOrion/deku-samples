import type { JSX } from 'preact';
import { TECHNOLOGY } from '../../shared/copy';
import { PlantDiagram } from '../components/diagram';
import { Capacity } from '../components/figures';
import { Reveal } from '../components/reveal';
import { kilograms } from '../format';
import type { CapacityView, StageFlow } from '../routes';

interface TechnologyPageProps {
  stages: StageFlow[];
  capacity: CapacityView[];
  capacity_basis: string;
}

export function TechnologyPage({
  stages,
  capacity,
  capacity_basis,
}: TechnologyPageProps): JSX.Element {
  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Process</span>
        <Reveal>
          <h1 class="hero__title">{TECHNOLOGY.headline}</h1>
        </Reveal>
        <p class="lede">{TECHNOLOGY.intro}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Stages</span>
        <Reveal>
          <h2>{TECHNOLOGY.stagesHeading}</h2>
        </Reveal>
        <p>{TECHNOLOGY.stagesIntro}</p>
        <div class="stack-wide">
          {TECHNOLOGY.stages.map((stage, index) => (
            <article class="card stack" key={stage.label}>
              <span class="eyebrow">{`Stage ${index + 1}`}</span>
              <h3>{stage.label}</h3>
              <p>{stage.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section class="section">
        <span class="eyebrow">Capacity</span>
        <Reveal>
          <h2>{TECHNOLOGY.capacityHeading}</h2>
        </Reveal>
        <div class="scroller">
          <table>
            <caption>{`Capacity by line, stated in ${TECHNOLOGY.capacityUnit}`}</caption>
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col">Capacity</th>
                <th scope="col">Contracted</th>
              </tr>
            </thead>
            <tbody>
              {capacity.map((row) => (
                <tr key={row.site}>
                  <td>{row.line}</td>
                  <td>
                    <Capacity
                      nameplate_kg={row.nameplate_kg}
                      confidence={row.confidence}
                      statement={row.statement}
                    />
                  </td>
                  <td class="num">{kilograms(row.contracted_kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="meta-line">{TECHNOLOGY.capacityBasisLine(capacity_basis)}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Attributes</span>
        <Reveal>
          <h2>{TECHNOLOGY.attributesHeading}</h2>
        </Reveal>
        <dl class="pair-list">
          {TECHNOLOGY.attributes.map((attribute) => (
            <div key={attribute.heading}>
              <dt>{attribute.heading}</dt>
              <dd>
                {attribute.evidence ? (
                  <p>{attribute.evidence}</p>
                ) : (
                  <p class="quiet">Stated without further evidence on this page.</p>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section class="section">
        <span class="eyebrow">Mass balance</span>
        <Reveal>
          <h2>{TECHNOLOGY.diagramHeading}</h2>
        </Reveal>
        <p>{TECHNOLOGY.diagramIntro}</p>
        <PlantDiagram stages={stages} />
      </section>
    </>
  );
}

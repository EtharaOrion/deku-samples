/**
 * The plant is drawn, not photographed, and the drawing is generated from the
 * four run types and the masses recorded against them, so it stays correct when
 * a stage changes. The table beneath is the same information as words.
 */

import type { JSX } from 'preact';
import { STATEMENTS } from '../../shared/copy';
import { grams } from '../format';
import type { StageFlow } from '../routes';

const BOX_HEIGHT = 118;
const STRIDE = 158;
const TOP = 8;
const WIDTH = 360;

function lossOf(stage: StageFlow): number {
  return stage.in_g - stage.out_g - stage.byproduct_g;
}

export function PlantDiagram({ stages }: { stages: StageFlow[] }): JSX.Element {
  const height = TOP * 2 + stages.length * BOX_HEIGHT + Math.max(stages.length - 1, 0) * (STRIDE - BOX_HEIGHT);
  const totalIn = stages.length > 0 ? (stages[0]?.in_g ?? 0) : 0;
  const totalOut = stages.length > 0 ? (stages[stages.length - 1]?.out_g ?? 0) : 0;

  return (
    <figure class="plate">
      <div class="scroller">
        <svg
          class="diagram"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-labelledby="diagram-title diagram-desc"
        >
          <title id="diagram-title">Mass in and mass out at each of the four stages</title>
        <desc id="diagram-desc">
          {stages
            .map(
              (stage) =>
                `${stage.label}: ${grams(stage.in_g)} in, ${grams(stage.out_g)} out${
                  stage.byproduct_g > 0 ? `, ${grams(stage.byproduct_g)} byproduct` : ''
                }.`,
            )
            .join(' ')}
        </desc>
        {stages.map((stage, index) => {
          const y = TOP + index * STRIDE;
          return (
            <g key={stage.run_type}>
              <rect class="diagram__box" x="4" y={y} width={WIDTH - 8} height={BOX_HEIGHT} rx="6" />
              <text class="diagram__stage" x="20" y={y + 28}>
                {`${index + 1}. ${stage.label}`}
              </text>
              <text class="diagram__figure" x="20" y={y + 54}>
                {`In  ${grams(stage.in_g)}`}
              </text>
              <text class="diagram__figure" x="20" y={y + 76}>
                {`Out ${grams(stage.out_g)}`}
              </text>
              <text class="diagram__figure" x="20" y={y + 98}>
                {stage.byproduct_g > 0
                  ? `Loss ${grams(lossOf(stage))}, byproduct ${grams(stage.byproduct_g)}`
                  : `Loss ${grams(lossOf(stage))}`}
              </text>
              {index < stages.length - 1 ? (
                <g class="diagram__flow">
                  <path d={`M36 ${y + BOX_HEIGHT} L36 ${y + STRIDE}`} />
                  <path d={`M30 ${y + STRIDE - 8} L36 ${y + STRIDE} L42 ${y + STRIDE - 8}`} />
                </g>
              ) : null}
            </g>
          );
          })}
        </svg>
      </div>
      <figcaption>
        {`The four stages take ${grams(totalIn)} of accepted batch to ${grams(totalOut)} of lot. ${STATEMENTS.losses}`}
      </figcaption>
      <div class="scroller">
        <table>
          <caption>Mass recorded in and out of each stage</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" class="num">
                Mass in
              </th>
              <th scope="col" class="num">
                Mass out
              </th>
              <th scope="col" class="num">
                Byproduct
              </th>
              <th scope="col" class="num">
                Loss
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.run_type}>
                <td>{stage.label}</td>
                <td class="num">{grams(stage.in_g)}</td>
                <td class="num">{grams(stage.out_g)}</td>
                <td class="num">{grams(stage.byproduct_g)}</td>
                <td class="num">{grams(lossOf(stage))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

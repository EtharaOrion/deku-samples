/**
 * The run board. One column per process stage, one card per run, and the stage
 * is named in text on the card rather than implied by the column it sits in.
 */

import type { JSX } from 'preact';
import { RUN_STAGES } from '../../../shared/enums';
import { STATEMENTS } from '../../../shared/copy';
import { Empty, Loading } from '../../components/status';
import { LockMark } from '../../components/marks';
import { grams, words } from '../../format';
import { useFetch } from './hooks';
import { counted } from './states';
import type { RunView } from './views';

function RunCard({ run }: { run: RunView }): JSX.Element {
  return (
    <article class="card board-card">
      <span class="eyebrow">{`Stage: ${run.stage}`}</span>
      <h3 class="mono">{run.reference}</h3>
      <dl class="pair-tight">
        <div>
          <dt class="label">Stage</dt>
          <dd>{words(run.run_type)}</dd>
        </div>
        <div>
          <dt class="label">Recipe version</dt>
          <dd class="mono">{run.recipe_version}</dd>
        </div>
        <div>
          <dt class="label">State</dt>
          <dd>{run.state === 'closed' ? <LockMark label="closed" /> : <span>open</span>}</dd>
        </div>
        <div>
          <dt class="label">Losses</dt>
          <dd class="mono">
            {run.losses_g === null ? 'not computed until the run closes' : grams(run.losses_g)}
          </dd>
        </div>
        <div>
          <dt class="label">Site</dt>
          <dd class="mono">{run.site}</dd>
        </div>
        <div>
          <dt class="label">Tolerance</dt>
          <dd>{run.within_tolerance ? 'inside the released window' : 'outside the released window'}</dd>
        </div>
      </dl>
    </article>
  );
}

export function BoardScreen(): JSX.Element {
  const runs = useFetch<RunView[]>('/runs');

  return (
    <section class="section">
      <span class="eyebrow">Console</span>
      <h1 class="console-title">Run board</h1>
      <p>
        Each card is one run as the record holds it: the stage it ran, the recipe version it ran
        against, whether it is open or closed, and the mass it did not pass on. {STATEMENTS.losses}
      </p>

      {runs.loading ? <Loading what="the run board" /> : null}
      {runs.error ? <Empty sentence={`The run board could not be read: ${runs.error}.`} /> : null}

      {runs.data ? (
        <div class="grid grid--board">
          {RUN_STAGES.map((stage) => {
            const held = runs.data?.filter((run) => run.run_type === stage.run_type) ?? [];
            return (
              <section key={stage.run_type} class="board-column">
                <h2 class="console-subheading">{stage.label}</h2>
                <p class="label">{`${counted(held.length, 'run', 'runs')} recorded`}</p>
                {held.length === 0 ? (
                  <Empty sentence={`No ${words(stage.run_type)} run has been recorded.`} />
                ) : (
                  held.map((run) => <RunCard key={run.reference} run={run} />)
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

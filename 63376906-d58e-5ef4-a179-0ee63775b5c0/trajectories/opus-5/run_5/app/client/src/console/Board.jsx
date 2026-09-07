import { useApi, useMeta, Link, grams, words, dateOf } from '../lib.jsx';
import { Loading, Empty, Word, StateWords, IconWarning } from '../components/Bits.jsx';

const COLUMNS = [
  ['dissolution', 'Dissolution'],
  ['depolymerisation', 'Depolymerisation'],
  ['purification', 'Purification'],
  ['repolymerisation', 'Repolymerisation'],
];

export function Board() {
  useMeta('Board — Ravel console', 'One column per process stage and one card per run.');
  const runs = useApi('/runs');
  return (
    <>
      <h1 class="display-2">Board</h1>
      <p class="note" style="margin-top:0.5rem">
        One column per process stage and one card per run. The column a card sits in is named on the card, so its stage is
        never carried by position alone.
      </p>

      {runs.loading ? <Loading what="the run board" /> : null}
      {runs.error ? <Empty>The run board could not be loaded.</Empty> : null}

      {runs.data ? (
        <div class="board" style="margin-top:1.5rem">
          {COLUMNS.map(([type, label]) => {
            const mine = runs.data.filter((r) => r.run_type === type);
            return (
              <section key={type} class="board-column" aria-labelledby={`col-${type}`}>
                <h2 id={`col-${type}`}>
                  {label} <span class="muted">({mine.length})</span>
                </h2>
                {mine.length === 0 ? (
                  <p class="empty">No run sits in this stage.</p>
                ) : (
                  mine.map((r) => <RunCard key={r.reference} run={r} stage={label} />)
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function RunCard({ run, stage }) {
  const flagged = (run.flags || []).length > 0;
  return (
    <Link href={`/console/runs/${run.reference}`} class="run-card">
      <div class="node-head">
        <span class="mono">{run.reference}</span>
        <span class="t-label-small muted">{stage}</span>
      </div>
      <p class="t-body-small" style="margin:0.5rem 0 0">
        {run.site} · {run.equipment} · recipe <span class="mono">{run.recipe_version}</span>
      </p>
      <p class="figure" style="margin:0.375rem 0 0">
        in {grams(run.mass_in_g)} · out {grams(run.mass_out_g)}
        {run.losses_g !== null ? <> · lost {grams(run.losses_g)}</> : null}
      </p>
      <p style="margin:0.5rem 0 0;display:flex;gap:0.375rem;flex-wrap:wrap">
        <Word quiet={run.state === 'closed'}>{words(run.state)}</Word>
        {run.within_tolerance === false ? <Word firm icon={<IconWarning title="Outside tolerance" />}>Outside tolerance</Word> : null}
        {flagged
          ? [...new Set(run.flags.map((f) => f.flag))].map((f) => (
              <Word key={f} firm icon={<IconWarning title={words(f)} />}>
                {words(f)}
              </Word>
            ))
          : null}
      </p>
      {flagged ? (
        <p class="note" style="margin:0.375rem 0 0">
          {run.flags
            .filter((f) => f.missing_link)
            .map((f) => `This batch cannot be claimed: ${f.missing_link}.`)
            .join(' ')}
        </p>
      ) : null}
      <p class="note" style="margin:0.375rem 0 0">Started {dateOf(run.started_at)}</p>
    </Link>
  );
}

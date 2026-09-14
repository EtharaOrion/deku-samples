import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtDateTime } from '../format.js';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export function ConsoleBoard({ me }) {
  const [runs, setRuns] = useState(undefined);
  const [periods, setPeriods] = useState(undefined);
  useEffect(() => {
    api('/api/runs').then((r) => setRuns(r.ok ? r.data : []));
    api('/api/balance-periods').then((r) => setPeriods(r.ok ? r.data : []));
  }, []);
  if (runs === undefined || periods === undefined) return <Loading>Loading the board…</Loading>;

  const openPeriod = periods.find((p) => p.state === 'open');
  return (
    <div>
      <h1>Production board</h1>
      <p class="lede" style="margin-bottom:2rem">
        One column per process stage, one card per run. This system records what a run did, after the run:
        it reads no sensor and drives no equipment.
      </p>
      {openPeriod ? (
        <Banner>
          The bookkeeping period <Ref>{openPeriod.id}</Ref> is <strong>open</strong>.
          Credits available: post-consumer <Ref>{fmtG(openPeriod.credits.post_consumer.credits_available_g)}</Ref>,
          pre-consumer <Ref>{fmtG(openPeriod.credits.pre_consumer.credits_available_g)}</Ref>.
          <Link href={`/console/balance/${openPeriod.id}`}> Open the ledger</Link>.
        </Banner>
      ) : null}
      <div class="board">
        {STAGES.map((stage) => {
          const cards = runs.filter((r) => r.run_type === stage);
          return (
            <section class="column" aria-label={stage}>
              <h3>{stage}</h3>
              {cards.length === 0
                ? <Empty>No runs recorded at this stage yet.</Empty>
                : cards.map((r) => <RunCard run={r} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function RunCard({ run }) {
  return (
    <article class="card">
      <span class="stage-name">Stage: {run.run_type}</span>
      <Link href={`/console/runs/${run.reference}`}><Ref>{run.reference}</Ref></Link>
      <dl class="kv" style="margin-top:0.5rem">
        <dt>Site</dt><dd><Ref>{run.site}</Ref></dd>
        <dt>State</dt><dd><WordState state={run.state} /></dd>
        <dt>Mass in</dt><dd class="figure">{fmtG(run.mass_in_g)}</dd>
        <dt>Mass out</dt><dd class="figure">{fmtG(run.mass_out_g)}</dd>
        <dt>Losses</dt><dd class="figure">{fmtG(run.losses_g)}</dd>
        <dt>Started</dt><dd class="small">{fmtDateTime(run.started_at)}</dd>
      </dl>
      {run.within_tolerance === false
        ? <Banner kind="refused" title="Outside tolerance">This run closed outside its recipe tolerance.</Banner>
        : null}
    </article>
  );
}

export function RunDetail({ reference }) {
  const [run, setRun] = useState(undefined);
  useEffect(() => { api(`/api/runs/${reference}`).then((r) => setRun(r.ok ? r.data : null)); }, [reference]);
  if (run === undefined) return <Loading />;
  if (run === null) return <Empty>There is no run with that reference.</Empty>;
  return (
    <div>
      <h1><Ref>{run.reference}</Ref></h1>
      <Banner>
        Losses reduce the claim. Mass that disappears in processing does not carry its claim forward.
      </Banner>
      <div class="sheet">
        <h2>The run</h2>
        <dl class="kv">
          <dt>Stage</dt><dd>{run.run_type}</dd>
          <dt>Site</dt><dd><Ref>{run.site}</Ref></dd>
          <dt>Recipe version</dt><dd><Ref>{run.recipe_version}</Ref></dd>
          <dt>Operator</dt><dd>{run.operator}</dd>
          <dt>Started</dt><dd>{fmtDateTime(run.started_at)}</dd>
          <dt>Closed</dt><dd>{run.closed_at ? fmtDateTime(run.closed_at) : '—'}</dd>
          <dt>State</dt><dd><WordState state={run.state} /></dd>
        </dl>
      </div>
      {run.recipe ? (
        <div class="sheet">
          <h2>Recipe and tolerance</h2>
          <dl class="kv">
            <dt>Set points</dt><dd><Ref>{JSON.stringify(run.recipe.set_points)}</Ref></dd>
            <dt>Tolerances</dt><dd><Ref>{JSON.stringify(run.recipe.tolerances)}</Ref></dd>
            <dt>Residence</dt><dd>{run.recipe.residence_time_min} min</dd>
            <dt>Released by</dt><dd>{run.recipe.released_by} on {run.recipe.released_on}</dd>
            <dt>Achieved</dt><dd><Ref>{JSON.stringify(run.actual_parameters)}</Ref></dd>
            <dt>Within tolerance</dt>
            <dd>{run.within_tolerance === null ? '—' : (run.within_tolerance ? 'Within tolerance' : 'Outside tolerance')}</dd>
          </dl>
        </div>
      ) : null}
      <div class="sheet">
        <h2>Consumptions</h2>
        {run.consumptions.length === 0 ? <Empty>No inputs recorded.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Input</th><th>Kind</th><th class="figure">Mass</th><th>Effective on</th></tr></thead>
              <tbody>
                {run.consumptions.map((c) => (
                  <tr>
                    <td><Ref>{c.input_ref}</Ref></td>
                    <td>{c.input_kind}</td>
                    <td class="figure">{fmtG(c.mass_g)}</td>
                    <td>{c.effective_on}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div class="sheet">
        <h2>Outputs</h2>
        {run.outputs.length === 0 ? <Empty>No outputs recorded.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Output</th><th>Kind</th><th class="figure">Mass</th><th>Disposition</th></tr></thead>
              <tbody>
                {run.outputs.map((o) => (
                  <tr>
                    <td>{o.kind === 'lot' ? <Link href={`/console/lots/${o.reference}`}><Ref>{o.reference}</Ref></Link> : <Ref>{o.reference}</Ref>}</td>
                    <td>{o.kind}</td>
                    <td class="figure">{fmtG(o.mass_g)}</td>
                    <td>{o.disposition || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

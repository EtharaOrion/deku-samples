import { useResource, ReadAt } from './shared.jsx';
import { Link, useMeta } from '../lib/router.jsx';
import { Loading, Empty, Word, Reveal, Mark } from '../components/common.jsx';
import { grams, words, dateTime, date } from '../lib/format.js';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

// One column per process stage and one card per run. The column a card sits in
// is named in text on the card rather than implied by position alone.
export function Board() {
  useMeta('Ravel — Console', 'The run board, one column per process stage.', { noindex: true });
  const runs = useResource('/runs');

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <header class="spread">
        <div>
          <p class="eyebrow">Operational console</p>
          <Reveal as="h1" class="t-h3">Run board</Reveal>
        </div>
      </header>
      <p class="note" style="max-width:44rem">
        This board records what a run did, after the run. It reads no sensor, holds no set point
        and raises no alarm.
      </p>

      {runs.loading && <Loading what="the run board" />}
      {runs.error && <p class="note">The run board could not be read.</p>}

      {runs.data && (
        <div class="board">
          {STAGES.map((stage) => {
            const rows = runs.data.filter((r) => r.run_type === stage);
            return (
              <section key={stage} aria-labelledby={`col-${stage}`}>
                <h2 id={`col-${stage}`} class="label" style="font-size:.875rem;line-height:1.125rem;margin-bottom:.75rem">
                  {words(stage)} — {rows.length} run{rows.length === 1 ? '' : 's'}
                </h2>
                {rows.length === 0 && <Empty>No run is recorded at this stage.</Empty>}
                {rows.map((r) => (
                  <article key={r.reference} class="card">
                    <p class="mono" style="margin:0 0 .35rem"><strong>{r.reference}</strong></p>
                    {/* The stage is named in text on the card. */}
                    <p class="label" style="margin:0 0 .5rem">Stage: {words(r.run_type)}</p>
                    <p class="note figure" style="margin:0 0 .5rem">
                      In {grams(r.mass_in_g)} · out {grams(r.mass_out_g)}
                      {r.losses_g !== null && <> · losses {grams(r.losses_g)}</>}
                    </p>
                    <p style="margin:0 0 .5rem">
                      <Word quiet={r.state !== 'open'}>{words(r.state)}</Word>{' '}
                      {r.within_tolerance === false && <Word>outside tolerance</Word>}
                    </p>
                    {r.flags?.length > 0 && (
                      <p style="margin:0 0 .5rem">
                        {r.flags.map((f) => (
                          <span key={f} style="margin-right:.5rem">
                            <Word><Mark kind={f.includes('calibration') ? 'warning' : 'flag'} label={words(f)} /></Word>
                          </span>
                        ))}
                      </p>
                    )}
                    <p class="note" style="margin:0">
                      Recipe <span class="mono">{r.recipe_version}</span> ·{' '}
                      {r.site} · started <span class="mono">{date(r.started_at)}</span>
                    </p>
                    <p style="margin:.5rem 0 0">
                      <Link href={`/console/runs/${r.reference}`}>Open the run record</Link>
                    </p>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RunDetail({ reference }) {
  useMeta(`Ravel — ${reference}`, 'A run record.', { noindex: true });
  const run = useResource(`/runs/${reference}`);
  const r = run.data;
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Run</p>
      <h1 class="t-h3 mono">{reference}</h1>
      {run.loading && <Loading what="this run" />}
      {r && (
        <>
          <div class="sheet">
            <dl style="margin:0">
              <Field label="Stage" value={words(r.run_type)} />
              <Field label="Site" value={r.site} mono />
              <Field label="Equipment" value={r.equipment} mono />
              <Field label="Recipe version followed" value={r.recipe_version} mono />
              <Field label="State" value={<Word quiet={r.state !== 'open'}>{words(r.state)}</Word>} />
              <Field label="Started" value={dateTime(r.started_at)} mono />
              <Field label="Closed" value={r.closed_at ? dateTime(r.closed_at) : 'not closed'} mono />
              <Field label="Mass in" value={grams(r.mass_in_g)} mono />
              <Field label="Mass out" value={grams(r.mass_out_g)} mono />
              <Field label="Losses" value={grams(r.losses_g)} mono />
              <Field label="Within tolerance"
                value={<Word>{r.within_tolerance === null ? 'not decided' : (r.within_tolerance ? 'inside tolerance' : 'outside tolerance')}</Word>} />
            </dl>
            <p class="note" style="margin:1rem 0 0">Losses reduce the claim.</p>
          </div>

          <section>
            <h2 class="t-h4">Set points achieved</h2>
            <div class="scroll-x">
              <table>
                <thead><tr><th>Parameter</th><th class="num">Recipe</th><th class="num">Actual</th><th>Tolerance</th></tr></thead>
                <tbody>
                  {Object.keys(r.recipe?.set_points || {}).map((k) => (
                    <tr key={k}>
                      <td>{words(k)}</td>
                      <td class="num mono">{r.recipe.set_points[k]}</td>
                      <td class="num mono">{r.actual_set_points?.[k] ?? '—'}</td>
                      <td class="mono">
                        {r.recipe.tolerances?.[k] ? `${r.recipe.tolerances[k].min} to ${r.recipe.tolerances[k].max}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 class="t-h4">Consumptions</h2>
            {r.consumptions.length === 0 && <Empty>This run has consumed nothing.</Empty>}
            {r.consumptions.length > 0 && (
              <div class="scroll-x">
                <table>
                  <thead>
                    <tr><th>Reference</th><th>Input</th><th class="num">Mass</th>
                      <th class="num">Dry mass</th><th class="num">Credit granted</th><th>Category</th></tr>
                  </thead>
                  <tbody>
                    {r.consumptions.map((x) => (
                      <tr key={x.reference}>
                        <td class="mono">{x.reference}</td>
                        <td class="mono">{x.input_ref}</td>
                        <td class="num mono">{grams(x.mass_g)}</td>
                        <td class="num mono">{grams(x.dry_mass_consumed_g)}</td>
                        <td class="num mono">{grams(x.credit_granted_g)}</td>
                        <td>{x.category ? <Word quiet={x.category !== 'non_claimable'}>{words(x.category)}</Word> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 class="t-h4">Outputs</h2>
            {r.outputs.length === 0 && <Empty>This run has produced nothing.</Empty>}
            {r.outputs.length > 0 && (
              <div class="scroll-x">
                <table>
                  <thead><tr><th>Reference</th><th>Kind</th><th class="num">Mass</th><th>Disposition</th></tr></thead>
                  <tbody>
                    {r.outputs.map((o) => (
                      <tr key={o.reference}>
                        <td class="mono">{o.reference}</td>
                        <td>{words(o.kind)}</td>
                        <td class="num mono">{grams(o.mass_g)}</td>
                        <td>{o.disposition ? words(o.disposition) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function Field({ label, value, mono = false }) {
  return (
    <div class="figure-row">
      <dt class="label" style="margin:0">{label}</dt>
      <dd class={mono ? 'mono' : ''} style="margin:0;grid-column:span 2">{value}</dd>
    </div>
  );
}

import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words } from '../ui.jsx';

export default function RunView({ session, params }) {
  const reference = params.reference;
  const run = useAsync(() => api(`/runs/${reference}`), [reference]);
  const r = run.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Run</p>
        <h1 class="t-h3 mono">{reference}</h1>
        {r ? (
          <p class="row" style="align-items:center">
            <StateWord word={words(r.run_type)} quiet />
            <StateWord
              word={r.state === 'closed' ? 'Closed' : 'Open'}
              heavy={r.state === 'closed'}
              icon={r.state === 'closed' ? <Icon name="lock" label="Closed" /> : null}
            />
            {r.within_tolerance === false ? (
              <StateWord word="Outside tolerance" heavy icon={<Icon name="warning" label="Warning" />} />
            ) : (
              <StateWord word="Within tolerance" />
            )}
            {(r.flags || []).map((f) => (
              <StateWord key={f} word={f} heavy icon={<Icon name="flag" label="Flag" />} />
            ))}
          </p>
        ) : null}
      </div>

      {run.loading ? <Loading what="the run" /> : null}
      {run.error ? <Empty>This run could not be read.</Empty> : null}

      {r ? (
        <>
          {r.state === 'closed' ? (
            <p class="banner">
              <strong>This run is closed.</strong> A closed run refuses every write, and a second
              close is refused and recorded as an attempt.
            </p>
          ) : null}

          <dl class="def">
            <dt>Run type</dt><dd>{words(r.run_type)}</dd>
            <dt>Site</dt><dd class="mono"><a href={`/console/sites/${r.site}`}>{r.site}</a></dd>
            <dt>Equipment</dt><dd class="mono">{r.equipment}</dd>
            <dt>Recipe version</dt><dd class="mono">{r.recipe_version}</dd>
            <dt>Operator</dt><dd>{r.operator}</dd>
            <dt>Started</dt><dd class="mono">{r.started_at}</dd>
            <dt>Closed</dt><dd class="mono">{r.closed_at || 'not closed'}</dd>
            <dt>Mass in</dt><dd class="mono">{grams(r.mass_in_g)}</dd>
            <dt>Mass out</dt><dd class="mono">{grams(r.mass_out_g)}</dd>
            <dt>Losses</dt>
            <dd class="mono">
              {r.losses_g == null ? 'not computed until close' : grams(r.losses_g)}
              <span class="t-small" style="display:block;color:var(--muted)">{r.derivation.losses_g}</span>
            </dd>
            <dt>Event at</dt><dd class="mono">{r.event_at}</dd>
            <dt>Recorded at</dt><dd class="mono">{r.recorded_at}</dd>
            <dt>Effective on</dt><dd class="mono">{r.effective_on}</dd>
          </dl>

          <section aria-labelledby="tol" style="margin-top:2.5rem">
            <h2 id="tol" class="t-h4">The recipe version followed, and the set points achieved</h2>
            <p class="t-small" style="color:var(--muted)">
              A run outside its recipe tolerance raises a deviation whether or not its output
              passed its tests.
            </p>
            <div class="table-scroll">
              <table>
                <caption>Recipe {r.recipe_version}, released by {r.recipe?.released_by} on {r.recipe?.released_on}.</caption>
                <thead>
                  <tr>
                    <th scope="col">Parameter</th>
                    <th scope="col" class="num">Set point</th>
                    <th scope="col" class="num">Achieved</th>
                    <th scope="col" class="num">Tolerance</th>
                    <th scope="col">Within</th>
                  </tr>
                </thead>
                <tbody>
                  {r.tolerance_detail.map((t) => (
                    <tr key={t.parameter}>
                      <th scope="row">{words(t.parameter)}</th>
                      <td class="num">{t.set_point ?? '—'}</td>
                      <td class="num">{t.actual ?? '—'}</td>
                      <td class="num">{t.tolerance_low} – {t.tolerance_high}</td>
                      <td>
                        {t.within === null
                          ? <span class="t-small">not recorded</span>
                          : <StateWord word={t.within ? 'Within' : 'Outside'} heavy={!t.within} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.recipe ? (
              <p class="t-small" style="margin-top:1rem">
                Reagents: {(r.recipe.reagents || []).map((x) => `${x.reagent} at ${x.ratio_bp} bp`).join('; ')}.
                Residence: {r.recipe.residence_min} minutes.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="cn" style="margin-top:2.5rem">
            <h2 id="cn" class="t-h4">Consumptions</h2>
            {r.consumptions.length === 0 ? <Empty>Nothing was consumed on this run.</Empty> : (
              <div class="table-scroll">
                <table>
                  <caption>Each is a row of its own carrying a mass.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Consumption</th>
                      <th scope="col">Input</th>
                      <th scope="col">Kind</th>
                      <th scope="col" class="num">Mass</th>
                      <th scope="col">Effective on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.consumptions.map((c) => (
                      <tr key={c.reference}>
                        <th scope="row" class="mono">{c.reference}</th>
                        <td class="mono">{c.input}</td>
                        <td>{words(c.input_kind)}</td>
                        <td class="num">{c.mass_g.toLocaleString('en-GB')}</td>
                        <td class="mono">{c.effective_on}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="ot" style="margin-top:2.5rem">
            <h2 id="ot" class="t-h4">Outputs</h2>
            {r.outputs.length === 0 ? <Empty>Nothing was produced on this run.</Empty> : (
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Output</th>
                      <th scope="col">Kind</th>
                      <th scope="col" class="num">Mass</th>
                      <th scope="col">Disposition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.outputs.map((o) => (
                      <tr key={o.reference}>
                        <th scope="row" class="mono">
                          {o.kind === 'lot'
                            ? <a href={`/console/lots/${o.reference}`}>{o.reference}</a>
                            : o.reference}
                        </th>
                        <td>{words(o.kind)}</td>
                        <td class="num">{o.mass_g.toLocaleString('en-GB')}</td>
                        <td>{o.disposition ? words(o.disposition) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {r.deviations.length ? (
            <section aria-labelledby="dv" style="margin-top:2.5rem">
              <h2 id="dv" class="t-h4">Deviations</h2>
              <ul>
                {r.deviations.map((d) => (
                  <li key={d.reference}>
                    <a href={`/console/deviations/${d.reference}`} class="mono">{d.reference}</a> —{' '}
                    {d.title} — <StateWord word={words(d.state)} heavy={d.state === 'open'} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

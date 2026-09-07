import { useApi, useMeta, Link, grams, words, dateOf } from '../lib.jsx';
import { Loading, Empty, Word, IconWarning } from '../components/Bits.jsx';

export function RunView({ reference }) {
  useMeta(`${reference} — Run`, `The run record for ${reference}.`);
  const run = useApi(`/runs/${reference}`);
  if (run.loading) return <Loading what="the run record" />;
  if (run.error) return <Empty>This run could not be loaded. {run.error.message}</Empty>;
  const r = run.data;

  return (
    <>
      <p class="t-eyebrow">Run · {words(r.run_type)}</p>
      <h1 class="display-2" style="margin-top:0.375rem">
        <span class="mono">{r.reference}</span>
      </h1>
      <p style="margin-top:0.5rem;display:flex;gap:0.375rem;flex-wrap:wrap">
        <Word quiet={r.state === 'closed'}>{words(r.state)}</Word>
        {r.within_tolerance === false ? (
          <Word firm icon={<IconWarning title="Outside tolerance" />}>Outside tolerance</Word>
        ) : (
          <Word quiet>Within tolerance</Word>
        )}
      </p>
      <p class="t-body-small" style="margin-top:0.5rem">
        {r.site} · {r.equipment} · operator {r.operator} · started {dateOf(r.started_at)}
        {r.closed_at ? ` · closed ${dateOf(r.closed_at)}` : ''}
      </p>

      <section class="card" style="margin-top:1.5rem">
        <h2>Mass</h2>
        <dl style="margin-top:0.75rem">
          <Row label="Mass in" value={grams(r.mass_in_g)} />
          <Row label="Mass out" value={grams(r.mass_out_g)} />
          <Row label="Losses" value={r.losses_g === null ? 'not yet computed; the run is open' : grams(r.losses_g)} />
        </dl>
        <p class="note" style="margin-top:0.5rem">{r.derivation?.losses_g}</p>
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Recipe {r.recipe_version}</h2>
        {r.recipe ? (
          <>
            <p class="note" style="margin-top:0.5rem">
              Version {r.recipe.version}, released by {r.recipe.released_by} on {dateOf(r.recipe.released_on)}. Residence{' '}
              {r.recipe.residence_minutes} minutes.
            </p>
            <div class="scroller" style="margin-top:0.75rem">
              <table>
                <caption class="visually-hidden">Set points, tolerances and what was actually achieved</caption>
                <thead>
                  <tr>
                    <th scope="col">Parameter</th>
                    <th scope="col" class="num">Set point</th>
                    <th scope="col">Tolerance</th>
                    <th scope="col" class="num">Achieved</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(r.recipe.set_points || {}).map((k) => {
                    const tol = (r.recipe.tolerances || {})[k];
                    const actual = (r.actual_set_points || {})[k];
                    const out = tol && actual != null && (actual < tol[0] || actual > tol[1]);
                    return (
                      <tr key={k}>
                        <td>{words(k)}</td>
                        <td class="num">{r.recipe.set_points[k]}</td>
                        <td class="mono">{tol ? `${tol[0]} to ${tol[1]}` : '—'}</td>
                        <td class="num">
                          {actual == null ? '—' : actual}
                          {out ? <span class="note"> outside</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(r.recipe.reagents || []).length ? (
              <p class="note" style="margin-top:0.75rem">
                Reagents: {r.recipe.reagents.map((x) => `${x.name} at ${x.ratio_bp} bp`).join(', ')}.
              </p>
            ) : null}
          </>
        ) : (
          <p class="note">The recipe version could not be resolved.</p>
        )}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Consumptions</h2>
        {r.consumptions.length ? (
          <div class="scroller" style="margin-top:0.75rem">
            <table>
              <caption class="visually-hidden">One input and the mass consumed from it</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Input</th>
                  <th scope="col">Kind</th>
                  <th scope="col" class="num">Mass</th>
                  <th scope="col">Effective</th>
                </tr>
              </thead>
              <tbody>
                {r.consumptions.map((c) => (
                  <tr key={c.reference}>
                    <td class="mono">{c.reference}</td>
                    <td class="mono">{c.input}</td>
                    <td>{words(c.input_kind)}</td>
                    <td class="num">{c.mass_g.toLocaleString('en-GB')}</td>
                    <td class="mono">{dateOf(c.effective_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="empty">No consumption has been recorded against this run.</p>
        )}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Outputs</h2>
        {r.outputs.length ? (
          <div class="scroller" style="margin-top:0.75rem">
            <table>
              <caption class="visually-hidden">One output with its mass and its kind</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Kind</th>
                  <th scope="col" class="num">Mass</th>
                  <th scope="col">Disposition</th>
                </tr>
              </thead>
              <tbody>
                {r.outputs.map((o) => (
                  <tr key={o.reference}>
                    <td>
                      {o.kind === 'lot' ? (
                        <Link href={`/console/lots/${o.reference}`} class="mono">{o.reference}</Link>
                      ) : (
                        <span class="mono">{o.reference}</span>
                      )}
                    </td>
                    <td>{words(o.kind)}</td>
                    <td class="num">{o.mass_g.toLocaleString('en-GB')}</td>
                    <td>{o.disposition ? words(o.disposition) : <span class="note">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="empty">No output has been recorded against this run.</p>
        )}
      </section>

      {(r.deviations || []).length ? (
        <section class="card" style="margin-top:1.25rem">
          <h2>Deviations</h2>
          <ul style="margin-top:0.5rem">
            {r.deviations.map((d) => (
              <li key={d.reference}>
                <span class="mono">{d.reference}</span> — {words(d.state)}
                {d.outcome ? `, ${words(d.outcome)}` : ''} — {d.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style="display:flex;gap:1rem;padding:0.5rem 0;border-bottom:1px solid var(--rule)">
      <dt class="t-label-small muted" style="min-width:9rem">{label}</dt>
      <dd class="figure" style="margin:0">{value}</dd>
    </div>
  );
}

import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

const STAGES = [
  ['dissolution', 'Dissolution'],
  ['depolymerisation', 'Depolymerisation'],
  ['purification', 'Purification'],
  ['repolymerisation', 'Repolymerisation'],
];

export default function Board() {
  const runs = useAsync(() => api.get('/runs'), []);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">The board</h1>
      <p style={{ marginTop: '0.75rem' }}>
        One column per process stage and one card per run. This is the operational record after the
        fact: it reads no sensor, holds no set point and drives no equipment.
      </p>

      {runs.loading ? <Loading what="the run board" /> : null}
      {runs.error ? <Empty>The run board could not be read.</Empty> : null}

      {runs.data ? (
        <div className="board" style={{ marginTop: '2rem' }}>
          {STAGES.map(([stage, label]) => {
            const inStage = runs.data.filter((r) => r.run_type === stage);
            return (
              <section className="board-column" key={stage} aria-label={label}>
                <h2 className="t-h4 board-column-head">{label}</h2>
                {inStage.length === 0 ? (
                  <p className="empty t-small">No runs are recorded at this stage.</p>
                ) : null}
                {inStage.map((r) => (
                  <article className="card" key={r.reference}>
                    {/* the column a card sits in is named in text on the card */}
                    <p className="label">{label}</p>
                    <h3 style={{ fontSize: 'var(--step-body-regular-size)', lineHeight: 'var(--step-body-regular-lh)' }}>
                      <Link href={`/console/runs/${r.reference}`} className="ref">{r.reference}</Link>
                    </h3>
                    <dl className="dl" style={{ marginTop: '0.65rem' }}>
                      <dt>State</dt>
                      <dd><StateWord quiet={r.state === 'closed'} icon={r.state === 'closed' ? 'lock' : null}>{r.state}</StateWord></dd>
                      <dt>Site</dt><dd className="mono">{r.site}</dd>
                      <dt>Recipe</dt><dd className="mono">{r.recipe_version}</dd>
                      <dt>Mass in</dt><dd className="mono">{formatInt(r.mass_in_g)} g</dd>
                      <dt>Mass out</dt><dd className="mono">{formatInt(r.mass_out_g)} g</dd>
                      <dt>Losses</dt><dd className="mono">{r.losses_g === null ? 'computed at close' : `${formatInt(r.losses_g)} g`}</dd>
                    </dl>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      {r.within_tolerance === false ? (
                        <StateWord icon="warning">Outside recipe tolerance</StateWord>
                      ) : null}
                      {r.open_deviation ? <StateWord icon="warning">Open deviation</StateWord> : null}
                      {(r.flags || []).includes('lapsed_calibration') ? (
                        <StateWord icon="warning">Lapsed calibration</StateWord>
                      ) : null}
                      {(r.flags || []).includes('non_claimable') ? (
                        <StateWord icon="flag">Non-claimable input</StateWord>
                      ) : null}
                      {(r.custody_missing || []).length ? (
                        <StateWord icon="flag">Custody link missing</StateWord>
                      ) : null}
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : null}

      <section className="section" style={{ marginTop: '2rem' }}>
        <h2 className="t-h4">Where to go next</h2>
        <div className="grid grid-3" style={{ marginTop: '1rem' }}>
          <Link href="/console/intake" className="card" style={{ textDecoration: 'none' }}>
            <span className="label">Intake</span>
            <p className="t-small" style={{ marginBottom: 0 }}>Feedstock arrival, custody, claimability and rejections.</p>
          </Link>
          <Link href="/console/balance" className="card" style={{ textDecoration: 'none' }}>
            <span className="label">Balance</span>
            <p className="t-small" style={{ marginBottom: 0 }}>Credits in, out and available, per site, grade and period.</p>
          </Link>
          <Link href="/console/record" className="card" style={{ textDecoration: 'none' }}>
            <span className="label">Record</span>
            <p className="t-small" style={{ marginBottom: 0 }}>Every act, its digest chain and the nine questions it answers.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

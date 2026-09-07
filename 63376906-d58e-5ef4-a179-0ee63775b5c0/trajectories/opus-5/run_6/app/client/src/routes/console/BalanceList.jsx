import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

export default function BalanceList() {
  const periods = useAsync(() => api.get('/balance-periods'), []);
  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">Balance periods</h1>
      <p style={{ marginTop: '0.75rem' }}>
        The ledger, per site, per grade and per period. Every figure is derived and links to the
        records it came from.
      </p>

      {periods.loading ? <Loading what="the balance periods" /> : null}
      {periods.error ? <Empty>The balance periods could not be read.</Empty> : null}
      {periods.data && periods.data.length === 0 ? <Empty>No balance periods exist.</Empty> : null}

      {periods.data && periods.data.length ? (
        <div className="stack" style={{ marginTop: '2rem' }}>
          {periods.data.map((p) => (
            <article className="card" key={p.id}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/console/balance/${p.id}`} className="ref t-body">{p.id}</Link>
                <StateWord quiet={p.state === 'open'} icon={p.state === 'closed' ? 'lock' : null}>{p.state}</StateWord>
              </div>
              <dl className="dl" style={{ marginTop: '0.75rem' }}>
                <dt>Site</dt><dd className="mono">{p.site}</dd>
                <dt>Grade</dt><dd className="mono">{p.grade}</dd>
                <dt>Period</dt><dd className="mono">{p.period.from} to {p.period.to}</dd>
                <dt>Post-consumer available</dt>
                <dd className="mono">{formatInt(p.categories.post_consumer.credits_available_g)} g</dd>
                <dt>Pre-consumer available</dt>
                <dd className="mono">{formatInt(p.categories.pre_consumer.credits_available_g)} g</dd>
                <dt>Non-claimable input</dt><dd className="mono">{formatInt(p.non_claimable_input_g)} g</dd>
                <dt>Overrides</dt><dd className="mono">{p.override_count}</dd>
                <dt>Open restatements</dt><dd className="mono">{p.open_restatement_count}</dd>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

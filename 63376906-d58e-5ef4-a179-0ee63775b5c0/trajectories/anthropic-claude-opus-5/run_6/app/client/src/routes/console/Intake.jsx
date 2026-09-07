import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

export default function Intake() {
  const batches = useAsync(() => api.get('/batches'), []);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">Intake</h1>
      <p style={{ marginTop: '0.75rem' }}>
        Feedstock arrival. Every figure is computed on dry mass, and claimability resolves against the
        collector approval in force on the receipt date rather than against a current flag.
      </p>

      {batches.loading ? <Loading what="the batch register" /> : null}
      {batches.error ? <Empty>The batch register could not be read.</Empty> : null}
      {batches.data && batches.data.length === 0 ? (
        <Empty>No batches have been booked in.</Empty>
      ) : null}

      {batches.data && batches.data.length ? (
        <div className="table-scroll" style={{ marginTop: '2rem' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Collector</th>
                <th scope="col">Category</th>
                <th scope="col">Received</th>
                <th scope="col" className="num">Net</th>
                <th scope="col" className="num">Moisture</th>
                <th scope="col" className="num">Dry mass</th>
                <th scope="col">Claim</th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.reference}>
                  <td>
                    <Link href={`/console/batches/${b.reference}`} className="ref">{b.reference}</Link>
                  </td>
                  <td>
                    {/* the name the collector held on the batch's own receipt date */}
                    {b.collector_name}
                    <br />
                    <span className="mono" style={{ color: 'var(--muted)' }}>{b.collector}</span>
                  </td>
                  <td>{b.category.replace(/_/g, '-')}</td>
                  <td className="mono">{b.received_on}</td>
                  <td className="num">{formatInt(b.net_g)} g</td>
                  <td className="num">{b.moisture_bp} bp</td>
                  <td className="num">{formatInt(b.dry_mass_g)} g</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {b.claimable ? (
                        <StateWord quiet>Claimable</StateWord>
                      ) : (
                        <StateWord icon="flag">Non-claimable</StateWord>
                      )}
                      {b.flags.includes('lapsed_calibration') ? (
                        <StateWord icon="warning">Lapsed calibration</StateWord>
                      ) : null}
                    </div>
                    {!b.claimable ? (
                      <p className="t-small" style={{ margin: '0.4rem 0 0' }}>
                        {b.claimable_reason === 'custody_link_missing'
                          ? `This batch cannot be claimed: ${b.claimable_missing_kind}.`
                          : `This collector's approval lapsed on ${b.approval_valid_to}. Material received after that date is processed but not claimed.`}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {batches.data ? (
        <section className="section" style={{ marginTop: '2rem' }}>
          <h2 className="t-h4">What the intake figures mean</h2>
          <dl className="dl" style={{ marginTop: '1rem' }}>
            <dt>Dry mass</dt>
            <dd>net_g × (10000 − moisture_bp) ÷ 10000, floored. Every figure downstream is computed on it.</dd>
            <dt>Claimable</dt>
            <dd>Resolved against the approval period in force on the receipt date, and against a complete custody chain of six links.</dd>
            <dt>Lapsed calibration</dt>
            <dd>The weighing device was calibrated more than twelve months before the receipt date. The flag is repeated on every lot the batch reaches.</dd>
            <dt>Category</dt>
            <dd>Required at intake, with no default, and never changed after acceptance by anybody through any route.</dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

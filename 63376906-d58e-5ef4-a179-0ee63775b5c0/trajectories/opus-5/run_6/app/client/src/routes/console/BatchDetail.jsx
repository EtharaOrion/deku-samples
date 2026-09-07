import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

export default function BatchDetail({ reference }) {
  const batch = useAsync(() => api.get(`/batches/${reference}`), [reference]);
  const impact = useAsync(() => api.get(`/batches/${reference}/impact`), [reference]);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Batch</p>
      <h1 className="t-h3 mono">{reference}</h1>

      {batch.loading ? <Loading what="this batch" /> : null}
      {batch.error ? <Empty>This batch could not be read.</Empty> : null}

      {batch.data ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {batch.data.claimable
              ? <StateWord quiet>Claimable</StateWord>
              : <StateWord icon="flag">Non-claimable</StateWord>}
            {batch.data.flags.includes('lapsed_calibration') ? <StateWord icon="warning">Lapsed calibration</StateWord> : null}
            {!batch.data.custody_complete ? <StateWord icon="flag">Custody link missing</StateWord> : null}
          </div>

          {!batch.data.claimable ? (
            <p className="banner statement" role="note">
              {batch.data.claimable_reason === 'custody_link_missing'
                ? `This batch cannot be claimed: ${batch.data.claimable_missing_kind}.`
                : `This collector's approval lapsed on ${batch.data.approval_valid_to}. Material received after that date is processed but not claimed.`}
            </p>
          ) : null}

          {batch.data.claimable_from ? (
            <p className="banner banner-quiet" role="note">
              Late evidence arrived on <span className="mono">{batch.data.claimable_from}</span>. This
              batch is claimable forward from that date rather than from its receipt date.
            </p>
          ) : null}

          <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h2 className="t-h4">Receipt</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Collector</dt>
                <dd>
                  {batch.data.collector_name}{' '}
                  <span className="mono" style={{ color: 'var(--muted)' }}>({batch.data.collector})</span>
                  <div className="t-small" style={{ color: 'var(--muted)' }}>
                    The name this collector held on the receipt date.
                  </div>
                </dd>
                <dt>Site</dt><dd className="mono">{batch.data.site}</dd>
                <dt>Category</dt><dd>{batch.data.category.replace(/_/g, '-')}</dd>
                <dt>Received on</dt><dd className="mono">{batch.data.received_on}</dd>
                <dt>Approval in force</dt>
                <dd>{batch.data.approval_state_on_receipt}{batch.data.approval_valid_to ? `, to ${batch.data.approval_valid_to}` : ''}</dd>
                <dt>Gross</dt><dd className="mono">{formatInt(batch.data.gross_g)} g</dd>
                <dt>Tare</dt><dd className="mono">{formatInt(batch.data.tare_g)} g</dd>
                <dt>Net</dt><dd className="mono">{formatInt(batch.data.net_g)} g</dd>
                <dt>Moisture</dt><dd className="mono">{batch.data.moisture_bp} bp, by {batch.data.moisture_method}</dd>
                <dt>Dry mass</dt><dd className="mono">{formatInt(batch.data.dry_mass_g)} g</dd>
                <dt>Device</dt><dd className="mono">{batch.data.device}</dd>
                <dt>Accepted</dt><dd className="mono">{formatInt(batch.data.accepted_g)} g</dd>
                <dt>Rejected</dt><dd className="mono">{formatInt(batch.data.rejected_g)} g</dd>
                {batch.data.rejected_destination ? (
                  <>
                    <dt>Rejected to</dt><dd>{batch.data.rejected_destination}</dd>
                  </>
                ) : null}
              </dl>
              <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>
                {batch.data.derivation.dry_mass_g}
              </p>
              <p className="t-small" style={{ color: 'var(--muted)' }}>
                {batch.data.derivation.claimable}
              </p>
            </div>

            <div className="card">
              <h2 className="t-h4">Composition and contamination</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Polymer</dt><dd className="mono">{batch.data.composition.polymer}</dd>
                <dt>Declared fraction</dt><dd className="mono">{batch.data.composition.fraction_bp} bp</dd>
                <dt>Measured fraction</dt>
                <dd className="mono">{batch.data.composition.measured_fraction_bp ?? 'not yet sampled'}</dd>
                <dt>Basis</dt><dd>{batch.data.composition.basis}</dd>
                {batch.data.composition_departure_bp !== null ? (
                  <>
                    <dt>Departure</dt>
                    <dd className="mono">
                      {batch.data.composition_departure_bp} bp
                      {batch.data.composition_departure_bp > 500 ? ' — beyond the 500 bp tolerance' : ''}
                    </dd>
                  </>
                ) : null}
              </dl>
              {batch.data.composition_departure_bp > 500 ? (
                <p className="t-small" style={{ marginTop: '0.75rem' }}>
                  A measured composition departing from the collector's declaration by more than 500
                  basis points stands as a finding against the collector's approval record, not against
                  the plant.
                </p>
              ) : null}
              <p className="label" style={{ marginTop: '1rem' }}>Contamination</p>
              <dl className="dl">
                <dt>Non-nylon</dt><dd className="mono">{batch.data.contamination.non_nylon_bp} bp</dd>
                <dt>Elastane</dt><dd className="mono">{batch.data.contamination.elastane_bp} bp</dd>
                <dt>Coatings</dt><dd>{batch.data.contamination.coatings}</dd>
                <dt>Colour load</dt><dd>{batch.data.contamination.colour_load}</dd>
                <dt>Foreign matter</dt><dd>{batch.data.contamination.foreign_matter}</dd>
              </dl>
            </div>
          </div>

          <section className="section">
            <h2 className="t-h4">Custody</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              Six links: collection site, collector, transport, arrival, weighing, acceptance. A missing
              link makes the batch non-claimable and names the missing kind here, on every run that
              consumed it, and on every lot downstream.
            </p>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead><tr><th scope="col">Kind</th><th scope="col">Date</th><th scope="col">Party</th><th scope="col">Arrived</th></tr></thead>
                <tbody>
                  {batch.data.custody.map((c, i) => (
                    <tr key={`${c.kind}-${i}`}>
                      <td>{c.kind.replace(/_/g, ' ')}</td>
                      <td className="mono">{c.date}</td>
                      <td>{c.party}</td>
                      <td className="mono">{c.arrived_on || '—'}</td>
                    </tr>
                  ))}
                  {batch.data.custody_missing.map((k) => (
                    <tr key={`missing-${k}`}>
                      <td>{k.replace(/_/g, ' ')}</td>
                      <td colSpan="3"><StateWord icon="flag">Missing</StateWord></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* the same traversal backwards: every lot, certificate and recipient */}
          <section className="section">
            <h2 className="t-h4">Impact, running the traversal backwards</h2>
            {impact.loading ? <Loading what="the impact traversal" /> : null}
            {impact.data ? (
              <>
                <p className="t-small" style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>
                  {impact.data.derivation}. This is a complete set and is never paginated.
                </p>
                <div className="grid grid-3" style={{ marginTop: '1rem' }}>
                  <div className="card-quiet">
                    <p className="label">Lots containing any of this batch</p>
                    {impact.data.lots.length === 0 ? (
                      <p className="t-small" style={{ marginBottom: 0 }}>None.</p>
                    ) : (
                      <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                        {impact.data.lots.map((l) => (
                          <li key={l.reference}>
                            <Link href={`/console/lots/${l.reference}`} className="ref">{l.reference}</Link>{' '}
                            <span className="mono">{formatInt(l.mass_g)} g</span>, {l.disposition}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="card-quiet">
                    <p className="label">Certificates resting on those lots</p>
                    {impact.data.certificates.length === 0 ? (
                      <p className="t-small" style={{ marginBottom: 0 }}>None.</p>
                    ) : (
                      <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                        {impact.data.certificates.map((c) => (
                          <li key={c.number}>
                            <Link href={`/console/certificates/${c.number}`} className="ref">{c.number}</Link>: {c.state}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="card-quiet">
                    <p className="label">Recipients</p>
                    {impact.data.recipients.length === 0 ? (
                      <p className="t-small" style={{ marginBottom: 0 }}>None.</p>
                    ) : (
                      <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                        {impact.data.recipients.map((r) => (
                          <li key={r.reference}>{r.name} ({r.certificates.join(', ')})</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

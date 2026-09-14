import { useEffect, useState } from 'preact/hooks';
import { Loading, Empty, Banner } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function Intake({ user }) {
  const [batches, setBatches] = useState(null);

  useEffect(() => {
    api('/api/batches').then((r) => setBatches(r.ok ? r.data : []));
  }, []);

  return (
    <div>
      <h1 class="reveal">Feedstock intake</h1>
      <p class="lede">A batch resolves its claimability against the collector approval in force on its receipt date, never a current flag.</p>
      {!batches && <Loading>Loading batches…</Loading>}
      {batches && batches.length === 0 && <Empty>No batches have been booked in.</Empty>}
      {batches && batches.length > 0 && (
        <div class="stack">
          {batches.map((b) => (
            <article class="card">
              <h3 class="mono">{b.reference}</h3>
              <p>Collector: {b.collector_name} (<span class="mono">{b.collector}</span>) · Category: <strong>{b.category}</strong></p>
              <p class="mono">net {b.net_g} g · moisture {b.moisture_bp} bp · dry mass {b.dry_mass_g} g</p>
              <p>Received {b.received_on} on device <span class="mono">{b.device}</span>{b.calibrated_on ? ' (calibrated ' + b.calibrated_on + ')' : ''}</p>
              {!b.claimable && <p class="state-word">non-claimable — {b.claimable_reason}</p>}
              {b.claimable && <p class="state-word">claimable</p>}
              {(b.flags || []).map((f) => (
                <p class="state-word">{f === 'lapsed_calibration' ? 'lapsed calibration' : f}</p>
              ))}
              {!b.custody_complete && <p class="state-word">This batch cannot be claimed: missing {b.missing_custody_kind} link.</p>}
              {b.claimable_from && <p class="stat-meta">Claimable from {b.claimable_from}, not from its receipt date.</p>}
              {b.approval_in_force && (
                <p class="stat-meta">Approval in force on receipt: {b.approval_in_force.state}, {b.approval_in_force.valid_from} to {b.approval_in_force.valid_to}</p>
              )}
              {!b.approval_in_force && <p class="stat-meta">No approval period covers the receipt date. This collector's approval lapsed, and material received after that date is processed but not claimed.</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

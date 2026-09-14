import { useEffect, useState } from 'preact/hooks';
import { api, newIdempotencyKey } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtBp, fmtDate } from '../format.js';

export function BatchList() {
  const [batches, setBatches] = useState(undefined);
  useEffect(() => { api('/api/batches').then((r) => setBatches(r.ok ? r.data : [])); }, []);
  if (batches === undefined) return <Loading />;
  if (!batches.length) return <Empty>No batch has been booked in.</Empty>;
  return (
    <div>
      <h1>Feedstock register</h1>
      <p>Every figure is computed on dry mass. A batch resolves its claimability against the collector
        approval in force on its receipt date, never a current flag.</p>
      <div class="table-wrap sheet">
        <table>
          <thead><tr>
            <th>Batch</th><th>Collector</th><th>Category</th><th>Received</th>
            <th class="figure">Net</th><th class="figure">Dry mass</th><th>Claimable</th><th>Flags</th>
          </tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr>
                <td><Link href={`/console/batches/${b.reference}`}><Ref>{b.reference}</Ref></Link></td>
                <td>{b.collector_name}</td>
                <td>{b.category.replace('_', ' ')}</td>
                <td>{fmtDate(b.received_on)}</td>
                <td class="figure">{fmtG(b.net_g)}</td>
                <td class="figure">{fmtG(b.dry_mass_g)}</td>
                <td>{b.claimable ? 'Claimable' : <span><WordState state="non_claimable" /><br /><span class="small">{b.claimable_reason?.replace(/_/g, ' ')}</span></span>}</td>
                <td>{b.flags.length ? b.flags.map((f) => <WordState state={f} />) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BatchDetail({ reference }) {
  const [batch, setBatch] = useState(undefined);
  const [impact, setImpact] = useState(undefined);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    api(`/api/batches/${reference}`).then((r) => setBatch(r.ok ? r.data : null));
    api(`/api/batches/${reference}/impact`).then((r) => setImpact(r.ok ? r.data : null));
  }, [reference]);
  if (batch === undefined) return <Loading />;
  if (batch === null) return <Empty>There is no batch with that reference.</Empty>;

  async function attachCustody(e) {
    e.preventDefault();
    const kind = e.target.kind.value;
    const date = e.target.date.value;
    const party = e.target.party.value;
    const r = await api(`/api/batches/${reference}/custody`, {
      method: 'POST', key: newIdempotencyKey('custody'), body: { kind, date, party }
    });
    setBanner(r.ok
      ? { kind: 'note', text: `The ${kind.replace('_', ' ')} document arrived on ${date}. The batch is claimable from that date.` }
      : { kind: 'refused', text: 'The custody document was refused: ' + (r.data?.message || r.data?.error) });
    if (r.ok) setBatch(r.data);
  }

  return (
    <div>
      <h1><Ref>{batch.reference}</Ref></h1>
      {!batch.claimable && batch.claimable_reason === 'custody_link_missing' ? (
        <Banner kind="refused" title="This batch cannot be claimed">
          This batch cannot be claimed: {batch.missing_custody_kinds?.join(', ').replace(/_/g, ' ')}.
        </Banner>
      ) : null}
      {!batch.claimable && batch.claimable_reason?.startsWith('collector_approval') ? (
        <Banner kind="refused" title="Approval not in force">
          This collector's approval lapsed on {fmtDate(batch.approval_in_force?.valid_to || null)}.
          Material received after that date is processed but not claimed.
        </Banner>
      ) : null}
      {batch.claimable_from ? (
        <Banner>The late custody document arrived on {fmtDate(batch.claimable_from)}. The batch is claimable from that date.</Banner>
      ) : null}
      {banner ? <Banner kind={banner.kind}>{banner.text}</Banner> : null}

      <div class="sheet">
        <h2>Intake</h2>
        <dl class="kv">
          <dt>Collector</dt><dd>{batch.collector_name} (<Ref>{batch.collector}</Ref>)</dd>
          <dt>Site</dt><dd><Ref>{batch.site}</Ref></dd>
          <dt>Category</dt><dd>{batch.category.replace('_', ' ')} <span class="small">(immutable after acceptance)</span></dd>
          <dt>Received on</dt><dd>{fmtDate(batch.received_on)}</dd>
          <dt>Gross / tare / net</dt><dd class="figure">{fmtG(batch.gross_g)} / {fmtG(batch.tare_g)} / {fmtG(batch.net_g)}</dd>
          <dt>Moisture</dt><dd class="figure">{batch.moisture_bp} bp by {batch.moisture_method}</dd>
          <dt>Dry mass</dt><dd class="figure">{fmtG(batch.dry_mass_g)}</dd>
          <dt>Device</dt><dd><Ref>{batch.device}</Ref> (calibrated {fmtDate(batch.device_calibration)})</dd>
          <dt>Accepted</dt><dd class="figure">{fmtG(batch.accepted_g)}</dd>
          {batch.rejected_g ? <dt>Rejected</dt> : null}
          {batch.rejected_g ? <dd class="figure">{fmtG(batch.rejected_g)} to {batch.rejected_destination}</dd> : null}
          <dt>Approval in force</dt>
          <dd>{batch.approval_in_force
            ? `${batch.approval_in_force.state} from ${fmtDate(batch.approval_in_force.valid_from)} to ${fmtDate(batch.approval_in_force.valid_to)}`
            : 'No approval covered the receipt date'}</dd>
        </dl>
      </div>

      <div class="sheet">
        <h2>Composition and contamination</h2>
        {batch.composition.length === 0 ? <Empty>No composition declared.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Polymer</th><th class="figure">Declared</th><th>Basis</th><th class="figure">Measured</th></tr></thead>
              <tbody>
                {batch.composition.map((c) => (
                  <tr>
                    <td>{c.polymer}</td>
                    <td class="figure">{c.fraction_bp} bp</td>
                    <td>{c.basis}</td>
                    <td class="figure">{c.measured_fraction_bp === null || c.measured_fraction_bp === undefined ? '—' : `${c.measured_fraction_bp} bp`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl class="kv" style="margin-top:1rem">
          {Object.entries(batch.contamination || {}).map(([k, v]) => <><dt>{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></>)}
        </dl>
      </div>

      <div class="sheet">
        <h2>Custody</h2>
        <p class="small">Custody complete: {batch.custody_complete ? 'yes' : `missing ${batch.missing_custody_kinds?.join(', ').replace(/_/g, ' ')}`}</p>
        <ol>
          {(batch.custody || []).map((l) => <li>{l.kind.replace(/_/g, ' ')} — {l.party} — {fmtDate(l.date)}</li>)}
        </ol>
        {!batch.custody_complete ? (
          <form onSubmit={attachCustody}>
            <fieldset>
              <legend>Attach a late document</legend>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1rem">
                <div><label for="cu-kind">Kind</label>
                  <select id="cu-kind" name="kind">
                    {['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].map((k) => <option value={k}>{k.replace(/_/g, ' ')}</option>)}
                  </select></div>
                <div><label for="cu-date">Arrived on</label><input id="cu-date" name="date" type="date" required /></div>
                <div><label for="cu-party">Party</label><input id="cu-party" name="party" required /></div>
              </div>
              <button class="btn" type="submit">Attach</button>
            </fieldset>
          </form>
        ) : null}
      </div>

      <ImpactView impact={impact} />
    </div>
  );
}

export function ImpactView({ impact }) {
  if (impact === undefined) return <Loading />;
  if (impact === null) return null;
  return (
    <div class="sheet">
      <h2>Backwards from this batch</h2>
      <p class="small">Every lot containing any of this batch, every certificate resting on those lots,
        and every recipient. A complete set.</p>
      <h3>Lots</h3>
      {impact.lots.length === 0 ? <Empty>This batch reaches no lot.</Empty> : (
        <ul class="tree">
          {impact.lots.map((l) => (
            <li><Link href={`/console/lots/${l.reference}`}><Ref>{l.reference}</Ref></Link> — {fmtG(l.mass_g)}, of which this batch is {fmtG(l.batch_mass_g)} — {l.disposition}</li>
          ))}
        </ul>
      )}
      <h3>Certificates</h3>
      {impact.certificates.length === 0 ? <Empty>No certificate rests on these lots.</Empty> : (
        <ul class="tree">
          {impact.certificates.map((c) => (
            <li><Link href={`/console/certificates/${c.number}`}><Ref>{c.number}</Ref></Link> — {c.state} — recipient <Ref>{c.recipient}</Ref></li>
          ))}
        </ul>
      )}
      <h3>Recipients</h3>
      {impact.recipients.length === 0 ? <Empty>No recipient is affected.</Empty> : (
        <ul>{impact.recipients.map((r) => <li><Ref>{r}</Ref></li>)}</ul>
      )}
    </div>
  );
}

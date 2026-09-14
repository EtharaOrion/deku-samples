import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtBp, fmtCarbon, fmtDate } from '../format.js';

export function LotList() {
  const [lots, setLots] = useState(undefined);
  useEffect(() => { api('/api/lots').then((r) => setLots(r.ok ? r.data : [])); }, []);
  if (lots === undefined) return <Loading />;
  if (!lots.length) return <Empty>No lot has been recorded.</Empty>;
  return (
    <div>
      <h1>Lot register</h1>
      <p>A recycled-content percentage is never shown without its claim type beside it.</p>
      <div class="table-wrap sheet">
        <table>
          <thead><tr>
            <th>Lot</th><th>Site</th><th class="figure">Mass</th><th>Disposition</th>
            <th>Claim type</th><th class="figure">Content</th><th>Flags</th>
          </tr></thead>
          <tbody>
            {lots.map((l) => (
              <tr>
                <td><Link href={`/console/lots/${l.reference}`}><Ref>{l.reference}</Ref></Link></td>
                <td><Ref>{l.site}</Ref></td>
                <td class="figure">{fmtG(l.mass_g)}</td>
                <td><WordState state={l.disposition} /></td>
                <td>{l.claim_type.replace(/_/g, ' ')}</td>
                <td class="figure">{fmtBp(l.content_bp)} <span class="small">({l.claim_type.replace(/_/g, ' ')})</span></td>
                <td>{l.flags.length ? l.flags.map((f) => <WordState state={f} />) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LotDetail({ reference }) {
  const [lot, setLot] = useState(undefined);
  const [carbon, setCarbon] = useState(undefined);
  const [yieldData, setYieldData] = useState(undefined);
  const [byproducts, setByproducts] = useState(undefined);
  useEffect(() => {
    api(`/api/lots/${reference}`).then((r) => setLot(r.ok ? r.data : null));
    api(`/api/lots/${reference}/carbon`).then((r) => setCarbon(r.ok ? r.data : { error: r.data }));
    api(`/api/lots/${reference}/yield`).then((r) => setYieldData(r.ok ? r.data : { error: r.data }));
    api(`/api/lots/${reference}/byproduct-shares`).then((r) => setByproducts(r.ok ? r.data : null));
  }, [reference]);
  if (lot === undefined) return <Loading />;
  if (lot === null) return <Empty>There is no lot with that reference.</Empty>;

  return (
    <div>
      <h1><Ref>{lot.reference}</Ref></h1>
      {lot.flags.includes('unreviewed_override') ? (
        <Banner kind="refused" title="Unreviewed override">
          Separation overridden by an authorised person. It cannot be removed and it blocks signing until a second person reviews it.
        </Banner>
      ) : null}
      {lot.flags.includes('open_deviation') ? (
        <Banner kind="refused" title="Open deviation">A deviation touching this lot is open.</Banner>
      ) : null}

      <div class="sheet">
        <h2>The lot</h2>
        <dl class="kv">
          <dt>Site</dt><dd><Ref>{lot.site}</Ref></dd>
          <dt>Grade</dt><dd>{lot.grade}</dd>
          <dt>Mass</dt><dd class="figure">{fmtG(lot.mass_g)}</dd>
          <dt>Disposition</dt><dd><WordState state={lot.disposition} /></dd>
          <dt>Claim type</dt><dd>{lot.claim_type.replace(/_/g, ' ')}</dd>
          <dt>Recycled content</dt><dd class="figure">{fmtBp(lot.content_bp)} ({lot.claim_type.replace(/_/g, ' ')})</dd>
          <dt>Credit attached</dt><dd class="figure">{fmtG(lot.credit_attached_g)}</dd>
          <dt>Produced by</dt><dd><Link href={`/console/runs/${lot.produced_by_run}`}><Ref>{lot.produced_by_run}</Ref></Link></dd>
          {lot.provisional_factor ? <><dt>Conversion factor</dt><dd><WordState state="provisional_factor" /></dd></> : null}
        </dl>
        <Banner>This material is claimed by mass balance. It is not physically segregated.</Banner>
      </div>

      <div class="sheet">
        <h2>Carbon</h2>
        {carbon === undefined ? <Loading /> : carbon.error ? (
          <Empty>No carbon figure exists for this lot, or it is incomplete. A carbon value is never shown
            without its boundary, method version and uncertainty.</Empty>
        ) : (
          <div>
            <dl class="kv">
              <dt>Footprint</dt><dd class="figure">{fmtCarbon(carbon.value_mg_per_kg)}</dd>
              <dt>Boundary</dt><dd>{carbon.boundary}</dd>
              <dt>Method version</dt><dd><Ref>{carbon.method_version}</Ref></dd>
              <dt>Uncertainty</dt><dd class="figure">{carbon.uncertainty_bp} bp</dd>
              <dt>Comparator</dt>
                <dd>{carbon.comparator.material} from dataset {carbon.comparator.dataset} ({carbon.comparator.dataset_year}, {carbon.comparator.region})</dd>
              <dt>Primary share</dt><dd class="figure">{carbon.primary_share_bp} bp {carbon.default_led ? '(default-led)' : ''}</dd>
              {carbon.energy_location_mg_per_kg !== null && carbon.energy_location_mg_per_kg !== undefined ? (
                <>
                  <dt>Energy, location-based</dt><dd class="figure">{carbon.energy_location_mg_per_kg} mg CO2e per kg</dd>
                  <dt>Energy, market-based</dt><dd class="figure">{carbon.energy_market_mg_per_kg} mg CO2e per kg</dd>
                  <dt>Metered / retired / unmatched</dt>
                    <dd class="figure">{carbon.metered_kwh} / {carbon.retired_kwh} / {carbon.unmatched_kwh} kWh</dd>
                </>
              ) : null}
            </dl>
            <p class="small" style="margin-top:1rem">
              This figure is {(carbon.value_mg_per_kg < (carbon.comparator.value_mg_per_kg || Infinity))
                ? `lower than ${carbon.comparator.material} from ${carbon.comparator.dataset} (${carbon.comparator.dataset_year}, ${carbon.comparator.region})`
                : 'not lower than its comparator'}.
            </p>
            <h3>Breakdown</h3>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Line</th><th class="figure">mg per kg</th><th>Tag</th></tr></thead>
                <tbody>
                  {(carbon.breakdown || []).map((b) => (
                    <tr><td>{b.line.replace(/_/g, ' ')}</td><td class="figure">{b.mg_per_kg}</td><td>{b.tag.replace(/_/g, ' ')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {yieldData && !yieldData.error ? (
        <div class="sheet">
          <h2>Yield</h2>
          <dl class="kv">
            <dt>Run</dt><dd><Ref>{yieldData.run}</Ref></dd>
            <dt>Mass in</dt><dd class="figure">{fmtG(yieldData.mass_in_g)}</dd>
            <dt>Lot mass</dt><dd class="figure">{fmtG(yieldData.mass_g || lot.mass_g)}</dd>
            <dt>Yield</dt><dd class="figure">{yieldData.yield_bp} bp</dd>
          </dl>
          <p class="small">Yield is for plant operations, quality and the claims manager. It appears on no
            certificate and in no verification answer.</p>
        </div>
      ) : null}

      {byproducts && (byproducts.byproducts || []).length ? (
        <div class="sheet">
          <h2>Byproducts</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Output</th><th>Disposition</th><th class="figure">Mass</th><th class="figure">Share</th><th class="figure">Claim share</th><th class="figure">Emissions share</th></tr></thead>
              <tbody>
                {byproducts.byproducts.map((b) => (
                  <tr>
                    <td><Ref>{b.output}</Ref></td>
                    <td>{b.disposition}</td>
                    <td class="figure">{fmtG(b.mass_g)}</td>
                    <td class="figure">{b.share_bp} bp</td>
                    <td class="figure">{fmtG(b.claim_share_g)}</td>
                    <td class="figure">{b.emissions_share_mg === null ? '—' : `${b.emissions_share_mg} mg per kg`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="small">{byproducts.derivation}</p>
        </div>
      ) : null}

      <div class="sheet">
        <h2>Tests and deviations</h2>
        {lot.test_results.length === 0 ? <Empty>No usable test result on this lot.</Empty> : (
          <ul>{lot.test_results.map((t) => <li>{t.property}: {t.value} {t.unit} by {t.method}{t.method_mismatch ? ' (method mismatch, not usable for release)' : ''}</li>)}</ul>
        )}
        {lot.deviations.length ? (
          <ul>{lot.deviations.map((d) => <li><Ref>{d.reference}</Ref> — {d.state}</li>)}</ul>
        ) : null}
      </div>

      <p><Link class="btn" href={`/console/lots/${lot.reference}/genealogy`}>Read the genealogy</Link></p>
    </div>
  );
}

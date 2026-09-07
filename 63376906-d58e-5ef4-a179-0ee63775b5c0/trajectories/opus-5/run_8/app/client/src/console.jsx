import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import {
  api, useApi, basisPoints, grams, kilograms, kwh, mgPerKg, readSession, words,
} from './api.js';
import {
  CarbonFigure, ContentFigure, DefRow, Empty, Grams, Icon, Loading, Refusal, Reveal,
  StateWord, Table,
} from './components.jsx';
import { Meta } from './public.jsx';

const Head = ({ eyebrow, title, children }) => (
  <div style="margin-bottom:2rem">
    {eyebrow && <p class="eyebrow">{eyebrow}</p>}
    <Reveal as="h1" class="h3">{title}</Reveal>
    {children && <div class="measure" style="margin-top:1rem">{children}</div>}
  </div>
);

// A site's certification suspension shows on every surface that can issue, and
// is not dismissible.
export function SchemeBanner() {
  const { data } = useApi('/sites');
  const [suspensions, setSuspensions] = useState([]);
  useEffect(() => {
    if (!data) return;
    Promise.all(data.map((s) => api(`/sites/${s.reference}/certification`).catch(() => null)))
      .then((rows) => setSuspensions(rows.filter((r) => r && r.suspended)));
  }, [data]);
  if (!suspensions.length) return null;
  return (
    <div class="page" style="margin-bottom:1.5rem">
      {suspensions.map((s) => (
        <div class="banner" role="alert" key={s.site}>
          <p class="eyebrow eyebrow-ink">
            <Icon name="warning" label="Certification suspended" />
          </p>
          <p class="body-small" style="margin-bottom:0.25rem">
            The certification for <span class="mono">{s.site}</span> is suspended, effective
            from <span class="mono">{s.in_force?.effective_from}</span>
            {s.in_force?.effective_to ? ` to ${s.in_force.effective_to}` : ''}. Issuing has
            stopped for this site. {s.in_force?.reason}
          </p>
          <p class="body-small" style="margin:0">
            <a href={`/console/certificates?site=${s.site}`}>
              The certificates signed inside that window <span class="arrow">→</span>
            </a>
          </p>
        </div>
      ))}
    </div>
  );
}

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export function Board() {
  const runs = useApi('/runs');
  return (
    <>
      <Meta title="Console — Ravel" description="The run board, one column per process stage." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="The board">
          <p>One column per process stage, one card per run. Every card names the stage it
          sits in, so the column is never the only thing saying where a run is.</p>
        </Head>
        {runs.loading && <Loading what="the run board" />}
        {runs.error && <Refusal error={runs.error} title="The board could not be read" />}
        {runs.data && (
          <div class="board">
            {STAGES.map((stage) => {
              const cards = runs.data.filter((r) => r.run_type === stage);
              return (
                <section class="board-column" key={stage} aria-labelledby={`col-${stage}`}>
                  <h2 class="h4" id={`col-${stage}`}>{words(stage)}</h2>
                  <p class="label" style="margin-bottom:0.75rem">
                    {cards.length === 1 ? '1 run' : `${cards.length} runs`}
                  </p>
                  {cards.length === 0 && (
                    <Empty>No run is recorded at this stage.</Empty>
                  )}
                  {cards.map((r) => (
                    <a class="run-card card-link" href={`/console/runs/${r.reference}`} key={r.reference}>
                      <p class="mono" style="margin:0 0 0.35rem">{r.reference}</p>
                      <p class="label" style="margin:0 0 0.5rem">Stage: {words(r.run_type)}</p>
                      <p class="body-small" style="margin:0 0 0.35rem">
                        In <Grams g={r.mass_in_g} /> · out <Grams g={r.mass_out_g} />
                      </p>
                      <p class="body-small" style="margin:0 0 0.5rem">
                        Losses <Grams g={r.losses_g} />
                      </p>
                      <p style="margin:0;display:flex;gap:0.35rem;flex-wrap:wrap">
                        <StateWord>{words(r.state)}</StateWord>
                        {r.within_tolerance === false && <StateWord strong>Outside tolerance</StateWord>}
                        {r.flags?.includes('lapsed_calibration') && <StateWord strong>Lapsed calibration</StateWord>}
                        {r.deviations?.some((d) => d.state === 'open') && <StateWord strong>Open deviation</StateWord>}
                      </p>
                    </a>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function Intake() {
  const batches = useApi('/batches');
  const collectors = useApi('/collectors');
  return (
    <>
      <Meta title="Intake — Ravel" description="Feedstock arrival." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Intake">
          <p>Every batch resolves its claimability against the collector approval in force
          on its receipt date, never a current flag.</p>
        </Head>
        {batches.loading && <Loading what="the batch register" />}
        {batches.error && <Refusal error={batches.error} title="The batch register could not be read" />}
        {batches.data && (
          <Table
            caption="Batch register"
            columns={[
              { key: 'reference', label: 'Batch', render: (b) => <a class="mono" href={`/console/batches/${b.reference}`}>{b.reference}</a> },
              { key: 'collector', label: 'Collector on receipt', render: (b) => b.collector_name },
              { key: 'category', label: 'Category', render: (b) => words(b.category) },
              { key: 'received', label: 'Received', render: (b) => <span class="mono">{b.received_on}</span> },
              { key: 'net', label: 'Net', numeric: true, render: (b) => grams(b.net_g) },
              { key: 'dry', label: 'Dry mass', numeric: true, render: (b) => grams(b.dry_mass_g) },
              {
                key: 'state',
                label: 'State',
                render: (b) => (
                  <span style="display:flex;gap:0.35rem;flex-wrap:wrap">
                    {b.claimable
                      ? <StateWord>Claimable</StateWord>
                      : <StateWord strong>Non-claimable</StateWord>}
                    {b.flags?.includes('lapsed_calibration') && <StateWord strong>Lapsed calibration</StateWord>}
                  </span>
                ),
              },
              {
                key: 'reason',
                label: 'Reason',
                render: (b) => (b.claimable_reason
                  ? (b.claimable_reason === 'custody_link_missing'
                    ? `This batch cannot be claimed: ${b.missing_custody_kinds?.join(', ')}.`
                    : `This collector's approval lapsed. Material received after that date is processed but not claimed.`)
                  : '—'),
              },
            ]}
            rows={batches.data}
            empty="No batch has been booked in."
          />
        )}
        <hr class="rule" />
        <h2 class="h4">Collectors and their approval periods</h2>
        {collectors.loading && <Loading what="the collectors" />}
        {collectors.data && collectors.data.length === 0 && <Empty>No collector is registered.</Empty>}
        {collectors.data && collectors.data.length > 0 && (
          <div class="grid grid-3" style="margin-top:1.5rem">
            {collectors.data.map((col) => (
              <article class="card" key={col.reference}>
                <p class="mono" style="margin:0 0 0.25rem">{col.reference}</p>
                <h3 class="h4">{col.name}</h3>
                <p class="body-small" style="margin:0.5rem 0">
                  {col.country} · registration <span class="mono">{col.registration}</span>, expiring{' '}
                  <span class="mono">{col.registration_expiry}</span>
                </p>
                {(col.approval_periods || []).map((p) => (
                  <div key={p.valid_from} style="margin-top:0.75rem">
                    <StateWord strong={p.state !== 'approved'}>{words(p.state)}</StateWord>{' '}
                    <span class="mono">{p.valid_from} to {p.valid_to}</span>
                    {p.expiring && <> <StateWord strong>Expiring</StateWord></>}
                    {p.condition && (
                      <p class="body-small" style="margin:0.35rem 0 0">
                        Condition: {p.condition}, to be closed by <span class="mono">{p.condition_closes_on}</span>.
                      </p>
                    )}
                  </div>
                ))}
                {(col.findings || []).length > 0 && (
                  <p class="body-small" style="margin:0.75rem 0 0">
                    <StateWord strong>Open finding</StateWord> {col.findings[0].detail}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function BatchDetail() {
  const { params } = useRoute();
  const ref = params.reference;
  const batch = useApi(`/batches/${ref}`, [ref]);
  const impact = useApi(`/batches/${ref}/impact`, [ref]);
  const b = batch.data;
  return (
    <>
      <Meta title={`${ref} — Ravel`} description="A booked-in batch and everything it reaches." noindex />
      <div class="page">
        <Head eyebrow="Batch" title={ref} />
        {batch.loading && <Loading what="the batch" />}
        {batch.error && <Refusal error={batch.error} title="The batch could not be read" />}
        {b && (
          <>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
              {b.claimable ? <StateWord>Claimable</StateWord> : <StateWord strong>Non-claimable</StateWord>}
              {b.flags?.includes('lapsed_calibration') && <StateWord strong>Lapsed calibration</StateWord>}
            </div>
            {!b.claimable && (
              <div class="banner" style="margin-bottom:1.5rem">
                <p class="eyebrow eyebrow-ink">Why this batch is not claimed</p>
                <p class="body-small" style="margin:0">
                  {b.claimable_reason === 'custody_link_missing'
                    ? `This batch cannot be claimed: ${b.missing_custody_kinds.join(', ')}.`
                    : `This collector's approval lapsed. Material received after that date is processed but not claimed.`}
                </p>
              </div>
            )}
            <dl class="def">
              <DefRow term="Collector on the receipt date">{b.collector_name} <span class="mono">({b.collector})</span></DefRow>
              <DefRow term="Site"><span class="mono">{b.site}</span></DefRow>
              <DefRow term="Category">{words(b.category)} <span class="body-small">— fixed at intake and immutable after acceptance</span></DefRow>
              <DefRow term="Received on"><span class="mono">{b.received_on}</span></DefRow>
              <DefRow term="Gross">{grams(b.gross_g)}</DefRow>
              <DefRow term="Tare">{grams(b.tare_g)}</DefRow>
              <DefRow term="Net">{grams(b.net_g)}</DefRow>
              <DefRow term="Moisture">{basisPoints(b.moisture_bp)} by {b.moisture_method}</DefRow>
              <DefRow term="Dry mass">
                {grams(b.dry_mass_g)}{' '}
                <span class="body-small">— {b.derivation?.dry_mass_g}</span>
              </DefRow>
              <DefRow term="Accepted">{grams(b.accepted_g)}</DefRow>
              <DefRow term="Rejected">
                {grams(b.rejected_g)}
                {b.rejected_g > 0 && ` to ${b.rejected_destination}: ${b.rejected_reason}`}
              </DefRow>
              <DefRow term="Weighing device">
                <span class="mono">{b.device}</span>, calibrated{' '}
                <span class="mono">{b.device_calibrated_on}</span>
              </DefRow>
              <DefRow term="Claimable from">{b.claimable_from ? <span class="mono">{b.claimable_from}</span> : 'not claimable'}</DefRow>
            </dl>

            <h2 class="h4" style="margin-top:2rem">Composition</h2>
            <dl class="def">
              <DefRow term="Polymer">{b.composition?.polymer}</DefRow>
              <DefRow term="Declared fraction">{basisPoints(b.composition?.fraction_bp)} on basis {words(b.composition?.basis)}</DefRow>
              <DefRow term="Measured fraction">
                {typeof b.composition?.measured_fraction_bp === 'number'
                  ? basisPoints(b.composition.measured_fraction_bp)
                  : 'no sample has been taken'}
              </DefRow>
            </dl>

            <h2 class="h4" style="margin-top:2rem">Contamination</h2>
            <dl class="def">
              <DefRow term="Non-nylon">{basisPoints(b.contamination?.non_nylon_bp)}</DefRow>
              <DefRow term="Elastane">{basisPoints(b.contamination?.elastane_bp)}</DefRow>
              <DefRow term="Coatings">{b.contamination?.coatings}</DefRow>
              <DefRow term="Colour load">{b.contamination?.colour_load}</DefRow>
              <DefRow term="Foreign matter">{b.contamination?.foreign_matter}</DefRow>
            </dl>

            <h2 class="h4" style="margin-top:2rem">Custody</h2>
            <Table
              caption="Custody links"
              columns={[
                { key: 'kind', label: 'Link', render: (l) => words(l.kind) },
                { key: 'date', label: 'Date', render: (l) => <span class="mono">{l.date}</span> },
                { key: 'party', label: 'Party', render: (l) => <span class="mono">{l.party}</span> },
                { key: 'late', label: 'Evidence', render: (l) => (l.late ? `arrived late on ${l.arrived_on}` : 'at the time') },
              ]}
              rows={(b.custody || []).map((l, i) => ({ ...l, key: `${l.kind}-${i}` }))}
              empty="No custody link is recorded for this batch."
            />
            {b.missing_custody_kinds?.length > 0 && (
              <p class="body-small" style="margin-top:0.75rem">
                <StateWord strong>Missing</StateWord> {b.missing_custody_kinds.map(words).join(', ')}
              </p>
            )}

            <hr class="rule" />
            <h2 class="h4">
              <Icon name="arrow" label="The reverse traversal: everything this batch reaches" />
            </h2>
            {impact.loading && <Loading what="the reverse traversal" />}
            {impact.data && (
              <>
                <p class="body-small" style="margin-top:1rem">
                  A complete set, never paginated. Read at{' '}
                  <span class="mono">{impact.data.read_at}</span>.
                </p>
                <Table
                  caption="Lots containing any of this batch"
                  columns={[
                    { key: 'lot', label: 'Lot', render: (l) => <a class="mono" href={`/console/lots/${l.reference}`}>{l.reference}</a> },
                    { key: 'mass', label: 'Mass', numeric: true, render: (l) => grams(l.mass_g) },
                    { key: 'site', label: 'Site', render: (l) => <span class="mono">{l.site}</span> },
                    { key: 'disposition', label: 'Disposition', render: (l) => <StateWord>{words(l.disposition)}</StateWord> },
                  ]}
                  rows={impact.data.lots}
                  empty="No lot contains any of this batch."
                />
                <h3 class="h4" style="margin-top:1.5rem">Certificates resting on those lots</h3>
                <Table
                  caption="Certificates"
                  columns={[
                    { key: 'number', label: 'Certificate', render: (x) => <a class="mono" href={`/console/certificates/${x.number}`}>{x.number}</a> },
                    { key: 'state', label: 'State', render: (x) => <StateWord strong={x.state === 'withdrawn'}>{words(x.state)}</StateWord> },
                    { key: 'recipient', label: 'Recipient', render: (x) => x.recipient_name },
                  ]}
                  rows={impact.data.certificates}
                  empty="No certificate rests on those lots."
                />
                <h3 class="h4" style="margin-top:1.5rem">Recipients</h3>
                {impact.data.recipients.length === 0
                  ? <Empty>No recipient holds a certificate touching this batch.</Empty>
                  : <ul>{impact.data.recipients.map((r) => <li key={r.reference}>{r.name} <span class="mono">({r.reference})</span></li>)}</ul>}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function RunDetail() {
  const { params } = useRoute();
  const ref = params.reference;
  const run = useApi(`/runs/${ref}`, [ref]);
  const r = run.data;
  return (
    <>
      <Meta title={`${ref} — Ravel`} description="A process run and what it consumed and produced." noindex />
      <div class="page">
        <Head eyebrow={`Run · ${r ? words(r.run_type) : ''}`} title={ref} />
        {run.loading && <Loading what="the run" />}
        {run.error && <Refusal error={run.error} title="The run could not be read" />}
        {r && (
          <>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
              <StateWord>{words(r.state)}</StateWord>
              {r.within_tolerance === false && <StateWord strong>Outside tolerance</StateWord>}
              {r.flags?.map((f) => <StateWord strong key={f}>{words(f)}</StateWord>)}
              {r.deviations?.filter((d) => d.state === 'open').map((d) => (
                <StateWord strong key={d.reference}>Open deviation {d.reference}</StateWord>
              ))}
            </div>
            <dl class="def">
              <DefRow term="Stage">{words(r.run_type)}</DefRow>
              <DefRow term="Site"><span class="mono">{r.site}</span></DefRow>
              <DefRow term="Equipment"><span class="mono">{r.equipment}</span></DefRow>
              <DefRow term="Recipe version followed"><span class="mono">{r.recipe_version}</span></DefRow>
              <DefRow term="Set points released">
                <span class="mono">{JSON.stringify(r.recipe?.set_points)}</span>
              </DefRow>
              <DefRow term="Tolerances">
                <span class="mono">{JSON.stringify(r.recipe?.tolerances)}</span>
              </DefRow>
              <DefRow term="Actual set points achieved">
                <span class="mono">{JSON.stringify(r.actual_set_points)}</span>
              </DefRow>
              <DefRow term="Within tolerance">{r.within_tolerance === null ? 'not yet decided' : r.within_tolerance ? 'yes' : 'no'}</DefRow>
              <DefRow term="Operator"><span class="mono">{r.operator}</span></DefRow>
              <DefRow term="Started"><span class="mono">{r.started_at}</span></DefRow>
              <DefRow term="Closed"><span class="mono">{r.closed_at || 'open'}</span></DefRow>
              <DefRow term="Mass in">{grams(r.mass_in_g)}</DefRow>
              <DefRow term="Mass out">{grams(r.mass_out_g)}</DefRow>
              <DefRow term="Losses">{grams(r.losses_g)} <span class="body-small">— {r.derivation?.losses_g}. Losses reduce the claim.</span></DefRow>
            </dl>
            <h2 class="h4" style="margin-top:2rem">Consumptions</h2>
            <Table
              caption="What this run consumed"
              columns={[
                { key: 'ref', label: 'Consumption', render: (x) => <span class="mono">{x.reference}</span> },
                { key: 'input', label: 'Input', render: (x) => <span class="mono">{x.input_reference}</span> },
                { key: 'mass', label: 'Mass', numeric: true, render: (x) => grams(x.mass_g) },
                { key: 'dry', label: 'Dry mass', numeric: true, render: (x) => grams(x.dry_mass_g) },
                { key: 'eff', label: 'Effective on', render: (x) => <span class="mono">{x.effective_on}</span> },
              ]}
              rows={r.consumptions}
              empty="This run has consumed nothing yet."
            />
            <h2 class="h4" style="margin-top:2rem">Outputs</h2>
            <Table
              caption="What this run produced"
              columns={[
                { key: 'ref', label: 'Output', render: (x) => <span class="mono">{x.reference}</span> },
                { key: 'kind', label: 'Kind', render: (x) => words(x.kind) },
                { key: 'mass', label: 'Mass', numeric: true, render: (x) => grams(x.mass_g) },
                { key: 'disposition', label: 'Disposition', render: (x) => (x.disposition ? words(x.disposition) : '—') },
              ]}
              rows={r.outputs}
              empty="This run has produced nothing yet."
            />
          </>
        )}
      </div>
    </>
  );
}

export function Record() {
  const record = useApi('/record');
  const check = useApi('/record/check');
  const [scope, setScope] = useState('SITE-DEMO');
  const [exporting, setExporting] = useState({ status: 'idle', result: null, error: null });
  const session = readSession();
  const isAuditor = session?.roles?.includes('auditor');

  const runExport = async () => {
    setExporting({ status: 'running', result: null, error: null });
    try {
      const result = await api('/exports', { method: 'POST', body: { scope: { sites: [scope] } } });
      setExporting({ status: 'done', result, error: null });
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.reference}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExporting({ status: 'failed', result: null, error });
    }
  };

  return (
    <>
      <Meta title="The record — Ravel" description="The append-only operational record." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="The record">
          <p>Every act is an entry with the person, the moment, the site and the object.
          A refusal is recorded as well as a success. No entry is edited and none is
          removed; a correction is a new entry naming what it corrects.</p>
        </Head>
        {check.data && (
          <div class="banner" style="margin-bottom:1.5rem">
            <p class="eyebrow eyebrow-ink">Chain check</p>
            <p class="body-small" style="margin:0">
              {check.data.holds
                ? `The digest chain holds across ${check.data.entries} entries. Checked at ${check.data.checked_at}.`
                : `The chain does not hold. First failure at sequence ${check.data.first_failure?.seq}: ${words(check.data.first_failure?.reason)}.`}
            </p>
          </div>
        )}
        <div class="card" style="margin-bottom:1.5rem">
          <p class="eyebrow eyebrow-ink">Export</p>
          <p class="body-small">
            An export records its scope before the read, carries its own derivations and
            digests, and is itself an entry. An export that returns nothing is recorded too.
          </p>
          <div style="display:flex;gap:0.75rem;align-items:end;flex-wrap:wrap">
            <div style="max-width:16rem;width:100%">
              <label class="label" for="export-scope">Scope: site</label>
              <select id="export-scope" value={scope} onChange={(e) => setScope(e.currentTarget.value)}>
                <option value="SITE-DEMO">SITE-DEMO</option>
                <option value="SITE-PILOT">SITE-PILOT</option>
                <option value="SITE-COMM">SITE-COMM</option>
              </select>
            </div>
            <button class="btn" onClick={runExport} disabled={exporting.status === 'running'}>
              {exporting.status === 'running' ? 'Exporting…' : 'Export this scope'} <span class="arrow">→</span>
            </button>
          </div>
          {exporting.status === 'done' && (
            <p class="body-small" style="margin:0.75rem 0 0" role="status">
              Export <span class="mono">{exporting.result.reference}</span> produced with{' '}
              {exporting.result.entries.length} entries, anchored at digest{' '}
              <span class="mono">{(exporting.result.anchors.last_digest || '').slice(0, 16)}…</span>.
              The export is itself an entry in this record.
            </p>
          )}
          {exporting.status === 'failed' && <Refusal error={exporting.error} title="The export was refused" />}
        </div>
        {isAuditor && (
          <p class="body-small" style="margin-bottom:1rem">
            You are reading as an auditor. Every mutating control is absent from this
            surface, and every export you take is itself an entry here.
          </p>
        )}
        {record.loading && <Loading what="the record" />}
        {record.error && <Refusal error={record.error} title="The record could not be read" />}
        {record.data && (
          <Table
            caption="The append-only record"
            columns={[
              { key: 'seq', label: 'Seq', numeric: true, render: (e) => <a class="mono" href={`/console/record/${e.seq}`}>{e.seq}</a> },
              { key: 'act', label: 'Act', render: (e) => words(e.act) },
              { key: 'actor', label: 'Person', render: (e) => <span class="mono">{e.actor}</span> },
              { key: 'site', label: 'Site', render: (e) => <span class="mono">{e.site || '—'}</span> },
              { key: 'object', label: 'Object', render: (e) => <span class="mono">{e.object_reference || '—'}</span> },
              { key: 'when', label: 'Moment', render: (e) => <span class="mono">{e.occurred_at}</span> },
              {
                key: 'refused',
                label: 'Outcome',
                render: (e) => (e.refused ? <StateWord strong>Refused</StateWord> : <StateWord>Recorded</StateWord>),
              },
              { key: 'digest', label: 'Digest', render: (e) => <span class="mono">{e.digest.slice(0, 12)}…</span> },
            ]}
            rows={record.data.map((e) => ({ ...e, key: e.seq }))}
            empty="The record holds no entries."
          />
        )}
      </div>
    </>
  );
}

export function RecordEntry() {
  const { params } = useRoute();
  const seq = params.seq;
  const entry = useApi(`/record/${seq}`, [seq]);
  const retention = useApi(`/record/${seq}/retention`, [seq]);
  return (
    <>
      <Meta title={`Entry ${seq} — Ravel`} description="One entry in the record." noindex />
      <div class="page">
        <Head eyebrow="Record entry" title={`Sequence ${seq}`} />
        {entry.loading && <Loading what="the entry" />}
        {entry.error && <Refusal error={entry.error} title="The entry could not be read" />}
        {entry.data && (
          <dl class="def">
            <DefRow term="Act">{words(entry.data.act)}</DefRow>
            <DefRow term="Person"><span class="mono">{entry.data.actor}</span></DefRow>
            <DefRow term="Moment"><span class="mono">{entry.data.occurred_at}</span></DefRow>
            <DefRow term="Site"><span class="mono">{entry.data.site || '—'}</span></DefRow>
            <DefRow term="Object"><span class="mono">{entry.data.object_kind} {entry.data.object_reference}</span></DefRow>
            <DefRow term="Outcome">{entry.data.refused ? 'refused' : 'recorded'}</DefRow>
            <DefRow term="Digest"><span class="mono" style="word-break:break-all">{entry.data.digest}</span></DefRow>
            <DefRow term="Previous digest"><span class="mono" style="word-break:break-all">{entry.data.prev_digest}</span></DefRow>
            <DefRow term="Content">
              {entry.data.content_deleted
                ? entry.data.statement
                : <span class="mono" style="word-break:break-word">{JSON.stringify(entry.data.content)}</span>}
            </DefRow>
          </dl>
        )}
        {retention.data && (
          <>
            <h2 class="h4" style="margin-top:2rem">
              <Icon name="lock" label="Retention" />
            </h2>
            <dl class="def">
              <DefRow term="Scheme requirement">{retention.data.scheme_months} months, to <span class="mono">{retention.data.scheme_until}</span></DefRow>
              <DefRow term="Statutory requirement">{retention.data.statutory_months} months, to <span class="mono">{retention.data.statutory_until}</span></DefRow>
              <DefRow term="Referenced until">{retention.data.referenced_until ? <span class="mono">{retention.data.referenced_until}</span> : 'no figure references this entry'}</DefRow>
              <DefRow term="Retain until">
                <span class="mono">{retention.data.retain_until}</span>{' '}
                <span class="body-small">— {retention.data.derivation?.retain_until}</span>
              </DefRow>
              <DefRow term="Legal hold">
                {retention.data.legal_hold
                  ? <><StateWord strong>Legal hold stands</StateWord> <span class="body-small">A record under hold refuses deletion.</span></>
                  : 'none'}
              </DefRow>
            </dl>
          </>
        )}
      </div>
    </>
  );
}

export function Reconciliation() {
  const recon = useApi('/reconciliation');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const r = recon.data;
  void tick;
  return (
    <>
      <Meta title="Reconciliation — Ravel" description="Six figures, not six verdicts." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Reconciliation">
          <p>Six figures rather than six verdicts. This is a screen of numbers expected to
          be non-zero. None is a badge and none is styled as passing.</p>
        </Head>
        {recon.loading && <Loading what="the reconciliation figures" />}
        {recon.error && <Refusal error={recon.error} title="The figures could not be read" />}
        {r && (
          <>
            <div class="card" style="margin-bottom:1.5rem">
              <p class="eyebrow">Headline</p>
              <p class="figure-big" style="margin:0">{grams(r.mass_balance_residual_g)}</p>
              <p class="body-small" style="margin:0.5rem 0 0">
                Mass balance residual. {r.derivation?.mass_balance_residual_g}.
              </p>
            </div>
            <div class="figure-rows">
              <div class="figure-row">
                <span>Credit margin</span>
                <span class="figure figure-value">{grams(r.credit_margin_g)}</span>
              </div>
              <div class="figure-row">
                <span>Consumptions on open runs</span>
                <span class="figure figure-value">{r.consumptions_on_open_runs}</span>
              </div>
              <div class="figure-row">
                <span>Batches with broken custody</span>
                <span class="figure figure-value">{r.batches_with_broken_custody}</span>
              </div>
              <div class="figure-row">
                <span>Certificates with superseded figures</span>
                <span class="figure figure-value">{r.certificates_with_superseded_figures}</span>
              </div>
            </div>
            <h2 class="h4" style="margin-top:2rem">Integration ages</h2>
            <p class="body-small">
              A source that stops sending is detected by the age of its most recent record
              rather than by an error. A source that has never sent reads as never sent.
            </p>
            <Table
              caption="Integration ages"
              columns={[
                { key: 'source', label: 'Source', render: (x) => words(x.source) },
                {
                  key: 'age',
                  label: 'Age of the most recent record',
                  numeric: true,
                  render: (x) => (x.age_hours === null ? 'never sent' : `${x.age_hours} h`),
                },
                { key: 'last', label: 'Last received', render: (x) => <span class="mono">{x.last_received_at || '—'}</span> },
              ]}
              rows={r.integration_ages.map((x) => ({ ...x, key: x.source }))}
              empty="No inbound source is configured."
            />
            <p class="body-small" style="margin-top:1rem">
              Read at <span class="mono">{r.read_at}</span>, refreshed every minute.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function Login() {
  // Sign-in navigates the whole document, so the top bar reads the new session.
  const [form, setForm] = useState({ email: '', password: '' });
  const [state, setState] = useState({ status: 'idle', error: null });
  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'signing', error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = new Error(body.message || 'Sign-in failed');
        err.body = body;
        throw err;
      }
      localStorage.setItem('ravel.session', JSON.stringify(body));
      const next = new URLSearchParams(location.search).get('next') || '/console';
      // One navigation, not two: the top bar reads the session at mount, so a
      // full navigation is the honest one.
      location.assign(next);
    } catch (error) {
      setState({ status: 'failed', error });
    }
  };
  return (
    <>
      <Meta title="Sign in — Ravel" description="Sign in to the Ravel console." noindex />
      <div class="page" style="max-width:34rem;padding-top:3rem">
        <Head eyebrow="Console" title="Sign in">
          <p>Signup is closed. The console is reached only with a session.</p>
        </Head>
        <form class="sheet stack" onSubmit={submit} novalidate>
          <div>
            <label class="label" for="email">Email address</label>
            <input id="email" type="email" autocomplete="username" required
              value={form.email} onInput={(e) => setForm({ ...form, email: e.currentTarget.value })} />
          </div>
          <div>
            <label class="label" for="password">Password</label>
            <input id="password" type="password" autocomplete="current-password" required
              value={form.password} onInput={(e) => setForm({ ...form, password: e.currentTarget.value })} />
          </div>
          <div>
            <button class="btn btn-primary" type="submit" disabled={state.status === 'signing'}>
              {state.status === 'signing' ? 'Signing in…' : 'Sign in'} <span class="arrow">→</span>
            </button>
          </div>
          {state.status === 'failed' && <Refusal error={state.error} title="Sign-in was refused" />}
        </form>
        <p class="body-small" style="margin-top:1.5rem">
          A session lasts twelve hours from issue. There is no signup, no password reset and
          no self-service account creation.
        </p>
      </div>
    </>
  );
}

export { Head, grams, kilograms, kwh, mgPerKg, basisPoints, words, CarbonFigure, ContentFigure };

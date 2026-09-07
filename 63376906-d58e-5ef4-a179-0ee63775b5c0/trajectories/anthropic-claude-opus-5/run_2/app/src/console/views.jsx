import { useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useResource, ReadAt, Derivation } from './shared.jsx';
import { Link, useMeta } from '../lib/router.jsx';
import {
  Loading, Empty, Word, Refusal, Reveal, Mark, RecycledContent, CarbonFigure, EnergyPanel,
} from '../components/common.jsx';
import { grams, basisPoints, words, date, dateTime, hours, kilograms, percentFromBp } from '../lib/format.js';

/* ---------------------------------------------------------------- intake */
export function Intake() {
  useMeta('Ravel — Intake', 'Feedstock arrival: the batch register.', { noindex: true });
  const batches = useResource('/batches');
  const collectors = useResource('/collectors');

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Feedstock arrival</p>
      <Reveal as="h1" class="t-h3">Intake</Reveal>
      <p class="note" style="max-width:44rem">
        A batch resolves its claimability against the collector approval in force on its receipt
        date, never a current flag. The category is required at intake and can never be changed
        after acceptance.
      </p>

      <section>
        <h2 class="t-h4">Batches</h2>
        {batches.loading && <Loading what="the batch register" />}
        {batches.data?.length === 0 && <Empty>No batch has been booked in.</Empty>}
        {batches.data?.length > 0 && (
          <div class="scroll-x">
            <table>
              <thead>
                <tr><th>Batch</th><th>Collector</th><th>Category</th><th>Received</th>
                  <th class="num">Net</th><th class="num">Dry mass</th><th>Claim</th><th>Flags</th></tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.reference}>
                    <td class="mono">
                      <Link href={`/console/batches/${b.reference}`}>{b.reference}</Link>
                    </td>
                    {/* The name the collector held on this batch's receipt date. */}
                    <td>{b.collector_name} <span class="mono note">{b.collector}</span></td>
                    <td>{words(b.category)}</td>
                    <td class="mono">{date(b.received_on)}</td>
                    <td class="num mono">{grams(b.net_g)}</td>
                    <td class="num mono">{grams(b.dry_mass_g)}</td>
                    <td>
                      {b.claimable
                        ? <Word quiet>claimable</Word>
                        : <Word>non-claimable</Word>}
                    </td>
                    <td>
                      {b.flags.length === 0 ? <span class="note">none</span> : b.flags.map((f) => (
                        <span key={f} style="display:block;margin-bottom:.2rem">
                          <Word><Mark kind={f.includes('calibration') ? 'warning' : 'flag'} label={words(f)} /></Word>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 class="t-h4">Collectors</h2>
        {collectors.loading && <Loading what="the collectors" />}
        {collectors.data?.map((col) => (
          <article key={col.reference} class="sheet" style="margin-bottom:1rem">
            <div class="spread">
              <h3 class="t-h4" style="margin:0">{col.name} <span class="mono note">{col.reference}</span></h3>
              <p class="note mono" style="margin:0">
                {col.country} · {col.registration} · expires {date(col.registration_expiry)}
              </p>
            </div>
            <hr class="hairline" />
            <p class="label" style="margin:0 0 .5rem">Approval periods</p>
            <div class="scroll-x">
              <table>
                <thead><tr><th>State</th><th>From</th><th>To</th><th>Condition</th></tr></thead>
                <tbody>
                  {col.approval_periods.map((ap) => (
                    <tr key={ap.reference}>
                      <td><Word quiet={ap.state === 'approved'}>{words(ap.state)}</Word>
                        {ap.expiring && <> <Word>expiring</Word></>}</td>
                      <td class="mono">{date(ap.valid_from)}</td>
                      <td class="mono">{date(ap.valid_to)}</td>
                      <td>
                        {ap.condition
                          ? <>{ap.condition} <span class="note mono">by {date(ap.condition_closes_on)}</span></>
                          : <span class="note">none</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {col.findings.length > 0 && (
              <>
                <p class="label" style="margin:1rem 0 .5rem">Findings</p>
                <ul style="margin:0">
                  {col.findings.map((f) => (
                    <li key={f.reference}>
                      <span class="mono">{f.reference}</span> <Word quiet={f.state !== 'open'}>{words(f.state)}</Word>
                      {' — '}{f.detail}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

export function BatchDetail({ reference }) {
  useMeta(`Ravel — ${reference}`, 'One batch.', { noindex: true });
  const batch = useResource(`/batches/${reference}`);
  const b = batch.data;
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Batch</p>
      <Reveal as="h1" class="t-h3 mono">{reference}</Reveal>
      {batch.loading && <Loading what="this batch" />}
      {b && (
        <>
          {!b.claimable && (
            <div class="banner" role="status">
              <p class="label" style="margin:0 0 .35rem">Not claimable</p>
              <p style="margin:0">
                {b.claimable_reason === 'custody_link_missing'
                  ? `This batch cannot be claimed: ${words(b.claimable_missing_kind)}.`
                  : `This collector's approval lapsed on ${date(b.approval_valid_to)}. Material received after that date is processed but not claimed.`}
              </p>
            </div>
          )}
          {b.flags.includes('lapsed_calibration') && (
            <div class="banner" role="status">
              <p class="label" style="margin:0 0 .35rem">
                <Mark kind="warning" label="Lapsed calibration" />
              </p>
              <p style="margin:0">
                The weighing device <span class="mono">{b.device}</span> was last calibrated on{' '}
                <span class="mono">{date(b.device_calibrated_on)}</span>, more than twelve months
                before this receipt. This flag is repeated on every lot this batch reaches.
              </p>
            </div>
          )}

          <section class="sheet">
            <dl style="margin:0">
              <Row label="Collector, as named on the receipt date"
                value={<>{b.collector_name} <span class="mono note">{b.collector}</span></>} />
              <Row label="Site" value={<span class="mono">{b.site}</span>} />
              <Row label="Category" value={<Word quiet>{words(b.category)}</Word>} />
              <Row label="Received on" value={<span class="mono">{date(b.received_on)}</span>} />
              <Row label="Gross" value={<span class="figure">{grams(b.gross_g)}</span>} />
              <Row label="Tare" value={<span class="figure">{grams(b.tare_g)}</span>} />
              <Row label="Net" value={<span class="figure">{grams(b.net_g)}</span>} />
              <Row label="Moisture" value={<span class="figure">{basisPoints(b.moisture_bp)}</span>} />
              <Row label="Dry mass" value={<span class="figure"><strong>{grams(b.dry_mass_g)}</strong></span>} />
              <Row label="Accepted" value={<span class="figure">{grams(b.accepted_g)}</span>} />
              <Row label="Rejected" value={<span class="figure">{grams(b.rejected_g)}</span>} />
              {b.rejected_destination && (
                <Row label="Rejected mass went to" value={b.rejected_destination} />
              )}
              <Row label="Claimable from"
                value={b.claimable_from ? <span class="mono">{date(b.claimable_from)}</span> : 'not claimable'} />
            </dl>
            <Derivation derivation={b.derivation} />
          </section>

          <section class="sheet">
            <h2 class="t-h4">Custody</h2>
            {b.custody.length === 0 && <Empty>No custody link has been recorded.</Empty>}
            <div class="scroll-x">
              <table>
                <thead><tr><th>Kind</th><th>Date</th><th>Party</th><th>Arrived</th></tr></thead>
                <tbody>
                  {b.custody.map((l) => (
                    <tr key={l.kind}>
                      <td>{words(l.kind)}</td>
                      <td class="mono">{date(l.date)}</td>
                      <td>{l.party}</td>
                      <td>{l.late ? <><span class="mono">{date(l.arrived_on)}</span> <Word>late</Word></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {b.missing_custody_kinds.length > 0 && (
              <p style="margin:1rem 0 0">
                Missing: {b.missing_custody_kinds.map((k) => <Word key={k}>{words(k)}</Word>)}
              </p>
            )}
          </section>

          <section class="sheet">
            <h2 class="t-h4">Composition and contamination</h2>
            <dl style="margin:0">
              <Row label="Polymer" value={<span class="mono">{b.composition.polymer}</span>} />
              <Row label="Declared fraction" value={<span class="figure">{basisPoints(b.composition.fraction_bp)}</span>} />
              {b.composition.measured_fraction_bp !== undefined && (
                <Row label="Measured fraction"
                  value={<span class="figure">{basisPoints(b.composition.measured_fraction_bp)}</span>} />
              )}
              <Row label="Basis" value={words(b.composition.basis)} />
              <Row label="Non-nylon" value={<span class="figure">{basisPoints(b.contamination.non_nylon_bp)}</span>} />
              <Row label="Elastane" value={<span class="figure">{basisPoints(b.contamination.elastane_bp)}</span>} />
              <Row label="Coatings" value={b.contamination.coatings} />
              <Row label="Colour load" value={b.contamination.colour_load} />
              <Row label="Foreign matter" value={b.contamination.foreign_matter} />
            </dl>
          </section>

          <p>
            <Link href={`/console/batches/${reference}/impact`}>
              <Mark kind="arrow" label="Run the reverse traversal from this batch" />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ lots */
export function LotList() {
  useMeta('Ravel — Lots', 'The lot register.', { noindex: true });
  const lots = useResource('/lots');
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Operational record</p>
      <Reveal as="h1" class="t-h3">Lots</Reveal>
      {lots.loading && <Loading what="the lot register" />}
      {lots.data?.length === 0 && <Empty>No lot has been produced.</Empty>}
      {lots.data?.length > 0 && (
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Lot</th><th>Site</th><th class="num">Mass</th><th>Recycled content</th>
                <th>Disposition</th><th>Flags</th><th></th></tr>
            </thead>
            <tbody>
              {lots.data.map((l) => (
                <tr key={l.reference}>
                  <td class="mono">{l.reference}</td>
                  <td class="mono">{l.sites_named.join(', ')}</td>
                  <td class="num mono">{grams(l.mass_g)}</td>
                  <td><RecycledContent content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                  <td><Word quiet={l.disposition === 'released'}>{words(l.disposition)}</Word></td>
                  <td>
                    {l.open_deviations.length > 0 && <Word>deviation open</Word>}
                    {l.overrides.some((o) => !o.reviewed) && <Word>override unreviewed</Word>}
                    {l.flags.map((f) => (
                      <span key={f} style="display:block"><Word>{words(f)}</Word></span>
                    ))}
                  </td>
                  <td><Link href={`/console/lots/${l.reference}/genealogy`}>Genealogy</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the record */
export function RecordView() {
  useMeta('Ravel — The record', 'Every act is an entry.', { noindex: true });
  const record = useResource('/record');
  const check = useResource('/record/check');
  const [filter, setFilter] = useState('');
  const entries = (record.data || []).filter((e) =>
    !filter || `${e.action} ${e.object_ref} ${e.actor}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Operational record</p>
      <Reveal as="h1" class="t-h3">The record</Reveal>
      <p class="note" style="max-width:44rem">
        Every act is an entry with the person, the moment, the site and the object. No entry is
        edited and none is removed; a correction is a new entry naming what it corrects. A refusal
        is recorded as well as a success.
      </p>

      {check.data && (
        <div class="banner" role="status">
          <p class="label" style="margin:0 0 .35rem">Digest chain</p>
          <p style="margin:0">
            <Word>{check.data.holds ? 'chain holds' : 'chain does not hold'}</Word>{' '}
            across <span class="figure">{check.data.entries}</span> entries.
            {check.data.first_failure && (
              <> First failure at sequence <span class="mono">{check.data.first_failure.seq}</span>:{' '}
                {words(check.data.first_failure.kind)}.</>
            )}
          </p>
        </div>
      )}

      <label class="field no-print" style="max-width:26rem">
        <span class="label">Filter by action, object or person</span>
        <input value={filter} onInput={(e) => setFilter(e.target.value)} />
      </label>

      {record.loading && <Loading what="the record" />}
      {record.data && entries.length === 0 && <Empty>No entry matches that filter.</Empty>}
      {entries.length > 0 && (
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th class="num">Seq</th><th>Moment</th><th>Person</th><th>Site</th>
                <th>Act</th><th>Object</th><th>Outcome</th><th>Digest</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.seq}>
                  <td class="num mono">{e.seq}</td>
                  <td class="mono">{dateTime(e.ts)}</td>
                  <td class="mono">{e.actor}</td>
                  <td class="mono">{e.site || '—'}</td>
                  <td>{words(e.action)}</td>
                  <td class="mono">{e.object_ref || '—'}</td>
                  <td>{e.outcome === 'refused' ? <Word>refused</Word> : <Word quiet>success</Word>}</td>
                  <td class="mono note" style="max-width:9rem;overflow:hidden;text-overflow:ellipsis">
                    {e.digest.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- the reconciliation */
export function Reconciliation() {
  useMeta('Ravel — Reconciliation', 'Six figures, not six verdicts.', { noindex: true });
  const recon = useResource('/reconciliation');
  const r = recon.data;
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Reconciliation</p>
      <Reveal as="h1" class="t-h3">Six figures</Reveal>
      <p class="note" style="max-width:44rem">
        These are figures rather than verdicts. None is a badge and none is styled as passing.
        This is a screen of numbers expected to be non-zero.
      </p>
      {recon.loading && <Loading what="the reconciliation" />}
      {r && (
        <>
          <section class="sheet">
            <h2 class="t-h4">Mass balance residual</h2>
            <p class="figure t-h4" style="margin:0">{grams(r.mass_balance_residual_g)}</p>
            <p class="note" style="margin:.35rem 0 0">
              Sum over runs of mass in minus mass out minus recorded losses.
            </p>
          </section>
          <section class="sheet">
            <dl style="margin:0">
              <Row label="Credit margin" value={<span class="figure">{grams(r.credit_margin_g)}</span>} />
              <Row label="Consumptions on open runs" value={<span class="figure">{r.consumptions_on_open_runs}</span>} />
              <Row label="Batches with broken custody" value={<span class="figure">{r.batches_with_broken_custody}</span>} />
              <Row label="Certificates with superseded figures"
                value={<span class="figure">{r.certificates_with_superseded_figures}</span>} />
            </dl>
          </section>
          <section class="sheet">
            <h2 class="t-h4">Integration ages</h2>
            <p class="note">
              A source that stops sending is detected by the age of its most recent record rather
              than by an error. A source that has never sent reads as never sent.
            </p>
            <div class="scroll-x">
              <table>
                <thead><tr><th>Source</th><th class="num">Age</th><th>Last received</th></tr></thead>
                <tbody>
                  {r.integration_ages.map((s) => (
                    <tr key={s.source}>
                      <td>{words(s.source)}</td>
                      <td class="num mono">{hours(s.age_hours)}</td>
                      <td class="mono">{s.last_received_at ? dateTime(s.last_received_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <Derivation derivation={r.derivation} />
          <ReadAt at={r.read_at} />
        </>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div class="figure-row">
      <dt class="label" style="margin:0">{label}</dt>
      <dd style="margin:0;grid-column:span 2">{value}</dd>
    </div>
  );
}

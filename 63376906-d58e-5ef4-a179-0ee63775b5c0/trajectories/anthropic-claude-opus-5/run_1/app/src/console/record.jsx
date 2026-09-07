import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useFetch } from './console.jsx';
import { State, Empty, Loading, Refusal, Mark, formatInt, formatBp } from '../components/ui.jsx';

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
  'refused_allocations', 'collector_declaration_departures', 'acts_by_person',
  'exports_by_auditor',
];

export function RecordView() {
  const entries = useFetch('/record');
  const chain = useFetch('/record/check');
  const [query, setQuery] = useState(null);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (name) => {
    setQuery(name); setBusy(true); setRows(null);
    try { setRows(await api(`/record/queries/${name}`)); }
    catch { setRows([]); }
    finally { setBusy(false); }
  };

  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          The operational record
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          Every act is an entry with the person, the moment, the site and the object. No entry is
          edited and no entry is removed; a correction is a new entry naming what it corrects.
        </p>
      </section>

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The chain</h2>
        {chain.loading ? <Loading what="the digest chain" /> : null}
        {chain.data ? (
          <div class="stack-s" style="margin-top:0.75rem">
            <p>
              <State word={chain.data.holds ? 'the chain holds' : 'the chain does not hold'}
                     strong={!chain.data.holds} />
            </p>
            <p class="note mono">
              {chain.data.entries} entries · first prev_digest {chain.data.first_prev_digest}
            </p>
            {chain.data.first_failure ? (
              <Refusal title="The chain breaks.">
                <p class="mono">
                  At sequence {chain.data.first_failure.seq}: {chain.data.first_failure.reason}
                </p>
              </Refusal>
            ) : null}
          </div>
        ) : null}
      </section>

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
          The nine questions the record answers
        </h2>
        <p class="note" style="margin-top:0.5rem">
          Each returns a complete set rather than a page of one.
        </p>
        <ul style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem">
          {QUERIES.map((q) => (
            <li key={q}>
              <button class="button button--quiet" onClick={() => run(q)}
                      aria-pressed={query === q ? 'true' : 'false'}>
                {q.replace(/_/g, ' ')}
              </button>
            </li>
          ))}
        </ul>
        {busy ? <Loading what="that answer" /> : null}
        {rows && rows.length === 0 ? (
          <div style="margin-top:1rem">
            <Empty>This question has no answers yet: the set is complete and it is empty.</Empty>
          </div>
        ) : null}
        {rows && rows.length > 0 ? (
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">{query}</caption>
              <thead>
                <tr>
                  {Object.keys(rows[0]).map((k) => (
                    <th scope="col" key={k}>{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {Object.keys(rows[0]).map((k) => (
                      <td class="mono" key={k}>
                        {typeof r[k] === 'object' && r[k] !== null
                          ? JSON.stringify(r[k]).slice(0, 90)
                          : String(r[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Every entry</h2>
        {entries.loading ? <Loading what="the record" /> : null}
        {entries.data && entries.data.length === 0 ? (
          <Empty>The record holds no entry yet.</Empty>
        ) : null}
        {entries.data && entries.data.length > 0 ? (
          <div class="scroller fade-top" style="margin-top:1rem;max-height:44rem;overflow-y:auto">
            <table>
              <caption class="visually-hidden">The append-only record</caption>
              <thead>
                <tr>
                  <th scope="col" class="num">Seq</th><th scope="col">Act</th>
                  <th scope="col">Person</th><th scope="col">Object</th>
                  <th scope="col">Outcome</th><th scope="col" class="num">Event at</th>
                  <th scope="col">Digest</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.map((e) => (
                  <tr key={e.seq}>
                    <td class="num">{e.seq}</td>
                    <td>{e.act.replace(/_/g, ' ')}</td>
                    <td class="note">{e.person || '—'}</td>
                    <td class="mono">{e.object_ref || '—'}</td>
                    <td>
                      <State word={e.outcome} strong={e.outcome === 'refused'} />
                      {e.content_deleted ? (
                        <span style="display:block;margin-top:0.3rem">
                          <State word="content deleted under retention" strong />
                        </span>
                      ) : null}
                    </td>
                    <td class="num">{e.event_at}</td>
                    <td class="mono note">{e.digest.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function Reconciliation() {
  const recon = useFetch('/reconciliation');
  const d = recon.data;
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          Reconciliation
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          Six figures rather than six verdicts. These are numbers expected to be non-zero, and
          none is a badge.
        </p>
      </section>
      {recon.loading ? <Loading what="the reconciliation" /> : null}
      {d ? (
        <>
          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Mass balance residual
            </h2>
            <p class="figure-value" style="font-size:var(--h4-size);line-height:var(--h4-line);margin-top:0.5rem">
              {formatInt(d.mass_balance_residual_g)} g
            </p>
          </section>
          <section class="section">
            <dl class="stack-s">
              <div class="balance-figure">
                <dt class="label" style="margin:0">Credit margin</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {formatInt(d.credit_margin_g)} g
                </dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Consumptions on open runs</dt>
                <dd class="balance-figure__value" style="margin:0">{d.consumptions_on_open_runs}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Batches with broken custody</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {d.batches_with_broken_custody_count}
                </dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Certificates with superseded figures</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {d.certificates_with_superseded_figures_count}
                </dd>
              </div>
            </dl>
            {d.batches_with_broken_custody.length ? (
              <ul class="stack-s" style="margin-top:1rem">
                {d.batches_with_broken_custody.map((b) => (
                  <li class="note" key={b.batch}>
                    <Link href={`/console/batches/${b.batch}`} class="mono">{b.batch}</Link>{' '}
                    — This batch cannot be claimed: {b.missing_custody_kind}.
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Integration ages
            </h2>
            <p class="note" style="margin-top:0.5rem">
              A source that stops sending is detected by the age of its most recent record rather
              than by an error.
            </p>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr><th scope="col">Source</th><th scope="col" class="num">Age, hours</th>
                      <th scope="col" class="num">Most recent</th></tr>
                </thead>
                <tbody>
                  {d.integration_ages.map((a) => (
                    <tr key={a.source}>
                      <td>{a.source.replace(/_/g, ' ')}</td>
                      <td class="num">
                        {a.age_hours === null
                          ? <State word="never sent" strong />
                          : formatInt(a.age_hours)}
                      </td>
                      <td class="num">{a.last_received_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section class="section">
            <p class="note">
              Read at <span class="mono">{d.read_at}</span>, which is the moment this read saw.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function LotList() {
  const lots = useFetch('/lots');
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          The lot register
        </h1>
      </section>
      <section class="section">
        {lots.loading ? <Loading what="the lot register" /> : null}
        {lots.data && lots.data.length === 0 ? <Empty>There is no lot yet.</Empty> : null}
        {lots.data && lots.data.length > 0 ? (
          <div class="scroller">
            <table>
              <caption class="visually-hidden">Every lot, with its claim and its flags</caption>
              <thead>
                <tr>
                  <th scope="col">Lot</th><th scope="col">Site</th>
                  <th scope="col" class="num">Mass</th><th scope="col">Disposition</th>
                  <th scope="col">Claim</th><th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {lots.data.map((l) => (
                  <tr key={l.reference}>
                    <td class="mono">
                      <Link href={`/console/lots/${l.reference}/genealogy`}>{l.reference}</Link>
                    </td>
                    <td class="mono">{(l.sites_named || [l.site]).join(', ')}</td>
                    <td class="num">{formatInt(l.mass_g)} g</td>
                    <td><State word={l.disposition} strong={l.disposition === 'quarantined'} /></td>
                    <td class="num">
                      {l.content_bp} bp
                      <span class="note" style="display:block">
                        {formatBp(l.content_bp)}, {l.claim_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span style="display:flex;flex-direction:column;gap:0.25rem">
                        {l.flags.map((f) => (
                          <State word={f.replace(/_/g, ' ')} strong key={f}>
                            <Mark kind="warning" label="" />
                          </State>
                        ))}
                        {l.unreviewed_overrides.map((o) => (
                          <State word="unreviewed override" strong key={o} />
                        ))}
                        {l.open_deviations.map((o) => (
                          <State word="open deviation" strong key={o} />
                        ))}
                        {l.provisional_factor ? <State word="provisional factor" strong /> : null}
                        {!l.flags.length && !l.unreviewed_overrides.length && !l.open_deviations.length
                          && !l.provisional_factor ? <span class="note">none</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// The record: entries, queries, exports, retention, legal holds.
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../../lib/api';
import { Loading, Empty, Banner } from '../../components/Figures';
import { Link, usePath } from '../../router';
import type { Me } from '../../lib/api';

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
  'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
];

export default function RecordView({ user }: { user: Me }) {
  const path = usePath();
  const parts = path.split('/');
  if (parts.length > 4 && parts[2] === 'record' && parts[3] === 'queries') {
    return <QueryResult name={decodeURIComponent(parts[4])} />;
  }
  return <RecordHome user={user} />;
}

function RecordHome({ user }: { user: Me }) {
  const [entries, setEntries] = useState<any[] | null>(null);
  const [check, setCheck] = useState<any>(null);
  const [exports_, setExports] = useState<any[] | null>(null);
  const [exportResult, setExportResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api<any[]>('/record').then(setEntries).catch((e) => setError(e.message));
    api<any>('/record/check').then(setCheck).catch(() => setCheck(null));
    api<any[]>('/exports').then(setExports).catch(() => setExports([]));
  };
  useEffect(refresh, []);

  const runExport = async () => {
    try {
      const r = await api<any>('/exports', {
        method: 'POST',
        body: { scope: { period: 'BP-DEMO-N6-2026H1', sites: user.sites, lots: ['LOT-N6-0001'], certificates: ['CERT-PILOT-000001', 'CERT-PILOT-000002'] } }
      });
      setExportResult(r);
      refresh();
    } catch (e) {
      setError((e as ApiError).message);
    }
  };

  return (
    <div class="console-shell">
      <h1>The record</h1>
      <p class="measure">Every act is an entry with the person, the moment, the site and the object. No entry is edited and no entry is removed; a correction is a new entry naming what it corrects.</p>
      {error ? <Banner kind="refused" title="Refused"><p>{error}</p></Banner> : null}
      {check ? (
        <Banner title={check.holds ? 'The digest chain verifies' : 'The digest chain does not verify'}>
          <p>{check.entries} entries. {check.holds ? 'Every digest matches the previous entry’s digest.' : `The first failure is at position ${check.first_failure}.`}</p>
        </Banner>
      ) : null}

      {user.role === 'auditor' ? (
        <section>
          <h2>Export</h2>
          <p class="label">Every export is itself an entry, including one that returns nothing.</p>
          <p><button class="button solid" onClick={runExport}>Export the seeded scope</button></p>
          {exportResult ? (
            <Banner title="Export recorded">
              <p>Reference <span class="mono">{exportResult.reference}</span>, digest <span class="mono">{String(exportResult.digest).slice(0, 16)}…</span>. The export carries the digests and anchor references of the entries in its scope, so a reader can establish its integrity without asking the producer anything.</p>
            </Banner>
          ) : null}
          {exports_ && exports_.length > 0 ? (
            <ul class="figure-list">
              {exports_.map((e) => (
                <li key={e.reference}><span class="mono">{e.reference} · {e.performed_by}</span><span class="figures">{e.result_count} results</span></li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2>The nine questions</h2>
        <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:0.75rem">
          {QUERIES.map((q) => (
            <li key={q} class="card" style="min-width:0;overflow-wrap:anywhere"><Link class="mono" style="overflow-wrap:anywhere" href={'/console/record/queries/' + q}>{q}</Link></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Entries</h2>
        {!entries ? <Loading what="The record" /> : entries.length === 0 ? <Empty what="entries" /> : (
          <div class="table-scroll">
            <table class="sheet">
              <thead>
                <tr><th scope="col" class="num">Seq</th><th scope="col">Act</th><th scope="col">Person</th><th scope="col">Object</th><th scope="col">Digest</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq}>
                    <td class="num">{e.seq}</td>
                    <td>{e.act}{e.legal_hold ? <span class="label"> · legal hold</span> : null}{e.content_deleted_on ? <span class="label"> · content deleted {String(e.content_deleted_on).slice(0, 10)}</span> : null}</td>
                    <td class="mono">{e.person || '—'}</td>
                    <td class="mono">{e.object_reference || '—'}</td>
                    <td class="mono">{String(e.digest).slice(0, 10)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function QueryResult({ name }: { name: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (name === 'lots_from_batch') qs.set('batch', 'BATCH-1001');
    if (name === 'certificates_on_period') qs.set('period', 'BP-PILOT-N6-2026H1');
    if (name === 'certificates_under_method_version') qs.set('method_version', 'CM-PA6 v2');
    if (name === 'allocations_in_final_fortnight') qs.set('period', 'BP-DEMO-N6-2026H1');
    if (name === 'acts_by_person') qs.set('person', 'quality@example.com');
    api<any[]>('/record/queries/' + name + (qs.toString() ? '?' + qs.toString() : ''))
      .then(setRows)
      .catch((e) => setError((e as ApiError).body));
  }, [name]);

  return (
    <div class="console-shell">
      <h1 class="mono" style="font-size:var(--step-h3-size)">{name}</h1>
      <p class="measure">A complete set rather than a page of one. This route refuses a page, a limit, an offset or a cursor parameter with 400.</p>
      {error ? <Banner kind="refused" title="Refused"><p>{error.message}</p></Banner> : null}
      {!rows ? <Loading what="The answer" /> : rows.length === 0 ? <Empty what="rows in this answer" /> : (
        <div class="table-scroll">
          <table class="sheet" style="min-width:0">
            <thead><tr>{Object.keys(rows[0]).map((k) => <th scope="col" key={k}>{k}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i}>{Object.keys(rows[0]).map((k) => <td key={k} class={typeof r[k] === 'number' ? 'num' : ''} style="overflow-wrap:anywhere">{typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '—')}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from 'preact/hooks';
import { useApi, useMeta, api, Link, words, dateOf, idempotencyKey } from '../lib.jsx';
import { Loading, Empty, Word, RefusalBanner, IconLock } from '../components/Bits.jsx';

const QUERIES = [
  'lots_from_batch',
  'certificates_on_period',
  'certificates_under_method_version',
  'lots_released_under_unreviewed_override',
  'allocations_in_final_fortnight',
  'refused_allocations',
  'collector_declaration_departures',
  'acts_by_person',
  'exports_by_auditor',
];

export function RecordView({ me }) {
  useMeta('Record — Ravel console', 'The append-only record, its digest chain, and the nine questions it answers.');
  const record = useApi('/record');
  const check = useApi('/record/check');
  const [query, setQuery] = useState(null);
  const queryResult = useApi(query ? `/record/queries/${query}` : null);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);

  const doExport = async () => {
    setError(null);
    try {
      const r = await api('/exports', { method: 'POST', body: {}, key: idempotencyKey('exp') });
      setExported(r);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <>
      <h1 class="display-2">The record</h1>
      <p class="note" style="margin-top:0.5rem">
        Every act is an entry with the person, the moment, the site and the object. A refusal is recorded as well as a
        success. No entry is edited and no entry is removed; a correction is a new entry naming what it corrects.
      </p>

      <section class="card" style="margin-top:1.5rem">
        <h2>The digest chain</h2>
        {check.loading ? <Loading what="the chain check" /> : null}
        {check.data ? (
          <>
            <p class="t-body-big" style="margin-top:0.5rem">
              {check.data.holds ? 'The chain holds.' : 'The chain does not hold.'}
            </p>
            {check.data.first_failure ? (
              <p class="note">
                It first breaks at sequence {check.data.first_failure.seq}: {words(check.data.first_failure.reason)}.
              </p>
            ) : (
              <p class="note">
                {check.data.entries} entries walked. Each digest is computed over the entry's own content and the previous
                entry's digest.
              </p>
            )}
          </>
        ) : null}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Export</h2>
        <p class="note">
          The scope is recorded before the read, the export is itself an entry, and an export that returns nothing is
          recorded too.
        </p>
        <p style="margin-top:0.75rem">
          <button type="button" class="btn" onClick={doExport}>
            Export the record in full <span class="arrow" aria-hidden="true">→</span>
          </button>
        </p>
        <div aria-live="polite">
          <RefusalBanner error={error} />
          {exported ? (
            <div class="banner" role="status">
              <h3>Exported as {exported.reference}</h3>
              <p>
                {exported.entries.length} entries, {exported.digests.length} digests with their anchor references,{' '}
                {exported.certificates.length} certificates and {exported.lots.length} lots. Read at {exported.read_at}.
              </p>
              <p class="note">{exported.integrity?.note}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section style="margin-top:2rem">
        <h2 class="display-2">The nine questions</h2>
        <p class="note">
          Each answers with a complete set rather than a page. Each refuses a page, a limit, an offset or a cursor.
        </p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem">
          {QUERIES.map((q) => (
            <button key={q} type="button" class="btn" aria-pressed={query === q} onClick={() => setQuery(query === q ? null : q)}>
              {words(q)}
            </button>
          ))}
        </div>
        {queryResult.loading ? <Loading what="the answer" /> : null}
        {queryResult.data ? (
          <div class="card" style="margin-top:1.25rem">
            <h3>{words(queryResult.data.query)}</h3>
            <p class="note">
              {queryResult.data.count} result{queryResult.data.count === 1 ? '' : 's'}, a complete set. Read at{' '}
              {queryResult.data.read_at}.
            </p>
            {queryResult.data.count === 0 ? (
              <p class="empty" style="margin-top:0.75rem">This question has no answer at the moment: the set is empty.</p>
            ) : (
              <div class="scroller" style="margin-top:0.75rem">
                <ResultTable rows={queryResult.data.results} />
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section style="margin-top:2rem">
        <h2 class="display-2">Entries</h2>
        {record.loading ? <Loading what="the record entries" /> : null}
        {record.error ? <Empty>The record could not be loaded.</Empty> : null}
        {record.data && !record.data.length ? <Empty>The record holds no entry.</Empty> : null}
        {record.data ? (
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">Every entry, with its sequence, its digest and the previous digest</caption>
              <thead>
                <tr>
                  <th scope="col" class="num">Seq</th>
                  <th scope="col">Act</th>
                  <th scope="col">Person</th>
                  <th scope="col">Moment</th>
                  <th scope="col">Object</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Digest</th>
                </tr>
              </thead>
              <tbody>
                {record.data.map((e) => (
                  <tr key={e.seq}>
                    <td class="num">{e.seq}</td>
                    <td>{words(e.act)}</td>
                    <td class="mono">{e.person || '—'}</td>
                    <td class="mono">{String(e.moment).slice(0, 19).replace('T', ' ')}</td>
                    <td class="mono">{e.object_ref || '—'}</td>
                    <td>
                      {e.outcome === 'refused' ? <Word firm>Refused</Word> : <Word quiet>Success</Word>}
                      {e.content_deleted ? <Word firm icon={<IconLock title="Content deleted" />}>Content deleted</Word> : null}
                    </td>
                    <td class="mono" title={e.digest}>{String(e.digest).slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

function ResultTable({ rows }) {
  if (!rows.length) return null;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <table>
      <caption class="visually-hidden">The complete answer</caption>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} scope="col">
              {words(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c} class="mono">
                {format(r[c])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function format(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? x.reference || x.number || JSON.stringify(x) : String(x))).join(', ') : 'none';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

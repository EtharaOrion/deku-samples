import { useState } from 'preact/hooks';
import { api, getUser } from '../../lib/api.js';
import { Loading, Empty, StateWord, useAsync, formatInt, Refusal } from '../../components/common.jsx';

const QUERIES = [
  ['lots_from_batch', 'Which lots came from a batch'],
  ['certificates_on_period', 'Which certificates rest on a period'],
  ['certificates_under_method_version', 'Which certificates were issued under a method version'],
  ['lots_released_under_unreviewed_override', 'Which lots were released under an unreviewed override'],
  ['allocations_in_final_fortnight', 'Which allocations landed in the final fortnight of a period'],
  ['refused_allocations', 'Which allocations were refused, and by what margin'],
  ['collector_declaration_departures', 'Where a collector\'s declaration departed from the measurement'],
  ['acts_by_person', 'What one person did'],
  ['exports_by_auditor', 'What an auditor exported, including the reads that returned nothing'],
];

export default function RecordView() {
  const [query, setQuery] = useState('refused_allocations');
  const entries = useAsync(() => api.get('/record'), []);
  const check = useAsync(() => api.get('/record/check'), []);
  const result = useAsync(() => api.get(`/record/queries/${query}`), [query]);
  const user = getUser();
  const canExport = (user?.roles || []).includes('auditor');

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">The record</h1>
      <p style={{ marginTop: '0.75rem' }}>
        Every act is an entry with the person, the moment, the site and the object. No entry is edited
        and none is removed; a correction is a new entry naming what it corrects. A refusal is
        recorded as well as a success.
      </p>

      <section className="section">
        <h2 className="t-h4">The digest chain</h2>
        {check.loading ? <Loading what="the chain check" /> : null}
        {check.data ? (
          <div style={{ marginTop: '1rem' }}>
            <StateWord>
              {check.data.holds ? 'The chain verifies' : 'The chain does not verify'}
            </StateWord>
            <p className="t-small" style={{ marginTop: '0.75rem' }}>
              {check.data.checked} entries walked. Each digest is computed over the entry's own content
              and the previous entry's digest.
              {check.data.first_failure
                ? ` It breaks at sequence ${check.data.first_failure.seq}: ${check.data.first_failure.reason.replace(/_/g, ' ')}.`
                : ' A gap in the sequence and a digest that does not verify are both reportable conditions; neither is present.'}
            </p>
          </div>
        ) : null}
      </section>

      <section className="section">
        <h2 className="t-h4">The nine questions the record answers</h2>
        <p className="t-small" style={{ marginTop: '0.5rem' }}>
          Each returns a complete set rather than a report somebody assembles, and each refuses a page,
          a limit, an offset or a cursor.
        </p>
        <div style={{ marginTop: '1rem', maxWidth: '34rem' }}>
          <label htmlFor="query" className="label">Question</label>
          <select id="query" value={query} onInput={(e) => setQuery(e.currentTarget.value)}>
            {QUERIES.map(([v, l]) => <option value={v} key={v}>{l}</option>)}
          </select>
        </div>

        {result.loading ? <Loading what="this answer" /> : null}
        {result.error ? <Refusal error={result.error} title="This query was refused" /> : null}
        {result.data && result.data.results.length === 0 ? (
          <Empty>This question has no answers in the record at the moment. That is itself the answer.</Empty>
        ) : null}
        {result.data && result.data.results.length ? (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(flatten(result.data.results[0])).map((k) => (
                    <th scope="col" key={k}>{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.results.map((row, i) => {
                  const flat = flatten(row);
                  return (
                    <tr key={i}>
                      {Object.entries(flat).map(([k, v]) => (
                        <td key={k} className={typeof v === 'number' ? 'num' : ''}>{renderCell(v)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {result.data?.note ? (
          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>{result.data.note}</p>
        ) : null}
      </section>

      <section className="section">
        <h2 className="t-h4">Every entry</h2>
        {entries.loading ? <Loading what="the record" /> : null}
        {entries.error ? <Empty>The record could not be read.</Empty> : null}
        {entries.data && entries.data.length === 0 ? <Empty>The record holds no entries.</Empty> : null}
        {entries.data && entries.data.length ? (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col" className="num">Seq</th>
                  <th scope="col">At</th>
                  <th scope="col">Person</th>
                  <th scope="col">Site</th>
                  <th scope="col">Object</th>
                  <th scope="col">Action</th>
                  <th scope="col">Digest</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.map((e) => (
                  <tr key={e.seq}>
                    <td className="num">{e.seq}</td>
                    <td className="mono">{String(e.at).slice(0, 19).replace('T', ' ')}</td>
                    <td className="t-small">{e.person || '—'}</td>
                    <td className="mono">{e.site || '—'}</td>
                    <td>
                      <span className="t-small" style={{ color: 'var(--muted)' }}>{e.object_kind}</span>
                      <br />
                      <span className="mono">{e.object_ref || '—'}</span>
                    </td>
                    <td>
                      {e.action.replace(/_/g, ' ')}
                      {e.content_deleted ? (
                        <div style={{ marginTop: '0.25rem' }}>
                          <StateWord icon="lock">Content deleted under retention</StateWord>
                        </div>
                      ) : null}
                    </td>
                    <td className="mono" style={{ fontSize: 'var(--step-eyebrow-size)', lineHeight: 'var(--step-eyebrow-lh)' }}>
                      {String(e.digest).slice(0, 12)}…
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

function flatten(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) continue;
    out[k] = v;
  }
  return out;
}

function renderCell(v) {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return formatInt(v);
  return String(v);
}

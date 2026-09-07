import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, words, Refusal } from '../ui.jsx';

const QUERIES = [
  ['lots_from_batch', 'Which lots came from a batch'],
  ['certificates_on_period', 'Which certificates rest on a period'],
  ['certificates_under_method_version', 'Which certificates were issued under a method version'],
  ['lots_released_under_unreviewed_override', 'Which lots were released under an unreviewed override'],
  ['allocations_in_final_fortnight', 'Which allocations landed in a period\u2019s final fortnight'],
  ['refused_allocations', 'Which allocations were refused, and by what margin'],
  ['collector_declaration_departures', 'Where a collector\u2019s declaration departed from a sample'],
  ['acts_by_person', 'What one person did'],
  ['exports_by_auditor', 'What an auditor exported, including the reads that returned nothing'],
];

export default function RecordView({ session }) {
  const [query, setQuery] = useState(null);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const record = useAsync(() => api('/record'), []);
  const check = useAsync(() => api('/record/check'), []);
  const result = useAsync(() => (query ? api(`/record/queries/${query}`) : Promise.resolve(null)), [query]);

  async function doExport() {
    setBusy(true); setError(null);
    try {
      const r = await api('/exports', { body: { what: 'record' } });
      setExported(r);
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${r.reference}-record.json`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Record</p>
        <h1 class="t-h3">The operational record</h1>
        <p class="t-big">
          Every act is an entry with the person, the moment, the site and the object. A refusal is
          recorded as well as a success. No entry is edited and none is removed.
        </p>
        <p class="row">
          <button class="btn" type="button" onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export the record'} <span class="btn-arrow" aria-hidden="true">→</span>
          </button>
        </p>
      </div>

      <Refusal error={error} />

      {exported ? (
        <div class="banner" role="status">
          <p class="t-eyebrow">Exported</p>
          <p style="margin-bottom:0">
            Export <span class="mono">{exported.reference}</span> carries{' '}
            <span class="mono">{exported.entry_count}</span> entries with their digests and anchor
            references, so a reader can establish its integrity after it has left this system.
            The export is itself an entry.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="chain">
        <h2 id="chain" class="t-h4">The digest chain</h2>
        {check.loading ? <Loading what="the chain check" /> : null}
        {check.data ? (
          <p class="row" style="align-items:center">
            <StateWord
              word={check.data.holds ? 'Chain holds' : 'Chain does not hold'}
              heavy={!check.data.holds}
              icon={check.data.holds ? <Icon name="lock" label="Verified" /> : <Icon name="warning" label="Warning" />}
            />
            <span class="t-small mono">
              {check.data.entries} entries · read at {check.data.read_at}
            </span>
            {check.data.first_failure ? (
              <span class="t-small">
                First failure at sequence {check.data.first_failure.seq}: {words(check.data.first_failure.reason)}.
              </span>
            ) : null}
          </p>
        ) : null}
        <p class="t-small" style="color:var(--muted)">
          Each digest is computed over the entry's own content and the previous entry's digest.
          A gap in the sequence and a digest that does not verify are both reportable conditions.
        </p>
      </section>

      <section aria-labelledby="q" style="margin-top:2.5rem">
        <h2 id="q" class="t-h4">The nine questions the record exists to answer</h2>
        <p class="t-small" style="color:var(--muted)">
          Each returns a complete set rather than a report somebody assembles, and each refuses a
          page, a limit, an offset or a cursor.
        </p>
        <div class="row" style="gap:0.5rem">
          {QUERIES.map(([name, label]) => (
            <button
              key={name}
              type="button"
              class="btn btn-quiet"
              onClick={() => setQuery(name)}
              aria-pressed={query === name}
            >
              {label}
            </button>
          ))}
        </div>
        {query ? (
          <div style="margin-top:1.5rem">
            <h3 class="t-h4 mono">{query}</h3>
            {result.loading ? <Loading what="the answer" /> : null}
            {result.data && result.data.length === 0 ? (
              <Empty>This question has no answer in the record yet: the set is empty.</Empty>
            ) : null}
            {result.data && result.data.length > 0 ? (
              <div class="table-scroll">
                <table>
                  <caption>{result.data.length} rows. A complete set by contract.</caption>
                  <thead>
                    <tr>{Object.keys(result.data[0]).map((k) => <th scope="col" key={k}>{words(k)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <tr key={i}>
                        {Object.keys(result.data[0]).map((k) => (
                          <td key={k} class="mono t-small">
                            {typeof row[k] === 'object' ? JSON.stringify(row[k]) : String(row[k] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="entries" style="margin-top:2.5rem">
        <h2 id="entries" class="t-h4">Every entry</h2>
        {record.loading ? <Loading what="the record" /> : null}
        {record.data && record.data.length === 0 ? <Empty>The record is empty.</Empty> : null}
        {record.data && record.data.length > 0 ? (
          <div class="table-scroll">
            <table>
              <caption>
                {record.data.length} entries, in the order the acts happened. The first entry's
                previous digest is the sixty-four-character string of zeroes.
              </caption>
              <thead>
                <tr>
                  <th scope="col" class="num">Seq</th>
                  <th scope="col">Act</th>
                  <th scope="col">Person</th>
                  <th scope="col">Site</th>
                  <th scope="col">Object</th>
                  <th scope="col">At</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Digest</th>
                </tr>
              </thead>
              <tbody>
                {record.data.slice().reverse().map((e) => (
                  <tr key={e.seq}>
                    <td class="num">{e.seq}</td>
                    <td>{words(e.act)}</td>
                    <td class="t-small">{e.person}</td>
                    <td class="mono t-small">{e.site || '—'}</td>
                    <td class="mono t-small">{e.object_ref || '—'}</td>
                    <td class="mono t-small">{e.at}</td>
                    <td>
                      <StateWord word={words(e.outcome)} heavy={e.outcome === 'refused'} quiet={e.outcome === 'success'} />
                      {e.content_deleted_on ? (
                        <><br /><span class="t-small">{e.content_state}</span></>
                      ) : null}
                    </td>
                    <td class="mono t-small" style="word-break:break-all">{e.digest.slice(0, 16)}…</td>
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

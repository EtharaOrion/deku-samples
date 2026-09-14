import { useEffect, useState } from 'preact/hooks';
import { Loading, Empty, Banner } from '../components/Chrome.jsx';
import { api } from '../api.js';

const QUERIES = [
  ['lots_from_batch', 'Lots from a batch'],
  ['certificates_on_period', 'Certificates on a period'],
  ['certificates_under_method_version', 'Certificates under a method version'],
  ['lots_released_under_unreviewed_override', 'Lots released under an unreviewed override'],
  ['allocations_in_final_fortnight', 'Allocations in the final fortnight'],
  ['refused_allocations', 'Refused allocations'],
  ['collector_declaration_departures', 'Collector declaration departures'],
  ['acts_by_person', 'Acts by person'],
  ['exports_by_auditor', 'Exports by auditor']
];

export default function RecordView({ user }) {
  const [entries, setEntries] = useState(null);
  const [check, setCheck] = useState(null);
  const [query, setQuery] = useState(null);
  const [queryName, setQueryName] = useState(null);

  useEffect(() => {
    api('/api/record').then((r) => setEntries(r.ok ? r.data : []));
    api('/api/record/check').then((r) => setCheck(r.data));
  }, []);

  function runQuery(name) {
    setQueryName(name);
    setQuery(null);
    api('/api/record/queries/' + name).then((r) => setQuery(r.ok ? r.data : { error: r.data }));
  }

  return (
    <div>
      <h1 class="reveal">The record</h1>
      <p class="lede">Every act is an entry with the person, the moment, the site and the object. No entry is edited and none is removed.</p>

      {check && (
        <section class="card">
          <h3>Digest chain</h3>
          <p>{check.holds ? 'The chain holds.' : 'The chain is broken at position ' + check.first_failure + '.'} {check.entries} entries.</p>
        </section>
      )}

      <section>
        <h2>The nine questions</h2>
        <div class="query-list">
          {QUERIES.map(([id, label]) => (
            <button class={'btn btn-quiet' + (queryName === id ? ' btn-active' : '')} type="button" onClick={() => runQuery(id)}>{label}</button>
          ))}
        </div>
        {queryName && !query && <Loading>Running {queryName}…</Loading>}
        {query && query.error && <Banner kind="refused">The query could not run: {query.error.error || 'unknown'}</Banner>}
        {query && !query.error && (
          <div class="card">
            <h3>{queryName}</h3>
            {query.length === 0 ? <Empty>The complete set is empty.</Empty> : (
              <pre class="mono json">{JSON.stringify(query, null, 2)}</pre>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Entries</h2>
        {!entries && <Loading>Loading the record…</Loading>}
        {entries && entries.length === 0 && <Empty>The record is empty.</Empty>}
        {entries && entries.length > 0 && (
          <div class="table-wrap">
            <table class="spec">
              <caption>The append-only record</caption>
              <thead><tr><th scope="col">Seq</th><th scope="col">Act</th><th scope="col">Person</th><th scope="col">Object</th><th scope="col">Effective on</th><th scope="col">Digest</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr>
                    <td class="mono">{e.seq}</td>
                    <td>{e.act}{e.refused ? ' (refused)' : ''}</td>
                    <td class="mono">{e.person}</td>
                    <td class="mono">{e.object || ''}</td>
                    <td class="mono">{e.effective_on || ''}</td>
                    <td class="mono digest">{e.digest.slice(0, 12)}…</td>
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

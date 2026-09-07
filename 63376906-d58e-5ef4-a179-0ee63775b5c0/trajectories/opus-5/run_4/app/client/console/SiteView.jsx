import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, words, CapacityFigure } from '../ui.jsx';

export default function SiteView({ session, params }) {
  const reference = params.reference;
  const site = useAsync(() => api(`/sites/${reference}`), [reference]);
  const cap = useAsync(() => api(`/sites/${reference}/capacity`), [reference]);
  const certs = useAsync(() => api('/certificates'), [reference]);

  const s = site.data;
  const inWindow = (certs.data || []).filter((c) => c.site === reference);

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Site</p>
        <h1 class="t-h3 mono">{reference}</h1>
        {s ? <p class="t-big">{s.name}</p> : null}
      </div>

      {site.loading ? <Loading what="the site" /> : null}
      {site.error ? <Empty>This site could not be read.</Empty> : null}

      {s ? (
        <>
          <dl class="def">
            <dt>Name</dt><dd>{s.name}</dd>
            <dt>Confidence</dt>
            <dd>
              {words(s.confidence)}
              {s.confidence === 'planned' ? (
                <> <StateWord word="Planned" heavy icon={<Icon name="flag" label="Flag" />} /></>
              ) : null}
            </dd>
            <dt>Certification state</dt>
            <dd>
              <StateWord
                word={words(s.certification_state)}
                heavy={s.certification_state !== 'certified'}
              />
            </dd>
            <dt>Capacity</dt>
            <dd>
              {cap.data ? <CapacityFigure kg={cap.data.nameplate_kg} confidence={cap.data.confidence} /> : '—'}
            </dd>
            <dt>Contracted</dt>
            <dd class="mono">{s.contracted_kg.toLocaleString('en-GB')} kg/year</dd>
            <dt>Uncommitted</dt>
            <dd class="mono">
              {s.uncommitted_kg.toLocaleString('en-GB')} kg/year
              <span class="t-small" style="display:block;color:var(--muted)">
                Nameplate minus contracted, computed, and allowed to be negative.
              </span>
            </dd>
            <dt>Basis</dt><dd>{s.basis}</dd>
            <dt>Last revised</dt><dd class="mono">{s.last_revised}</dd>
          </dl>

          <section aria-labelledby="cp" style="margin-top:2.5rem">
            <h2 id="cp" class="t-h4">Certification periods</h2>
            <p class="t-small" style="color:var(--muted)">
              A site's certification is a dated period exactly as a collector's approval is, and an
              issuing condition resolves against the period in force on the date of signing rather
              than against a current flag.
            </p>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">State</th>
                    <th scope="col">Grade</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {s.certification_periods.map((p) => (
                    <tr key={p.reference}>
                      <th scope="row" class="mono">{p.reference}</th>
                      <td><StateWord word={words(p.state)} heavy={p.state === 'suspended'} /></td>
                      <td class="mono">{p.grade || 'all'}</td>
                      <td class="mono">{p.effective_from}</td>
                      <td class="mono">{p.effective_to || 'open'}</td>
                      <td class="t-small">{p.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="ce" style="margin-top:2.5rem">
            <h2 id="ce" class="t-h4">Certificates signed at this site</h2>
            {inWindow.length === 0 ? (
              <Empty>No certificate has been signed at this site.</Empty>
            ) : (
              <div class="table-scroll">
                <table>
                  <caption>
                    Where a suspension reaches backwards, every certificate signed inside its
                    window is enumerated here and individually resolved under the three restatement
                    outcomes.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Number</th>
                      <th scope="col">Signed</th>
                      <th scope="col">State</th>
                      <th scope="col">Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inWindow.map((c) => (
                      <tr key={c.number}>
                        <th scope="row" class="mono">
                          <a href={`/console/certificates/${c.number}`}>{c.number}</a>
                        </th>
                        <td class="mono t-small">{(c.signed_at || '').slice(0, 10)}</td>
                        <td><StateWord word={words(c.state)} heavy={c.state === 'withdrawn'} /></td>
                        <td>{c.recipient_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p class="t-small" style="margin-top:1rem;color:var(--muted)">
              Lifting a suspension restores issuing for this site from the moment the lift takes
              effect. It does not reinstate a withdrawn certificate: a withdrawal is a fact about a
              document, and the remedy is a new certificate.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

import { api } from '../api.js';
import {
  useAsync, Loading, Empty, StateWord, Icon, grams, words, ContentFigure, CarbonFigure,
} from '../ui.jsx';

export default function LotView({ session, params }) {
  const reference = params.reference;
  const lot = useAsync(() => api(`/lots/${reference}`), [reference]);
  const carbon = useAsync(() => api(`/lots/${reference}/carbon`).catch(() => null), [reference]);
  // A yield answers for plant operations, quality and the claims manager. The
  // screen does not ask for what the caller is not entitled to; the server
  // refuses it either way.
  const mayReadYield = (session?.roles || []).some((r) =>
    ['plant_operator', 'quality_manager', 'claims_manager', 'lab_analyst', 'auditor'].includes(r)
  );
  const yieldFig = useAsync(
    () => (mayReadYield ? api(`/lots/${reference}/yield`).catch(() => null) : Promise.resolve(null)),
    [reference, mayReadYield]
  );

  const l = lot.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Lot</p>
        <h1 class="t-h3 mono">{reference}</h1>
        <p class="row">
          <a class="btn btn-quiet" href={`/console/lots/${reference}/genealogy`}>Genealogy</a>
          <a class="btn btn-quiet" href={`/console/lots/${reference}/carbon`}>Carbon</a>
        </p>
      </div>

      {lot.loading ? <Loading what="the lot" /> : null}
      {lot.error ? <Empty>This lot could not be read.</Empty> : null}

      {l ? (
        <>
          {l.unreviewed_override_count ? (
            <div class="banner" role="alert">
              <p class="t-eyebrow">Override unreviewed</p>
              {l.overrides.filter((o) => !o.reviewed).map((o) => (
                <p key={o.reference} style="margin-bottom:0">
                  <strong>{o.statement}</strong> It broke the separation{' '}
                  <span class="mono">{o.separation}</span> and blocks signing until a second person
                  reviews it. <a href={`/console/overrides/${o.reference}`}>Open {o.reference}</a>.
                </p>
              ))}
            </div>
          ) : null}

          {l.open_deviation_count ? (
            <div class="banner" role="alert">
              <p class="t-eyebrow">Deviation open</p>
              {l.deviations.filter((d) => d.state === 'open').map((d) => (
                <p key={d.reference} style="margin-bottom:0">
                  <strong>{d.title}</strong>{' '}
                  <a href={`/console/deviations/${d.reference}`} class="mono">{d.reference}</a> is
                  open and touches this lot.
                </p>
              ))}
            </div>
          ) : null}

          {(l.flags || []).length ? (
            <div class="banner">
              <p class="t-eyebrow">Flagged</p>
              <p style="margin-bottom:0">
                <strong>{l.flags.join('; ')}.</strong> A flag on a batch is repeated on every lot
                downstream.
              </p>
            </div>
          ) : null}

          <dl class="def">
            <dt>Grade</dt><dd class="mono">{l.grade}</dd>
            <dt>Site</dt>
            <dd class="mono">
              {(l.sites_named || [l.site]).map((s) => (
                <><a href={`/console/sites/${s}`}>{s}</a> </>
              ))}
            </dd>
            <dt>Mass</dt><dd class="mono">{grams(l.mass_g)}</dd>
            <dt>Disposition</dt>
            <dd><StateWord word={words(l.disposition)} heavy={l.disposition !== 'released'} /></dd>
            <dt>Recycled content</dt>
            <dd><ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} /></dd>
            <dt>Credit attached</dt><dd class="mono">{grams(l.credit_attached_g)}</dd>
            <dt>Category split</dt>
            <dd class="mono">
              post-consumer {grams(l.category_split.post_consumer)} · pre-consumer {grams(l.category_split.pre_consumer)}
            </dd>
            <dt>Conversion factor</dt>
            <dd>
              {l.conversion_factor ? (
                <>
                  <span class="mono">{l.conversion_factor.reference} v{l.conversion_factor.version}</span>{' '}
                  at {l.conversion_factor.factor_bp} bp{' '}
                  {l.provisional_factor ? <StateWord word="Provisional" heavy /> : null}
                </>
              ) : '—'}
            </dd>
            <dt>Produced by</dt>
            <dd class="mono">
              {l.produced_by ? <a href={`/console/runs/${l.produced_by}`}>{l.produced_by}</a> : 'a blend'}
            </dd>
            <dt>Carbon</dt>
            <dd>{carbon.data && !carbon.data.mismatch ? <CarbonFigure carbon={carbon.data} /> : 'No figure.'}</dd>
            <dt>Derivation</dt>
            <dd class="t-small">{l.derivation.content_bp}</dd>
          </dl>

          {l.blended_from ? (
            <section aria-labelledby="bl" style="margin-top:2.5rem">
              <h2 id="bl" class="t-h4">Blended from</h2>
              <div class="table-scroll">
                <table>
                  <caption>
                    The resulting claim is computed by mass and takes the weaker of the two claim
                    types. Any non-claimable material in a blend dilutes the computed percentage.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Lot</th>
                      <th scope="col" class="num">Mass</th>
                      <th scope="col" class="num">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.blended_from.map((b) => (
                      <tr key={b.lot}>
                        <th scope="row" class="mono"><a href={`/console/lots/${b.lot}`}>{b.lot}</a></th>
                        <td class="num">{Number(b.mass_g).toLocaleString('en-GB')}</td>
                        <td class="num">{b.content_bp} bp</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="tr" style="margin-top:2.5rem">
            <h2 id="tr" class="t-h4">Test results</h2>
            {l.test_results.length === 0 ? (
              <Empty>No test result has been entered against this lot.</Empty>
            ) : (
              <div class="table-scroll">
                <table>
                  <caption>
                    A result produced by a method other than the one the specification names is
                    kept as evidence and never reaches a disposition.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Property</th>
                      <th scope="col">Method</th>
                      <th scope="col" class="num">Value</th>
                      <th scope="col">Unit</th>
                      <th scope="col" class="num">Uncertainty</th>
                      <th scope="col">Entered by</th>
                      <th scope="col">Usable for release</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.test_results.map((t) => (
                      <tr key={t.reference}>
                        <th scope="row">{words(t.property)}</th>
                        <td class="mono">{t.method}</td>
                        <td class="num">{t.value}</td>
                        <td>{t.unit}</td>
                        <td class="num">{t.uncertainty_bp} bp</td>
                        <td class="t-small">{t.entered_by}</td>
                        <td>
                          {t.usable_for_release
                            ? <StateWord word="Usable" quiet />
                            : <StateWord word="Method mismatch" heavy />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="ov" style="margin-top:2.5rem">
            <h2 id="ov" class="t-h4">Overrides on this lot, for its life</h2>
            {l.overrides.length === 0 ? (
              <Empty>No separation has been overridden on this lot.</Empty>
            ) : (
              l.overrides.map((o) => (
                <div class="sheet" key={o.reference} style="margin-bottom:1rem">
                  <p class="row" style="align-items:center">
                    <StateWord word={o.reviewed ? 'Reviewed' : 'Unreviewed'} heavy={!o.reviewed} />
                    <span class="mono">{o.reference}</span>
                  </p>
                  <p><strong>{o.statement}</strong></p>
                  <p class="t-small" style="margin-bottom:0">
                    Separation: <span class="mono">{o.separation}</span>. Reason: {o.reason}
                    {o.reviewed ? <> Reviewed by {o.reviewed_by}.</> : null}
                  </p>
                </div>
              ))
            )}
          </section>

          {yieldFig.data ? (
            <section aria-labelledby="y" style="margin-top:2.5rem">
              <h2 id="y" class="t-h4">Yield</h2>
              <p class="banner"><strong>{yieldFig.data.note}</strong></p>
              <p class="t-small" style="color:var(--muted)">
                A yield figure appears on no certificate, in no certificate document and in no
                verification answer. It answers for plant operations, quality and the claims
                manager only.
              </p>
              <div class="table-scroll">
                <table>
                  <caption>Per stage, and overall.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Run</th>
                      <th scope="col">Stage</th>
                      <th scope="col" class="num">Mass in</th>
                      <th scope="col" class="num">Mass out</th>
                      <th scope="col" class="num">Losses</th>
                      <th scope="col" class="num">Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yieldFig.data.stages.map((s) => (
                      <tr key={s.run}>
                        <th scope="row" class="mono"><a href={`/console/runs/${s.run}`}>{s.run}</a></th>
                        <td>{words(s.run_type)}</td>
                        <td class="num">{s.mass_in_g.toLocaleString('en-GB')}</td>
                        <td class="num">{s.mass_out_g.toLocaleString('en-GB')}</td>
                        <td class="num">{s.losses_g.toLocaleString('en-GB')}</td>
                        <td class="num">{s.yield_bp} bp</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" colSpan="2">Overall</th>
                      <td class="num">{yieldFig.data.mass_in_g.toLocaleString('en-GB')}</td>
                      <td class="num">{yieldFig.data.mass_out_g.toLocaleString('en-GB')}</td>
                      <td class="num">{yieldFig.data.losses_g.toLocaleString('en-GB')}</td>
                      <td class="num">{yieldFig.data.overall_yield_bp} bp</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

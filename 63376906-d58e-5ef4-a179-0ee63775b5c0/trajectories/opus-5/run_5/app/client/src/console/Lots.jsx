import { useState } from 'preact/hooks';
import { useApi, useMeta, api, Link, grams, bp, words, dateOf, idempotencyKey } from '../lib.jsx';
import { Loading, Empty, Word, StateWords, ContentFigure, CarbonFigure, EnergyPanel, IconFlag, IconArrow, IconWarning, RefusalBanner } from '../components/Bits.jsx';

export function LotIndex() {
  useMeta('Lots — Ravel console', 'The lot register.');
  const lots = useApi('/lots');
  return (
    <>
      <h1 class="display-2">Lots</h1>
      {lots.loading ? <Loading what="the lot register" /> : null}
      {lots.error ? <Empty>The lot register could not be loaded.</Empty> : null}
      {lots.data && !lots.data.length ? <Empty>No lot has been produced.</Empty> : null}
      <div class="grid-2" style="margin-top:1.5rem">
        {(lots.data || []).map((l) => (
          <Link key={l.reference} href={`/console/lots/${l.reference}`} class="card card-link">
            <div class="node-head">
              <span class="mono">{l.reference}</span>
              <StateWords
                flags={l.flags}
                disposition={l.disposition}
                deviationOpen={(l.open_deviations || []).length > 0}
                overrideUnreviewed={(l.unreviewed_overrides || []).length > 0}
              />
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {l.site} · grade {l.grade} · {grams(l.mass_g)}
            </p>
            <p style="margin-top:0.5rem">
              <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact />
            </p>
            {l.provisional_factor ? <p class="note">This lot rests on a provisional conversion factor.</p> : null}
          </Link>
        ))}
      </div>
    </>
  );
}

export function LotView({ reference, me }) {
  useMeta(`${reference} — Lot`, `The lot record for ${reference}.`);
  const lot = useApi(`/lots/${reference}`);
  const carbon = useApi(`/lots/${reference}/carbon`);
  const canYield = ['plant_operator', 'quality_manager', 'claims_manager', 'auditor'].some((r) => (me.roles || []).includes(r));
  const yieldQ = useApi(canYield ? `/lots/${reference}/yield` : null);

  if (lot.loading) return <Loading what="the lot record" />;
  if (lot.error) return <Empty>This lot could not be loaded. {lot.error.message}</Empty>;
  const l = lot.data;
  const openDevs = (l.deviations || []).filter((d) => d.state === 'open');
  const unrev = (l.overrides || []).filter((o) => !o.reviewed);

  return (
    <>
      <p class="t-eyebrow">Lot</p>
      <h1 class="display-2" style="margin-top:0.375rem">
        <span class="mono">{l.reference}</span>
      </h1>
      <p style="margin-top:0.75rem;display:flex;gap:0.375rem;flex-wrap:wrap">
        <StateWords flags={l.flags} disposition={l.disposition} deviationOpen={openDevs.length > 0} overrideUnreviewed={unrev.length > 0} />
      </p>
      <p class="t-body-small" style="margin-top:0.5rem">
        {l.site} · grade {l.grade} · {grams(l.mass_g)} · produced {dateOf(l.produced_on)} ·{' '}
        specification {l.specification} v{l.specification_version}
      </p>
      <p style="margin-top:0.75rem">
        <Link href={`/console/lots/${l.reference}/genealogy`} class="btn">
          <IconArrow title="Traversal direction" reverse /> Genealogy
        </Link>
      </p>

      {/* An override shows on the lot for its life. */}
      {(l.overrides || []).map((o) => (
        <div key={o.reference} class="banner" role="note">
          <h3>{o.reviewed ? 'Separation overridden, reviewed' : 'Separation overridden, unreviewed'}</h3>
          <p>
            Separation overridden by {o.authorised_by} on {dateOf(o.effective_on)}. This cannot be removed.
          </p>
          <p class="note">
            {words(o.separation)} — {o.reason}
          </p>
          {!o.reviewed ? <p class="note">A second person must review this before a certificate can be signed against this lot.</p> : null}
        </div>
      ))}

      {openDevs.map((d) => (
        <div key={d.reference} class="banner" role="note">
          <h3>Deviation open</h3>
          <p>
            <span class="mono">{d.reference}</span> — {d.detail}
          </p>
        </div>
      ))}

      <section class="card" style="margin-top:1.5rem">
        <h2>Claim</h2>
        <div style="margin-top:0.75rem">
          <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} category_split={l.category_split} />
        </div>
        <p class="note" style="margin-top:0.75rem">
          {l.derivation?.content_bp}. Credit attached {grams(l.credit_attached_g)} against a lot of {grams(l.mass_g)}.
        </p>
        {l.provisional_factor ? (
          <p class="note">
            This lot rests on the provisional conversion factor{' '}
            <span class="mono">{l.conversion_factor?.reference}</span>, and every certificate resting on it says so.
          </p>
        ) : null}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Carbon</h2>
        {carbon.loading ? <Loading what="the carbon figure" /> : null}
        {carbon.error ? (
          <p class="note">
            {carbon.error.body?.detail || 'No carbon figure exists for this lot, so no value is shown.'}
          </p>
        ) : null}
        {carbon.data ? (
          <>
            <div style="margin-top:0.75rem">
              <CarbonFigure carbon={carbon.data} />
            </div>
            <h3 style="margin-top:1.25rem">Breakdown</h3>
            <p class="note">A response carrying the aggregate value with no breakdown behind it does not exist inside this console.</p>
            <div class="scroller" style="margin-top:0.5rem">
              <table>
                <caption class="visually-hidden">One line per contribution, summing to the value</caption>
                <thead>
                  <tr>
                    <th scope="col">Line</th>
                    <th scope="col" class="num">mg per kg</th>
                    <th scope="col">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {(carbon.data.breakdown || []).map((b) => (
                    <tr key={b.line}>
                      <td>{words(b.line)}</td>
                      <td class="num">{Number(b.mg_per_kg).toLocaleString('en-GB')}</td>
                      <td>{words(b.tag)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" style="font-family:var(--serif);text-transform:none;letter-spacing:0;color:var(--ink);font-weight:600;font-size:var(--size-body-small)">
                      Sum
                    </th>
                    <td class="num">
                      <strong>{Number(carbon.data.breakdown_sum_mg_per_kg).toLocaleString('en-GB')}</strong>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="note" style="margin-top:0.75rem">
              Primary data share {bp(carbon.data.primary_share_bp)} against a threshold of {bp(carbon.data.primary_threshold_bp)}.{' '}
              {carbon.data.default_led ? 'This figure is default-led.' : 'This figure is not default-led.'}
              {carbon.data.cache_valid === false ? ' A cached input has been superseded, so this figure is not valid until it is recomputed as a recorded act.' : ''}
            </p>
            <div style="margin-top:1.25rem">
              <EnergyPanel carbon={carbon.data} />
            </div>
          </>
        ) : null}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Test results</h2>
        {(l.test_results || []).length ? (
          <div class="scroller" style="margin-top:0.75rem">
            <table>
              <caption class="visually-hidden">Test results against this lot</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Property</th>
                  <th scope="col">Method</th>
                  <th scope="col" class="num">Value</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Entered by</th>
                  <th scope="col">Usable</th>
                </tr>
              </thead>
              <tbody>
                {l.test_results.map((t) => (
                  <tr key={t.reference}>
                    <td class="mono">{t.reference}</td>
                    <td>{words(t.property)}</td>
                    <td class="mono">{t.method}</td>
                    <td class="num">{t.value}</td>
                    <td>{t.unit}</td>
                    <td class="mono">{t.entered_by}</td>
                    <td>
                      {t.usable_for_release ? <Word quiet>Usable for release</Word> : <Word firm>Method mismatch</Word>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="empty">No test result has been recorded against this lot.</p>
        )}
      </section>

      {canYield ? (
        <section class="card" style="margin-top:1.25rem">
          <h2>Yield</h2>
          <p class="note">
            A yield figure appears on no certificate, in no certificate document and in no verification answer. It answers
            here for plant operations, quality and the claims manager. Losses reduce the claim.
          </p>
          {yieldQ.loading ? <Loading what="the yield figures" /> : null}
          {yieldQ.data ? (
            <div class="scroller" style="margin-top:0.75rem">
              <table>
                <caption class="visually-hidden">Yield per run</caption>
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
                  {yieldQ.data.stages.map((s) => (
                    <tr key={s.run}>
                      <td>
                        <Link href={`/console/runs/${s.run}`} class="mono">{s.run}</Link>
                      </td>
                      <td>{words(s.run_type)}</td>
                      <td class="num">{s.mass_in_g.toLocaleString('en-GB')}</td>
                      <td class="num">{s.mass_out_g.toLocaleString('en-GB')}</td>
                      <td class="num">{s.losses_g.toLocaleString('en-GB')}</td>
                      <td class="num">{s.yield_bp} bp</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- genealogy */

export function Genealogy({ reference, me }) {
  useMeta(`${reference} — Genealogy`, `The genealogy of ${reference}, as a graph and as a nested list.`);
  const g = useApi(`/lots/${reference}/genealogy`);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);

  const doExport = async () => {
    setError(null);
    try {
      const r = await api('/exports', { method: 'POST', body: { lots: [reference] }, key: idempotencyKey('exp') });
      setExported(r);
    } catch (e) {
      setError(e);
    }
  };

  if (g.loading) return <Loading what="the genealogy" />;
  if (g.error) return <Empty>The genealogy could not be loaded. {g.error.message}</Empty>;
  const data = g.data;

  return (
    <>
      <p class="t-eyebrow">Genealogy</p>
      <h1 class="display-2" style="margin-top:0.375rem">
        <span class="mono">{reference}</span>
      </h1>
      <p class="note" style="margin-top:0.5rem">
        A graph rather than a tree. A batch reached by several paths is drawn once with its total mass, and every edge
        carries a mass rather than a percentage.
      </p>

      {data.flagged ? (
        <div class="banner" role="note">
          <h3>Something in this graph is flagged</h3>
          <p>
            A flag anywhere in the graph is visible from the lot without expanding anything.{' '}
            {[...new Set(data.nodes.flatMap((n) => n.flags || []))].map(words).join('; ')}.
          </p>
        </div>
      ) : (
        <p class="note">Nothing in this graph is flagged.</p>
      )}

      <p style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <button type="button" class="btn" onClick={doExport}>
          Export this genealogy <span class="arrow" aria-hidden="true">→</span>
        </button>
      </p>
      <div aria-live="polite">
        <RefusalBanner error={error} />
        {exported ? (
          <div class="banner" role="status">
            <h3>Exported</h3>
            <p>
              Export <span class="mono">{exported.reference}</span> carries {exported.entries.length} record entries,{' '}
              {exported.digests.length} digests and their anchor references, so a reader can establish its integrity after
              it has left this system. The export is itself an entry.
            </p>
            <p class="note">Chain at the moment of export: {exported.chain?.holds ? 'holds' : 'does not hold'}. Read at {exported.read_at}.</p>
          </div>
        ) : null}
      </div>

      {/* The graph. It becomes the nested list at the narrowest width, and both
          carry the same facts. */}
      <section style="margin-top:2rem" aria-labelledby="graph-h">
        <h2 id="graph-h" class="display-2">The graph</h2>
        <p class="note">Each node shows what it is, its mass, its category split and whether anything about it is flagged.</p>
        <div class="scroller" style="margin-top:1rem">
          <GraphTable nodes={data.nodes} edges={data.edges} />
        </div>
      </section>

      <section style="margin-top:2rem" aria-labelledby="list-h">
        <h2 id="list-h" class="display-2">The same facts as a nested list</h2>
        <p class="note">
          The list is not a summary; it is the same information in another form, and it is what an auditor exports.
        </p>
        <div style="margin-top:1rem">
          <NestedNode node={data.text_equivalent} />
        </div>
      </section>

      <p class="note" style="margin-top:2rem">Read at {data.read_at}.</p>
    </>
  );
}

function GraphTable({ nodes, edges }) {
  return (
    <table>
      <caption class="visually-hidden">Every node in the graph, with its mass, its category split and its flags</caption>
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Reference</th>
          <th scope="col" class="num">Mass</th>
          <th scope="col" class="num">Post-consumer</th>
          <th scope="col" class="num">Pre-consumer</th>
          <th scope="col" class="num">Non-claimable</th>
          <th scope="col">Flags</th>
          <th scope="col">Feeds</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((n) => {
          const out = edges.filter((e) => e.from === n.reference);
          return (
            <tr key={n.reference}>
              <td>{words(n.kind)}</td>
              <td class="mono">{n.reference}</td>
              <td class="num">{Number(n.mass_g).toLocaleString('en-GB')}</td>
              <td class="num">{Number(n.category_split?.post_consumer || 0).toLocaleString('en-GB')}</td>
              <td class="num">{Number(n.category_split?.pre_consumer || 0).toLocaleString('en-GB')}</td>
              <td class="num">{Number(n.category_split?.non_claimable || 0).toLocaleString('en-GB')}</td>
              <td>
                {(n.flags || []).length ? (
                  (n.flags || []).map((f) => (
                    <Word key={f} firm icon={<IconFlag title={words(f)} />}>
                      {words(f)}
                    </Word>
                  ))
                ) : (
                  <span class="note">none</span>
                )}
              </td>
              <td class="mono">
                {out.length ? out.map((e) => `${e.to} (${Number(e.mass_g).toLocaleString('en-GB')} g)`).join(', ') : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NestedNode({ node, depth = 0 }) {
  if (!node) return <p class="empty">This lot has no recorded inputs.</p>;
  return (
    <div>
      <div class="node-head">
        <span class="t-label-small muted">{words(node.kind)}</span>
        <span class="mono">{node.reference}</span>
        <span class="figure">{grams(node.mass_g)}</span>
        {(node.flags || []).map((f) => (
          <Word key={f} firm icon={<IconFlag title={words(f)} />}>
            {words(f)}
          </Word>
        ))}
      </div>
      <div class="note mono" style="margin-left:0.125rem">
        post-consumer {Number(node.category_split?.post_consumer || 0).toLocaleString('en-GB')} g · pre-consumer{' '}
        {Number(node.category_split?.pre_consumer || 0).toLocaleString('en-GB')} g · non-claimable{' '}
        {Number(node.category_split?.non_claimable || 0).toLocaleString('en-GB')} g
      </div>
      {(node.inputs || []).length ? (
        <ul class="node-list">
          {node.inputs.map((k) => (
            <li key={k.reference}>
              <NestedNode node={k} depth={depth + 1} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, bp, words, ContentFigure } from '../ui.jsx';

export default function Contracts({ session }) {
  const contracts = useAsync(() => api('/contracts'));

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Contracts</p>
        <h1 class="t-h3">The offtake floor</h1>
        <p class="t-big">
          Delivered, running content, the floor, and the average the remaining volume must reach.
          An unreachable floor is reported and never refused.
        </p>
      </div>

      {contracts.loading ? <Loading what="the contract projections" /> : null}
      {contracts.data && contracts.data.length === 0 ? <Empty>No contract is recorded.</Empty> : null}

      {contracts.data ? contracts.data.map((c) => (
        <section class="sheet" key={c.id} style="margin-bottom:1.5rem" aria-labelledby={`c-${c.id}`}>
          <div class="spread">
            <h2 id={`c-${c.id}`} class="t-h4 mono" style="margin:0">{c.id}</h2>
            <p class="row" style="margin:0">
              {/* The unreachable state is a word and a date, not a colour. */}
              <StateWord
                word={c.state === 'unreachable' ? 'Unreachable' : 'On track'}
                heavy={c.state === 'unreachable'}
              />
              {c.planned_site_flag ? (
                <StateWord word="Supplying site is planned" heavy icon={<Icon name="flag" label="Flag" />} />
              ) : null}
            </p>
          </div>

          {c.planned_site_flag ? (
            <p class="banner" style="margin-top:1rem">
              <strong>
                This contract is supplied from {c.site}, whose confidence is planned.
              </strong>{' '}
              This flag appears on every response this contract appears in and cannot be dismissed.
            </p>
          ) : null}

          {c.state === 'unreachable' ? (
            <p class="banner">
              <strong>
                The floor became unreachable on {c.unreachable_on || 'a date not recorded'}
                {c.unreachable_allocation ? <> at allocation {c.unreachable_allocation}</> : null}.
              </strong>{' '}
              This is reported rather than refused. The remaining volume would have to reach{' '}
              {bp(c.required_remaining_bp)}, which is above one hundred per cent.
            </p>
          ) : null}

          <div class="figure-rows" style="margin-top:1rem">
            <div class="figure-row">
              <p class="t-label" style="margin:0">Recipient and period</p>
              <p class="figure mono" style="margin:0">{c.recipient}</p>
              <p class="t-small" style="margin:0">{c.period}, from {c.site}</p>
            </div>
            <div class="figure-row">
              <p class="t-label" style="margin:0">Delivered</p>
              <p class="figure mono" style="margin:0">{c.delivered_kg.toLocaleString('en-GB')} kg</p>
              <p class="t-small" style="margin:0">of {c.committed_kg.toLocaleString('en-GB')} kg committed</p>
            </div>
            <div class="figure-row">
              <p class="t-label" style="margin:0">Running content</p>
              <p class="figure" style="margin:0">
                <ContentFigure content_bp={c.running_content_bp} claim_type={c.claim_type} compact />
              </p>
              <p class="t-small" style="margin:0">{c.derivation.running_content_bp}</p>
            </div>
            <div class="figure-row">
              <p class="t-label" style="margin:0">The floor</p>
              <p class="figure mono" style="margin:0">{bp(c.floor_bp)}</p>
              <p class="t-small" style="margin:0">Contracted minimum recycled content.</p>
            </div>
            <div class="figure-row">
              <p class="t-label" style="margin:0">Required of the remaining volume</p>
              <p class="figure mono" style="margin:0">{bp(c.required_remaining_bp)}</p>
              <p class="t-small" style="margin:0">{c.derivation.required_remaining_bp}</p>
            </div>
            <div class="figure-row">
              <p class="t-label" style="margin:0">Shortfall consequence</p>
              <p class="figure t-body" style="margin:0">{c.shortfall_consequence}</p>
              <p class="t-small" style="margin:0">Stated at signature rather than discovered at the year end.</p>
            </div>
          </div>

          {c.allocations.length ? (
            <div class="table-scroll" style="margin-top:1.5rem">
              <table>
                <caption>
                  Where supply is short, an allocation names the person who decided and the
                  contracts that went without. It is never an automatic sort by contract value with
                  nobody's name on it.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Allocation</th>
                    <th scope="col">Lot</th>
                    <th scope="col" class="num">Mass</th>
                    <th scope="col">Decided by</th>
                    <th scope="col">Favoured over</th>
                  </tr>
                </thead>
                <tbody>
                  {c.allocations.map((a) => (
                    <tr key={a.reference}>
                      <th scope="row" class="mono">{a.reference}</th>
                      <td class="mono"><a href={`/console/lots/${a.lot}`}>{a.lot}</a></td>
                      <td class="num">{a.mass_g.toLocaleString('en-GB')}</td>
                      <td>{a.decided_by}</td>
                      <td class="mono t-small">{(a.favoured_over || []).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="t-small" style="color:var(--muted);margin-top:1rem">
              No lot has been attached to this contract yet.
            </p>
          )}
        </section>
      )) : null}
    </div>
  );
}

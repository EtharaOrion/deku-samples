import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtBp, fmtDate } from '../format.js';

export function BalanceList() {
  const [periods, setPeriods] = useState(undefined);
  useEffect(() => { api('/api/balance-periods').then((r) => setPeriods(r.ok ? r.data : [])); }, []);
  if (periods === undefined) return <Loading />;
  if (!periods.length) return <Empty>No balance period exists.</Empty>;
  return (
    <div>
      <h1>The ledger</h1>
      <p>Per site, per grade and per period. A balance is the sum of its movements and is never held as a total.</p>
      <div class="table-wrap sheet">
        <table>
          <thead><tr><th>Period</th><th>Site</th><th>Grade</th><th>State</th><th>Window</th></tr></thead>
          <tbody>
            {periods.map((p) => (
              <tr>
                <td><Link href={`/console/balance/${p.id}`}><Ref>{p.id}</Ref></Link></td>
                <td><Ref>{p.site}</Ref></td>
                <td>{p.grade}</td>
                <td><WordState state={p.state} /></td>
                <td>{fmtDate(p.period.start)} – {fmtDate(p.period.end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BalanceDetail({ id, me }) {
  const [period, setPeriod] = useState(undefined);
  const [banner, setBanner] = useState(null);
  const [lot, setLot] = useState('LOT-N6-0001');
  const [category, setCategory] = useState('post_consumer');
  const [mass, setMass] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api(`/api/balance-periods/${id}`).then((r) => setPeriod(r.ok ? r.data : null));
  useEffect(() => { load(); }, [id]);
  if (period === undefined) return <Loading />;
  if (period === null) return <Empty>There is no balance period with that identifier.</Empty>;

  const canAllocate = me?.roles?.includes('claims_manager');

  async function allocate(e) {
    e.preventDefault();
    setBusy(true);
    const { newIdempotencyKey } = await import('../api.js');
    const r = await api(`/api/balance-periods/${id}/allocations`, {
      method: 'POST', key: newIdempotencyKey('alloc'),
      body: { lot, category, mass_g: Number(mass) }
    });
    setBusy(false);
    setBanner(r.ok
      ? { text: `Allocated ${fmtG(r.data.mass_g)} to ${r.data.lot}. Recycled content is now ${r.data.content_bp} bp at claim type ${r.data.claim_type.replace(/_/g, ' ')}.` }
      : {
          refused: true,
          text: r.data?.message
            ? `This allocation is refused. Available: ${fmtG(r.data.available_g)}. Requested: ${fmtG(r.data.requested_g)}. The figures on this screen are unchanged.`
            : `The allocation was refused: ${r.data?.message || r.data?.error}`
        });
    await load();
  }

  const rows = [
    ['post_consumer', period.credits.post_consumer],
    ['pre_consumer', period.credits.pre_consumer]
  ];

  return (
    <div>
      <h1><Ref>{period.id}</Ref></h1>
      <p>{period.site} · grade {period.grade} · {fmtDate(period.period.start)} to {fmtDate(period.period.end)} · <WordState state={period.state} /></p>
      {period.state === 'closed' ? (
        <Banner kind="refused" title="This period is closed">
          This period is closed. Corrections require a restatement. It refuses every further write and refuses to reopen.
          Closed on {fmtDate(period.closed_on)}, cut-off {fmtDate(period.cut_off)}.
        </Banner>
      ) : null}
      {banner ? <Banner kind={banner.refused ? 'refused' : 'note'}>{banner.text}</Banner> : null}

      <div class="sheet">
        <h2>Credits, per category</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Category</th><th class="figure">Credits in</th><th class="figure">Credits out</th><th class="figure">Credits available</th></tr></thead>
            <tbody>
              {rows.map(([name, c]) => (
                <tr>
                  <td>{name.replace(/_/g, ' ')}</td>
                  <td class="figure">{fmtG(c.credits_in_g)}</td>
                  <td class="figure">{fmtG(c.credits_out_g)}</td>
                  <td class="figure">{fmtG(c.credits_available_g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl class="kv" style="margin-top:1.25rem">
          <dt>Non-claimable input</dt><dd class="figure">{fmtG(period.non_claimable_input_g)}</dd>
          <dt>Carry-over limit</dt><dd class="figure">{period.carry_over_limit_bp} bp</dd>
          <dt>Allocation basis</dt><dd>{period.allocation_basis}</dd>
          <dt>Conversion factors in force</dt>
          <dd>{period.conversion_factors.map((f) => (
            <div key={f.reference}><Ref>{f.reference}</Ref> — {f.factor_bp} bp {f.provisional ? '(provisional)' : ''}
              {f.derivation_window.from ? ` over ${fmtDate(f.derivation_window.from)} to ${fmtDate(f.derivation_window.to)}` : ''}</div>
          ))}</dd>
          {period.inbound_credits?.length ? (
            <dt>Inbound credits</dt>
          ) : null}
          {period.inbound_credits?.length ? (
            <dd>{period.inbound_credits.map((t) => (
              <div key={t.reference}><Ref>{t.reference}</Ref> — {fmtG(t.mass_g)} from <Ref>{t.origin_site}</Ref>, fresh credit: {String(t.fresh_credit)}</div>
            ))}</dd>
          ) : null}
          {period.carried_forward_g ? <dt>Carried forward</dt> : null}
          {period.carried_forward_g ? <dd class="figure">{JSON.stringify(period.carried_forward_g)}</dd> : null}
          {period.expired_g ? <dt>Expired</dt> : null}
          {period.expired_g ? <dd class="figure">{JSON.stringify(period.expired_g)}</dd> : null}
        </dl>
      </div>

      <div class="sheet">
        <h2>Three counts</h2>
        <dl class="kv">
          <dt>Overrides this period</dt><dd class="figure">{period.override_count}</dd>
          <dt>Open restatements</dt><dd class="figure">{period.open_restatement_count}</dd>
          <dt>Audit findings</dt><dd class="figure">{period.open_finding_count}</dd>
        </dl>
        <p class="small">None of these is a badge to be cleared, and the remaining claimable mass is a mass
          rather than a verdict: {fmtG(period.credits.post_consumer.credits_available_g)} post-consumer,
          {' '}{fmtG(period.credits.pre_consumer.credits_available_g)} pre-consumer.</p>
      </div>

      <div class="sheet">
        <h2>Movements</h2>
        {period.derivation.movements.length === 0 ? <Empty>No movement in this period.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Kind</th><th>Category</th><th>Direction</th><th class="figure">Mass</th><th>Derivation</th><th>Effective on</th></tr></thead>
              <tbody>
                {period.derivation.movements.map((m) => (
                  <tr>
                    <td>{m.kind.replace(/_/g, ' ')}</td>
                    <td>{m.category.replace(/_/g, ' ')}</td>
                    <td>{m.direction}</td>
                    <td class="figure">{fmtG(m.mass_g)}</td>
                    <td class="small">{m.derivation?.note || (m.derivation ? Object.entries(m.derivation).filter(([k]) => k !== 'note').map(([k, v]) => `${k}: ${v}`).join(', ') : '—')}</td>
                    <td>{fmtDate(m.effective_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {period.state !== 'closed' ? (
        <div class="sheet">
          <h2>Allocate claim</h2>
          {!canAllocate ? (
            <Empty>Only a claims manager allocates claim. There is no input control on this screen for any other role.</Empty>
          ) : (
            <form onSubmit={allocate}>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:1rem;margin-bottom:1rem">
                <div><label for="al-lot">Lot</label>
                  <input id="al-lot" value={lot} onInput={(e) => setLot(e.target.value)} required /></div>
                <div><label for="al-cat">Category</label>
                  <select id="al-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="post_consumer">post-consumer</option>
                    <option value="pre_consumer">pre-consumer</option>
                  </select></div>
                <div><label for="al-mass">Mass, grams</label>
                  <input id="al-mass" type="number" min="1" step="1" value={mass} onInput={(e) => setMass(e.target.value)} required /></div>
              </div>
              <button class="btn" type="submit" disabled={busy}>{busy ? 'Allocating…' : 'Allocate'}</button>
              <p class="small" style="margin-top:0.75rem">No percentage is ever accepted from a person. The
                ledger computes it from the mass you attach.</p>
            </form>
          )}
        </div>
      ) : null}
      <p class="small">Read at {period.read_at}.</p>
    </div>
  );
}

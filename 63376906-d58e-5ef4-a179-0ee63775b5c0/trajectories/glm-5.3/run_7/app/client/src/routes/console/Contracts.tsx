// Contracts and the offtake floor. The unreachable state is a word and a date.
import { useEffect, useState } from 'preact/hooks';
import { api, kg } from '../../lib/api';
import { Loading, Empty, StateWord } from '../../components/Figures';

export default function Contracts() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [projections, setProjections] = useState<Record<string, any>>({});

  useEffect(() => {
    api<any[]>('/contracts').then(async (cs) => {
      setRows(cs);
      const ps: Record<string, any> = {};
      for (const c of cs) {
        try { ps[c.id] = await api<any>('/contracts/' + c.id + '/projection'); } catch { ps[c.id] = null; }
      }
      setProjections(ps);
    }).catch(() => setRows([]));
  }, []);

  if (!rows) return <div class="console-shell"><Loading what="The contracts" /></div>;
  if (rows.length === 0) return <div class="console-shell"><Empty what="contracts" /></div>;

  return (
    <div class="console-shell">
      <h1>Contracts</h1>
      <p class="measure">Delivered, running content, the floor, and the average the remaining volume must reach. An unreachable floor is reported and never refused.</p>
      {rows.map((c) => {
        const p = projections[c.id];
        return (
          <section class="card" key={c.id} style="margin-bottom:1.5rem">
            <h2 class="mono" style="font-size:var(--step-h4-size)">{c.id}</h2>
            <p class="label">{c.customer} · {c.site} · {c.period} · shortfall consequence: {c.shortfall_consequence}</p>
            {c.planned_site_flag ? (
              <p><StateWord state="planned" /> <span class="label">The supplying site carries a confidence of planned. This flag is not dismissable.</span></p>
            ) : null}
            {p ? (
              <>
                <ul class="figure-list">
                  <li><span class="label">Delivered</span><span class="figures">{kg(p.delivered_kg)}</span></li>
                  <li><span class="label">Committed</span><span class="figures">{kg(p.committed_kg)}</span></li>
                  <li><span class="label">Running content</span><span class="figures">{p.running_content_bp} bp</span></li>
                  <li><span class="label">Floor</span><span class="figures">{p.floor_bp} bp</span></li>
                  <li><span class="label">Required remaining average</span><span class="figures">{p.required_remaining_bp} bp</span></li>
                  <li><span class="label">State</span><span>{p.state === 'unreachable' ? <><StateWord state="unreachable" /> since {p.unreachable_since}</> : <StateWord state={p.state} />}</span></li>
                </ul>
                <p class="label">Derived: {p.derivation?.required_remaining_bp}</p>
                {p.allocations?.length ? (
                  <p class="label">Allocations: {p.allocations.map((a: any) => `${a.allocation} (${a.lot}, decided by ${a.decided_by}, favoured over ${(a.favoured_over || []).join(', ') || 'none'})`).join('; ')}</p>
                ) : null}
              </>
            ) : <p class="notice">The projection is loading.</p>}
          </section>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { api, g, fmtDate, ApiError } from '../../lib/api';
import { Loading, Empty, Banner, StateWord, ContentFigure } from '../../components/Figures';
import { Link, usePath } from '../../router';
import type { Me } from '../../lib/api';

type Period = {
  id: string; site: string; grade: string; period: { from: string; to: string }; state: string;
  allocation_basis: string;
  post_consumer: { credits_in_g: number; credits_out_g: number; credits_available_g: number; derivation: { movements: string[] } };
  pre_consumer: { credits_in_g: number; credits_out_g: number; credits_available_g: number; derivation: { movements: string[] } };
  inbound_credits: any[]; transfers_out: any[];
  non_claimable_input_g: { value: number; derivation: string[] };
  conversion_factors: any[];
  carry_over_limit_bp: number;
  override_count: { value: number; derivation: string[] };
  open_restatement_count: { value: number; derivation: string[] };
  open_finding_count: { value: number; derivation: string[] };
  carry_over?: any;
  closed_on: string | null; cut_off: string | null;
  read_at: string;
};

type Lot = { reference: string; grade: string; site: string; mass_g: number; disposition: string; claim_type: string; content_bp: number; credit_attached_g: Record<string, number> };

export default function Balance({ user }: { user: Me }) {
  const path = usePath();
  const parts = path.split('/');
  const selected = parts.length > 3 && parts[2] === 'balance' ? decodeURIComponent(parts[3]) : null;
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [form, setForm] = useState({ lot: '', category: 'post_consumer', mass_g: '' });
  const [refusal, setRefusal] = useState<any>(null);
  const [success, setSuccess] = useState<any>(null);

  useEffect(() => { api<Period[]>('/balance-periods').then(setPeriods).catch(() => setPeriods([])); }, []);
  useEffect(() => { api<Lot[]>('/lots').then(setLots).catch(() => setLots([])); }, [period]);
  useEffect(() => {
    if (selected) api<Period>('/balance-periods/' + selected).then(setPeriod).catch(() => setPeriod(null));
    else setPeriod(null);
  }, [selected]);

  const allocate = async (e: Event) => {
    e.preventDefault();
    setRefusal(null);
    setSuccess(null);
    try {
      const r = await api<any>('/balance-periods/' + selected + '/allocations', {
        method: 'POST',
        body: { lot: form.lot, category: form.category, mass_g: parseInt(form.mass_g, 10) }
      });
      setSuccess(r);
      const p = await api<Period>('/balance-periods/' + selected);
      setPeriod(p);
      setLots(await api<Lot[]>('/lots'));
    } catch (err) {
      const ae = err as ApiError;
      setRefusal(ae.body);
    }
  };

  if (!periods) return <div class="console-shell"><Loading what="The balance periods" /></div>;
  if (periods.length === 0) return <div class="console-shell"><Empty what="balance periods" /></div>;

  if (!selected) {
    return (
      <div class="console-shell">
        <h1>Balance periods</h1>
        <p class="measure">Per site, per grade and per period. A balance is the sum of its movements and is never held as a total.</p>
        <ul style="list-style:none;padding:0">
          {periods.map((p) => (
            <li key={p.id} class="card" style="margin-bottom:1rem">
              <h3 class="mono"><Link href={'/console/balance/' + p.id}>{p.id}</Link></h3>
              <p class="label">{p.site} · {p.grade} · {p.period.from} to {p.period.to} · {p.state}</p>
              <ul class="figure-list">
                <li><span class="label">post_consumer available</span><span class="figures">{g(p.post_consumer.credits_available_g)}</span></li>
                <li><span class="label">pre_consumer available</span><span class="figures">{g(p.pre_consumer.credits_available_g)}</span></li>
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!period) return <div class="console-shell"><Loading what="The period" /></div>;

  const cats = [
    ['post_consumer', period.post_consumer],
    ['pre_consumer', period.pre_consumer]
  ] as const;

  return (
    <div class="console-shell">
      <h1 class="mono" style="font-size:var(--step-h3-size)">{period.id}</h1>
      <p class="label">
        {period.site} · {period.grade} · {period.period.from} to {period.period.to} · <StateWord state={period.state} /> ·
        allocation basis {period.allocation_basis} · read at {period.read_at}
      </p>
      {period.state === 'closed' ? (
        <Banner title="This period is closed">
          <p>This period is closed. Corrections require a restatement.</p>
          {period.carry_over ? (
            <ul class="figure-list">
              <li><span class="label">post_consumer carried forward</span><span class="figures">{g(period.carry_over.post_consumer.carried_forward_g)}</span></li>
              <li><span class="label">post_consumer expired</span><span class="figures">{g(period.carry_over.post_consumer.expired_g)}</span></li>
              <li><span class="label">pre_consumer carried forward</span><span class="figures">{g(period.carry_over.pre_consumer.carried_forward_g)}</span></li>
              <li><span class="label">pre_consumer expired</span><span class="figures">{g(period.carry_over.pre_consumer.expired_g)}</span></li>
            </ul>
          ) : null}
        </Banner>
      ) : null}

      <section aria-label="Credits by category">
        <h2>Credits</h2>
        <div class="table-scroll">
          <table class="sheet">
            <caption class="label" style="text-align:left;padding-bottom:0.5rem">Credits in, credits out and credits available per category. The two categories are never netted.</caption>
            <thead>
              <tr><th scope="col">Category</th><th scope="col" class="num">Credits in</th><th scope="col" class="num">Credits out</th><th scope="col" class="num">Credits available</th><th scope="col">From movements</th></tr>
            </thead>
            <tbody>
              {cats.map(([name, cat]) => (
                <tr key={name}>
                  <td>{name.replace(/_/g, ' ')}</td>
                  <td class="num">{cat.credits_in_g.toLocaleString('en-GB')}</td>
                  <td class="num">{cat.credits_out_g.toLocaleString('en-GB')}</td>
                  <td class="num">{cat.credits_available_g.toLocaleString('en-GB')}</td>
                  <td class="mono">{cat.derivation.movements.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Other figures">
        <h2>The invariant’s margin</h2>
        <ul class="figure-list">
          <li><span class="label">Remaining claimable, post-consumer</span><span class="figures">{g(period.post_consumer.credits_available_g)}</span></li>
          <li><span class="label">Remaining claimable, pre-consumer</span><span class="figures">{g(period.pre_consumer.credits_available_g)}</span></li>
          <li><span class="label">Non-claimable input</span><span class="figures">{g(period.non_claimable_input_g.value)}</span></li>
          <li><span class="label">Carry-over limit</span><span class="figures">{period.carry_over_limit_bp} bp</span></li>
        </ul>
        <p class="label" style="margin-top:1rem">Three counts, none a badge to be cleared</p>
        <ul class="figure-list">
          <li><span class="label">Overrides this period</span><span class="figures">{period.override_count.value}</span></li>
          <li><span class="label">Open restatements</span><span class="figures">{period.open_restatement_count.value}</span></li>
          <li><span class="label">Audit findings past their date</span><span class="figures">{period.open_finding_count.value}</span></li>
        </ul>
      </section>

      {period.inbound_credits.length > 0 ? (
        <section aria-label="Inbound credits">
          <h2>Inbound credits from inter-site transfers</h2>
          <p class="label">Never a fresh credit. The origin site is named on each.</p>
          <ul class="figure-list">
            {period.inbound_credits.map((c: any) => (
              <li key={c.reference}>
                <span class="label">{c.movement} from {c.origin_site}</span>
                <span class="figures">{g(c.mass_g)} · fresh credit {String(c.fresh_credit)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Conversion factors">
        <h2>Conversion factors in force</h2>
        <ul>
          {period.conversion_factors.map((f: any) => (
            <li key={f.reference}>
              <span class="mono">{f.reference}</span> — {f.factor_bp} bp{' '}
              {f.provisional ? <StateWord state="provisional" /> : null}
              {f.derivation_window ? ` · window ${f.derivation_window.from} to ${f.derivation_window.to} (${f.derived_in_g} in, ${f.derived_out_g} out)` : ' · no window, which is what makes it provisional'}
            </li>
          ))}
        </ul>
      </section>

      {user.role === 'claims_manager' && period.state === 'open' ? (
        <section aria-label="Allocate claim">
          <h2>Attach claim to a lot</h2>
          <p class="label">Every percentage is computed. No percentage is accepted from a person, on any route, in any form.</p>
          {refusal ? (
            <Banner kind="refused" title="This allocation is refused">
              <p>Available: <span class="figures">{refusal.available_g?.toLocaleString('en-GB')} g</span>. Requested: <span class="figures">{refusal.requested_g?.toLocaleString('en-GB')} g</span>.</p>
              <p>Nothing moved. The figures on this screen are unchanged.</p>
            </Banner>
          ) : null}
          {success ? (
            <Banner title="Allocation made">
              <p>Movement <span class="mono">{success.reference}</span>. The lot now carries <ContentFigure content_bp={success.content_bp} claim_type="mass_balance" />.</p>
            </Banner>
          ) : null}
          <form class="card" onSubmit={allocate} style="max-width:34rem">
            <label class="field">
              <span class="label">Lot</span>
              <select required value={form.lot} onChange={(e: any) => setForm({ ...form, lot: e.currentTarget.value })}>
                <option value="">Choose a lot</option>
                {(lots || []).filter((l) => l.site === period.site).map((l) => (
                  <option key={l.reference} value={l.reference}>{l.reference} ({l.mass_g.toLocaleString('en-GB')} g)</option>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="label">Category</span>
              <select value={form.category} onChange={(e: any) => setForm({ ...form, category: e.currentTarget.value })}>
                <option value="post_consumer">post_consumer</option>
                <option value="pre_consumer">pre_consumer</option>
              </select>
            </label>
            <label class="field">
              <span class="label">Mass in grams (integer)</span>
              <input type="number" step="1" min="1" required value={form.mass_g} onInput={(e: any) => setForm({ ...form, mass_g: e.currentTarget.value })} />
            </label>
            <button class="button solid" type="submit">Attach claim</button>
          </form>
        </section>
      ) : null}

      {lots ? (
        <section aria-label="Lots with derived content">
          <h2>Lots and their derived content</h2>
          <div class="table-scroll">
            <table class="sheet">
              <thead>
                <tr><th scope="col">Lot</th><th scope="col">Site</th><th scope="col" class="num">Mass</th><th scope="col">Disposition</th><th scope="col" class="num">Attached (g)</th><th scope="col">Content</th><th scope="col">Claim type</th></tr>
              </thead>
              <tbody>
                {lots.filter((l) => l.site === period.site).map((l) => {
                  const attached = Object.values(l.credit_attached_g || {}).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={l.reference}>
                      <td class="mono"><Link href={'/console/lots/' + l.reference}>{l.reference}</Link></td>
                      <td class="mono">{l.site}</td>
                      <td class="num">{l.mass_g.toLocaleString('en-GB')}</td>
                      <td><StateWord state={l.disposition} /></td>
                      <td class="num">{attached.toLocaleString('en-GB')}</td>
                      <td class="num">{l.content_bp} bp</td>
                      <td>{l.claim_type.replace(/_/g, ' ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

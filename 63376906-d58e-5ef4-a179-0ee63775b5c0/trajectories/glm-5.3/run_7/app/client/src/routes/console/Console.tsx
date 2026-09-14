import { useEffect, useState } from 'preact/hooks';
import { api, fmtDate } from '../../lib/api';
import { Loading, Empty, StateWord, VectorIcon } from '../../components/Figures';
import { Link } from '../../router';
import { SchemeStatusBanner } from '../../components/SchemeStatus';
import type { Me } from '../../lib/api';

type Run = {
  reference: string; run_type: string; site: string; equipment: string; recipe_version: string;
  started_at: string; closed_at: string | null; losses_g: number | null; mass_in_g: number; mass_out_g: number;
  within_tolerance: boolean | null; open: boolean;
  consumptions: { input: string; kind: string; mass_g: number }[];
  outputs: { reference: string; kind: string; mass_g: number; lot: string | null; disposition: string | null }[];
};

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'] as const;

export default function Console({ user }: { user: Me }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Run[]>('/runs').then(setRuns).catch((e) => setError(e.message));
  }, []);

  const inScope = runs ? runs.filter((r) => user.sites.includes(r.site)) : [];

  return (
    <div class="console-shell">
      <SchemeStatusBanner />
      <h1>Board</h1>
      <p class="measure">
        One column per process stage, one card per run. The column a card sits in is named in text on the card.
        {user.role === 'auditor' ? ' You are signed in as an auditor: every mutating control is absent.' : ''}
      </p>
      {error ? <div class="banner refused"><span class="label">Refused</span><p>{error}</p></div> : null}
      {!runs ? <Loading what="The board" /> : inScope.length === 0 ? <Empty what="runs in your scope" /> : (
        <div class="board">
          {STAGES.map((stage) => (
            <section class="board-column" key={stage} aria-label={stage}>
              <h2>{stage}</h2>
              {inScope.filter((r) => r.run_type === stage).length === 0 ? (
                <p class="notice">No {stage} runs yet.</p>
              ) : (
                inScope.filter((r) => r.run_type === stage).map((r) => <RunCard key={r.reference} run={r} />)
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: Run }) {
  return (
    <article class="run-card">
      <p class="label" style="margin:0 0 0.25rem">{run.run_type} · {run.site}</p>
      <h3 class="mono" style="margin:0 0 0.5rem;font-size:var(--step-body-size)"><Link href={`/console/runs/${run.reference}`}>{run.reference}</Link></h3>
      <ul class="figure-list">
        <li><span class="label">Mass in</span><span class="figures">{run.mass_in_g.toLocaleString('en-GB')} g</span></li>
        <li><span class="label">Mass out</span><span class="figures">{run.mass_out_g.toLocaleString('en-GB')} g</span></li>
        <li>
          <span class="label">Losses</span>
          <span class="figures">{run.losses_g === null ? 'open run' : run.losses_g.toLocaleString('en-GB') + ' g'}</span>
        </li>
        <li><span class="label">Started</span><span class="figures">{fmtDate(run.started_at)}</span></li>
      </ul>
      <p style="margin:0.5rem 0 0">
        {run.open ? <StateWord state="open" /> : <VectorIcon kind="lock" label="closed" />}
        {run.within_tolerance === false ? <> <StateWord state="outside_tolerance" /></> : null}
      </p>
      {run.outputs.filter((o) => o.lot).map((o) => (
        <p class="label" style="margin:0.5rem 0 0">
          Lot <Link class="mono" href={`/console/lots/${o.lot}`}>{o.lot}</Link> · {o.mass_g.toLocaleString('en-GB')} g
        </p>
      ))}
    </article>
  );
}

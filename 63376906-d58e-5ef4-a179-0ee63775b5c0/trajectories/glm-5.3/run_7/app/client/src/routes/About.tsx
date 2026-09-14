import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Loading, Empty } from '../components/Figures';
import { Reveal } from '../components/Reveal';

type Stat = { key: string; value: string; source: string; year: number; geography: string };

export default function About() {
  const [stats, setStats] = useState<Stat[] | null>(null);
  useEffect(() => { api<Stat[]>('/statistics').then(setStats).catch(() => setStats([])); }, []);

  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">About Ravel</Reveal>
        <Reveal as="p" class="lede">A chemical recycling company that returns mixed polyamide waste to virgin-quality pellet, and publishes only the figures it can substantiate.</Reveal>
      </section>

      <section class="shell section">
        <Reveal as="h2">The hard facts</Reveal>
        {!stats ? <Loading what="The statistics" /> : stats.length === 0 ? <Empty what="statistics" /> : (
          <div class="grid three">
            {stats.map((s) => (
              <Reveal as="div" class="stat" key={s.key}>
                <p class="value">{s.value}</p>
                <p class="meta">Source: {s.source} · {s.year} · {s.geography}</p>
              </Reveal>
            ))}
          </div>
        )}
        <p class="measure" style="margin-top:2rem">
          The emissions figure is stated as a mass: 1.8 gigatonnes of carbon dioxide equivalent a year
          from plastics production, globally, measured in 2023. Each figure above carries its source,
          its year and its geography beside it, because a figure that cannot carry all three is not published.
        </p>
      </section>

      <section class="shell section">
        <Reveal as="h2">What we hold ourselves to</Reveal>
        <div class="measure">
          <p>Losses reduce the claim. Material that disappears in processing does not carry its claim forward, and no claim percentage is ever accepted from a person, on any route, in any form.</p>
          <p>No claim without its chain. No lot without its runs, no run without its feedstock batches, no batch without its collector and its category, no carbon figure without its method version and its boundary, and no certificate without a named signer who was entitled to sign it.</p>
          <p>And the record is append-only. A correction is a new entry naming what it corrects, and the digest chain verifies or it does not.</p>
        </div>
      </section>
    </div>
  );
}

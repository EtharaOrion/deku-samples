import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Loading, Empty } from '../components/Figures';
import { Reveal } from '../components/Reveal';
import { Link } from '../router';

type Stat = { key: string; value: string; source: string; year: number; geography: string };
type Position = { id: number; title: string; location: string; department: string; contract_type: string; closes_on: string };

export default function Home() {
  const [stats, setStats] = useState<Stat[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);

  useEffect(() => {
    api<Stat[]>('/statistics').then(setStats).catch(() => setStats([]));
    api<Position[]>('/positions').then(setPositions).catch(() => setPositions([]));
  }, []);

  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Tomorrow’s materials. Made from today’s waste.</Reveal>
        <Reveal as="p" class="lede">
          Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
        </Reveal>
        <p><a class="button solid" href="/product">Product <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></a></p>
      </section>

      <section class="shell section">
        <Reveal as="h2">Nylon that goes on and on and on</Reveal>
        <div class="measure">
          <p>
            Discarded fishing nets, industrial offcuts and post-consumer textiles arrive at our
            plants as mixed polyamide waste and leave as pellet with the same chemistry as the
            incumbent. The material is deliberately indistinguishable. What the buyer is paying
            for is origin, and origin is a record: how much recycled input a lot represents, and
            what it emitted, allocated by arithmetic a regulator can audit.
          </p>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">The power of green chemistry</Reveal>
        <div class="grid three">
          <Reveal as="div" class="card">
            <h3>Dissolution</h3>
            <p>Waste is dissolved and filtered, separating polyamide from elastane, coatings and foreign matter without breaking the chain.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Depolymerisation</h3>
            <p>The polymer is returned to its monomer at low temperature and pressure, which is what makes the loop worth closing.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Repolymerisation</h3>
            <p>Monomer is polymerised back to virgin-quality pellet, tested against a published specification before it leaves the site.</p>
          </Reveal>
        </div>
        <p style="margin-top:1.5rem"><Link class="button" href="/technology">Technology <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
      </section>

      <section class="shell section">
        <Reveal as="h2">We’re closing the loop</Reveal>
        <div class="measure">
          <p>
            A recycled polymer is only worth what its record can support. Every lot we make
            carries its claim from a ledger of batches, each with a collector whose approval was
            in force on the day the material arrived, and every certificate a customer files with
            their own regulator is signed by a named person who was entitled to sign it.
            Losses reduce the claim, and no claim percentage is ever taken from a person.
          </p>
          <p>
            We publish the figures we can substantiate and no others. Three of them are below,
            each with its source, its year and its geography beside it rather than in a footer.
          </p>
        </div>
        {!stats ? <Loading what="The published figures" /> : stats.length === 0 ? <Empty what="published figures" /> : (
          <div class="grid three" style="margin-top:2rem">
            {stats.map((s) => (
              <Reveal as="div" class="stat" key={s.key}>
                <p class="value">{s.value}</p>
                <p class="meta">Source: {s.source} · {s.year} · {s.geography}</p>
              </Reveal>
            ))}
          </div>
        )}
        {!positions ? null : (
          <p style="margin-top:2rem">
            <Link href="/careers">{positions.length === 1 ? 'One open position' : positions.length + ' open positions'} at Ravel</Link>.
          </p>
        )}
      </section>
    </div>
  );
}

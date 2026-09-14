import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Loading, Empty } from '../components/Figures';
import { Reveal } from '../components/Reveal';

type Position = { id: number; title: string; location: string; department: string; contract_type: string; closes_on: string };

export default function Careers() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  useEffect(() => { api<Position[]>('/positions').then(setPositions).catch(() => setPositions([])); }, []);

  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Careers at Ravel</Reveal>
        <Reveal as="p" class="lede">
          {positions === null ? 'Loading the open positions.' : positions.length === 1 ? 'One open position, right now.' : positions.length + ' open positions, right now.'}
        </Reveal>
      </section>

      <section class="shell section">
        <Reveal as="h2">Why this problem matters</Reveal>
        <div class="measure">
          <p>Less than 1 per cent of textiles are recycled into new materials. More than 8 per cent of textile waste is incinerated each year, and plastics production emits 1.8 gigatonnes of carbon dioxide equivalent annually.</p>
          <p>Polyamide is the harder half of that problem: the material is valuable enough to be worth recovering and contaminated enough that most routes fail. The plants that solve it will be run by people who can hold a mass balance in their head and a deviation in their hand.</p>
          <p>The work is unglamorous on purpose. A certificate is only worth what the record behind it can support, and the record is written by people at a plant, four stages at a time.</p>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">Open positions</Reveal>
        {!positions ? <Loading what="The positions" /> : positions.length === 0 ? <Empty what="open positions" /> : (
          <div class="grid two">
            {positions.map((p) => (
              <Reveal as="div" class="card" key={p.id}>
                <h3>{p.title}</h3>
                <p class="label">{p.department} · {p.location} · {p.contract_type}</p>
                <p>Closing {p.closes_on}.</p>
                <a class="button" href={`mailto:careers@example.com?subject=${encodeURIComponent(p.title)}`}>Apply by mail <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></a>
              </Reveal>
            ))}
          </div>
        )}
        <p class="label" style="margin-top:1rem">The count rendered above is derived from the collection it labels.</p>
      </section>
    </div>
  );
}

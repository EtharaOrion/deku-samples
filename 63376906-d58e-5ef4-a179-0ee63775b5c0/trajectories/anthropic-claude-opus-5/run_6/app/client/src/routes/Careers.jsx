import { Reveal, Loading, Empty, useAsync } from '../components/common.jsx';

export default function Careers() {
  const positions = useAsync(() => fetch('/api/positions').then((r) => (r.ok ? r.json() : null)), []);
  const count = positions.data ? positions.data.length : null;
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">Work here</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            A small team in Lyon, running a demonstration plant and building the record that stands
            behind everything it ships.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <h2>Why this problem matters</h2>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          <div>
            <p className="t-body-big">
              Polyamide is one of the few materials where the recycling story has been genuinely
              stuck rather than merely difficult.
            </p>
            <p>
              Nylon 6 recycling has leaned almost entirely on one clean, photogenic stream: discarded
              fishing nets. Nylon 6,6 has had no route at all. Meanwhile the material that actually
              exists in volume — dyed, blended, coated, mixed with everything else a garment or a
              carpet is made of — has gone to landfill and to incineration, and the emissions from
              making its replacement have gone into the atmosphere.
            </p>
          </div>
          <div>
            <p>
              Solving it requires chemistry that works on unsorted feedstock at a cost a plant can
              carry, and it equally requires an accounting discipline that a certification scheme, an
              auditor and a market-surveillance authority will each accept. Neither half is worth
              anything alone. A perfect process with an unverifiable claim sells a commodity; a
              beautiful claim with no process behind it is a fraud.
            </p>
            <p>
              If you are the sort of person who wants both halves to be right, and who is comfortable
              with a system that reports a number expected to be non-zero rather than a badge that
              says everything is fine, you will recognise the work.
            </p>
          </div>
        </div>
      </section>

      <section className="page section">
        <h2>Open positions</h2>
        {positions.loading ? <Loading what="the open positions" /> : null}
        {positions.error ? <Empty>The open positions could not be read.</Empty> : null}
        {count !== null ? (
          <p className="label" style={{ marginTop: '1rem' }}>
            {count === 0 ? 'No open positions' : `${count} open position${count === 1 ? '' : 's'}`}
          </p>
        ) : null}
        {count === 0 ? (
          <Empty>
            There are no open positions at the moment. We read speculative applications sent to
            careers@example.com.
          </Empty>
        ) : null}
        {count ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            {positions.data.map((p) => (
              <div className="card" key={p.reference}>
                <h3 className="t-h4">{p.title}</h3>
                <dl className="dl" style={{ marginTop: '0.75rem' }}>
                  <dt>Location</dt><dd>{p.location}</dd>
                  <dt>Department</dt><dd>{p.department}</dd>
                  <dt>Contract type</dt><dd>{p.contract_type}</dd>
                  <dt>Closes on</dt><dd className="mono">{p.closes_on}</dd>
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

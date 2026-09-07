import { Reveal, Loading, Empty, useAsync } from '../components/common.jsx';

export default function About() {
  const stats = useAsync(() => fetch('/api/statistics').then((r) => (r.ok ? r.json() : null)), []);
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">A material problem, stated plainly</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            Ravel is a chemical recycling company in Lyon. We return mixed polyamide waste to
            virgin-quality pellet, and we issue the record that says where it came from.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <h2>The hard facts</h2>
        <p style={{ marginTop: '1rem' }}>
          Each figure below carries its source, its year and its geography beside it rather than in a
          footer, because a statistic without those three is an assertion.
        </p>
        {stats.loading ? <Loading what="the published figures" /> : null}
        {stats.error ? <Empty>The published figures could not be read.</Empty> : null}
        {stats.data && stats.data.length === 0 ? <Empty>No figures are published on this route.</Empty> : null}
        {stats.data && stats.data.length ? (
          <div className="grid grid-3" style={{ marginTop: '2rem' }}>
            {stats.data.map((s) => (
              <div className="card" key={s.key}>
                <p className="t-body-big" style={{ marginBottom: '1rem' }}>{s.value}</p>
                <dl className="dl">
                  <dt>Source</dt><dd>{s.source}</dd>
                  <dt>Year</dt><dd className="mono">{s.year}</dd>
                  <dt>Geography</dt><dd>{s.geography}</dd>
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="page section">
        <h2>What we are for</h2>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          <div>
            <p className="t-body-big">
              The chemistry is the easier half. The harder half is the accounting that turns a
              processed tonne into a claim somebody is allowed to make.
            </p>
            <p>
              A recycled-content claim ends up on a document that a customer files with their own
              regulator. It is worth money precisely because a third party believes it. That belief
              rests on things that are invisible in the material itself: which collector supplied the
              waste, whether their approval was in force on the day it arrived, whether the custody
              chain was complete, how much mass was lost in processing, and which version of which
              method produced the carbon figure.
            </p>
          </div>
          <div>
            <p>
              So we built the record first. Every act carries a person, a moment, a site and an
              object. Nothing is edited and nothing is removed; a correction is a new entry naming
              what it corrects. The chain of entries verifies, and an auditor can export a scope and
              establish its integrity after it has left our systems, without asking us to confirm
              anything.
            </p>
            <p>
              We also decided what this system would not do. It controls no equipment, holds no set
              point, drives no valve and raises no alarm. It reads the control system's record after
              the fact and shows the disagreement rather than resolving it.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, Empty } from '../ui.jsx';

export default function About() {
  useTitle(
    'About — The hard facts, with their sources',
    'Why Ravel exists, and the three published figures behind it, each carrying its source, its year and its geography.'
  );
  const stats = useAsync(() => api('/statistics'));

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">About</p>
        <h1 class="t-h2">A material problem, and a bookkeeping one</h1>
        <p class="t-big">
          Ravel Materials SAS operates a chemical recycling plant that returns mixed polyamide
          waste to virgin-quality pellet. The chemistry is half the work. The other half is being
          able to say, years later and to somebody who does not trust you, exactly where a
          particular pellet came from.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The hard facts</h2>
        <p>
          Every figure below carries its source, its year and its geography beside it rather than
          in a footer, and a figure that cannot carry all three is not published at all.
        </p>
        {stats.loading ? <Loading what="the published figures" /> : null}
        {stats.data && stats.data.length === 0 ? (
          <Empty>No figure is published yet, because none can yet carry a source, a year and a geography.</Empty>
        ) : null}
        {stats.data ? (
          <div class="grid grid-3">
            {stats.data.map((s) => (
              <div class="sheet" key={s.key}>
                <p class="t-big" style="margin-bottom:1rem">{s.value}</p>
                <dl class="t-small" style="margin:0">
                  <div><dt class="visually-hidden">Source</dt><dd style="margin:0">Source: {s.source}</dd></div>
                  <div><dt class="visually-hidden">Year</dt><dd style="margin:0">Year: <span class="mono">{s.year}</span></dd></div>
                  <div><dt class="visually-hidden">Geography</dt><dd style="margin:0">Geography: {s.geography}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        ) : null}
        <p class="t-small" style="margin-top:1rem">
          The emissions figure is stated as a mass: 1.8 gigatonnes of carbon dioxide equivalent a
          year, not as a share of some other total.
        </p>
      </Reveal>

      <Reveal as="section" className="narrow">
        <h2 class="t-h3">What we do not do</h2>
        <p>
          Ravel controls no equipment. It holds no set point, drives no valve, participates in no
          interlock and raises no alarm. It reads the control system's record after the fact and
          shows the disagreement rather than resolving it.
        </p>
        <p>
          It schedules no laboratory sample, holds no calibration curve and runs no analyst
          worklist. It builds no life-cycle model of its own: it applies a published, versioned
          method and records which version each figure was computed against. It issues no invoice,
          holds no price and hedges nothing.
        </p>
        <p>
          Those exclusions are the point. A system that both drives the plant and attests to what
          the plant did is a system with a conflict in it. Ravel records what a run did, after the
          run.
        </p>
      </Reveal>

      <Reveal as="section" className="narrow">
        <h2 class="t-h3">The company</h2>
        <p>
          Ravel Materials SAS is registered in France, at 14 rue des Fabriques, 69007 Lyon. Its
          producer registration under the scheme <span class="mono">RCS-2026</span> is{' '}
          <span class="mono">REG-RAVEL-0042</span>. Certification belongs to a site rather than to
          the company, so material from one site never carries another site's certificate.
        </p>
      </Reveal>
    </div>
  );
}

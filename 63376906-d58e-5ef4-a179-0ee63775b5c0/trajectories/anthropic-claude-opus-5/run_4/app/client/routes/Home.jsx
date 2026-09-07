import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, Empty } from '../ui.jsx';

export default function Home() {
  useTitle(
    'Ravel — Tomorrow’s materials. Made from today’s waste.',
    'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon, with every claim resting on a record an auditor can walk.'
  );
  const stats = useAsync(() => api('/statistics'));
  const diagram = useAsync(() => api('/process-diagram'));

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">Ravel</p>
        <h1>Tomorrow's materials. Made from today's waste.</h1>
        <p class="t-big">
          Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
        </p>
        <p class="row" style="margin-top:2rem">
          <a class="btn" href="/product">Read the product <span class="btn-arrow" aria-hidden="true">→</span></a>
          <a class="btn btn-quiet" href="/technology">See the process</a>
        </p>
      </Reveal>

      <Reveal as="section">
        <h2>Nylon that goes on and on and on</h2>
        <p class="t-big">
          A nylon molecule does not wear out. What wears out is the article it was made into.
          Ravel takes mixed polyamide waste back to monomer and forward to pellet, so the same
          molecule carries a second article, and a third, without a step down in grade.
        </p>
        <div class="grid grid-3">
          <div class="card">
            <p class="t-eyebrow">Origin</p>
            <p class="t-small">
              Every pellet names the batches it descends from, the collectors who delivered them
              and the approval in force on the day each was received.
            </p>
          </div>
          <div class="card">
            <p class="t-eyebrow">Arithmetic</p>
            <p class="t-small">
              Losses reduce the claim. Material that disappears in processing does not carry its
              claim forward, and no percentage is ever accepted from a person.
            </p>
          </div>
          <div class="card">
            <p class="t-eyebrow">Evidence</p>
            <p class="t-small">
              A certificate is a document readable without our software, at a permanent address,
              stating what the recipient may and may not say.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2>The power of green chemistry</h2>
        <p class="t-big">
          The chemistry runs at low temperature and low pressure with bio-derived reagents, which
          is why the carbon figure is what it is. The figure is published with its boundary, its
          method version and its uncertainty, because a number without those three is a slogan.
        </p>
        {diagram.loading ? <Loading what="the process diagram" /> : null}
        {diagram.data ? (
          <div class="table-scroll" style="margin-top:1.5rem">
            <table>
              <caption>
                Mass in and mass out per stage, across every closed run, in grams. Generated from
                the four run types, so it stays correct when a stage changes.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col" class="num">Mass in</th>
                  <th scope="col" class="num">Mass out</th>
                  <th scope="col" class="num">Lost</th>
                  <th scope="col">What happens</th>
                </tr>
              </thead>
              <tbody>
                {diagram.data.stages.map((s) => (
                  <tr key={s.stage}>
                    <th scope="row" style="text-transform:capitalize">{s.stage}</th>
                    <td class="num">{s.mass_in_g.toLocaleString('en-GB')}</td>
                    <td class="num">{s.mass_out_g.toLocaleString('en-GB')}</td>
                    <td class="num">{s.losses_g.toLocaleString('en-GB')}</td>
                    <td>{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Reveal>

      <Reveal as="section" className="narrow">
        <h2>We're closing the loop</h2>
        <p class="t-big">
          Closing a loop is a bookkeeping claim before it is a chemical one. A plant that also
          runs conventional feed can only say how much recycled input a given pellet represents
          by arithmetic across the whole site, and that arithmetic is where the claim is won or
          lost.
        </p>
        <p>
          So Ravel builds the ledger first. Credit enters the ledger when a claimable batch is
          consumed, in dry mass times the site's own conversion factor, and it leaves when a claim
          is attached to a lot. Credit attached never exceeds credit available: an allocation that
          would breach that is refused rather than warned about, and the refusal is recorded with
          the margin at the instant it happened.
        </p>
        <p>
          A batch resolves its claimability against the collector approval in force on its receipt
          date, never against a current flag. Material from a collector whose approval has lapsed
          is processed and is <mark class="editorial">not claimed</mark>. A batch missing a custody
          link is non-claimable until late evidence arrives, and then it is claimable forward from
          the date the evidence arrived rather than from the date it was received.
        </p>
        <p>
          None of this makes the pellet different. The material is deliberately indistinguishable
          from the incumbent. What the buyer is paying for is origin, and origin cannot be measured
          in a pellet: it exists only as a record.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The hard facts</h2>
        {stats.loading ? <Loading what="the published figures" /> : null}
        {stats.data && stats.data.length === 0 ? <Empty>No figure is published yet.</Empty> : null}
        {stats.data ? (
          <div class="grid grid-3">
            {stats.data.map((s) => (
              <div class="card" key={s.key}>
                <p class="t-big">{s.value}</p>
                <p class="t-small" style="color:var(--muted);margin:0">
                  {s.source} · {s.year} · {s.geography}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </Reveal>
    </div>
  );
}

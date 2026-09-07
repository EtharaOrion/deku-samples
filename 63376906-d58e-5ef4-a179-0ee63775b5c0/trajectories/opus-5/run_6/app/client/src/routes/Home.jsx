import { Link } from '../lib/router.jsx';
import { Reveal, Icon } from '../components/common.jsx';

export default function Home() {
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">Tomorrow's materials. Made from today's waste.</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '42rem', marginTop: '1.5rem' }}>
            Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
          </p>
        </Reveal>
        <Reveal>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem' }}>
            <Link href="/product" className="button button-primary">
              The product <span className="arrow" aria-hidden="true"><Icon name="arrow" /></span>
            </Link>
            <Link href="/technology" className="button">How it works</Link>
          </div>
        </Reveal>
      </section>

      <section className="page section">
        <Reveal as="h2">Nylon that goes on and on and on</Reveal>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          <div>
            <p className="t-body-big">
              Nylon is a good material that has been used badly. It is strong, it is light, it takes a
              dye and it lasts, which is exactly why so much of it is still in the world after the
              garment, the carpet or the net has stopped being useful. A polymer that lasts is only a
              problem when there is nowhere for it to go.
            </p>
            <p>
              Ravel takes mixed polyamide waste — the contaminated, coloured, blended material a
              mechanical route cannot use — and returns it to monomer, then to pellet. The chain
              length that a mechanical route loses on every pass is recovered instead, so the same
              material can go round again without becoming a lesser grade each time.
            </p>
          </div>
          <div>
            <p>
              The material that comes out is deliberately indistinguishable from the incumbent. It
              runs on the same equipment, at the same settings, to the same specification. That is
              the point: a converter should not have to requalify a line to stop using virgin fossil
              feedstock.
            </p>
            <p>
              Which means the pellet is not what a buyer is paying for. They are paying for its
              origin, and origin cannot be measured in a pellet. It exists only as a record.
            </p>
          </div>
        </div>
      </section>

      <section className="page section">
        <Reveal as="h2">The power of green chemistry</Reveal>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          <div>
            <p className="t-body-big">
              Depolymerisation is old chemistry. Doing it at a temperature and a pressure that a
              plant can afford to run, on feedstock nobody has sorted, is the part that was missing.
            </p>
            <p>
              Ravel dissolves the polymer in a green solvent blend and leaves the dyes, the coatings,
              the elastane and the foreign matter behind. What is recovered is monomer, purified to
              the specification a virgin producer would recognise, and repolymerised to pellet.
            </p>
          </div>
          <div>
            <p>
              Every stage is recorded after the fact: what went in, what came out, and what was lost
              between the two. <strong>Losses reduce the claim.</strong> Material that disappears in
              processing does not carry its claim forward, and no arithmetic anywhere in this company
              pretends otherwise.
            </p>
            <p>
              <Link href="/technology">The four process steps, with the mass in and the mass out of each</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="page section">
        <Reveal as="h2">We're closing the loop</Reveal>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          <div>
            <p className="t-body-big">
              A closed loop is a bookkeeping claim before it is a physical one, and the two are
              routinely confused. Ravel does not confuse them.
            </p>
            <p>
              Most of what ships from a plant like this one is claimed by <em>mass balance</em>: the
              recycled input is real, the arithmetic attributing it to a particular lot is a
              convention, and the material in the bag is not physically segregated. Saying so plainly
              is not a weakness in the claim. It is the claim.
            </p>
            <p>
              So every certificate Ravel issues states its claim type beside its percentage, at the
              same weight, and states in the recipient's own language what they may say and what they
              may not. A customer files that document with their regulator. It has to be right, and
              it has to be readable without our software.
            </p>
          </div>
          <div>
            <p>
              Behind each certificate is a chain that has to exist before the claim can: no lot
              without its runs, no run without its feedstock batches, no batch without its collector
              and its category, no carbon figure without its method version and its boundary, and no
              certificate without a named signer who was entitled to sign it.
            </p>
            <p>
              Eight conditions are checked on our own servers at the moment of signing, and none of
              them can be waived by anybody here. If a lot has an open deviation, an unreviewed
              override, or a signer outside their scope, no certificate is issued that day.
            </p>
            <p>
              <span className="highlight-mark">Anyone holding a certificate number can check it</span>{' '}
              at ravel.example.com/verify/&#123;number&#125;, with no account and no relationship with
              us, and read whether it still stands.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

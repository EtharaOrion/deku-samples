import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty } from "../api.jsx";

export default function Home() {
  const stats = useApi("/statistics");
  return (
    <div>
      <DocMeta
        title="Ravel — Tomorrow's materials. Made from today's waste."
        description="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon."
      />
      <section class="container">
        <p class="eyebrow">Ravel Materials</p>
        <Reveal as="h1">Tomorrow's materials. Made from today's waste.</Reveal>
        <p class="body-big">Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.</p>
        <p class="body-regular">
          <a class="btn" href="/product">Same material. Better origin.</a>{" "}
          <a class="btn" href="/technology">How it works</a>
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">Nylon that goes on and on and on</Reveal>
        <div class="grid-2">
          <div class="card">
            <p class="body-regular" style="margin-top:0">
              Polyamide 6 depolymerises back to its own monomer, which means a discarded
              fishing net and a factory offcut can both become the same virgin-quality
              pellet again. Ravel exists to make that loop ordinary rather than
              exceptional.
            </p>
            <p class="body-regular">
              The material that leaves our plant is chemically indistinguishable from the
              incumbent. What a customer buys is not the pellet but its origin, and origin
              is a record: every lot we sell is traceable to the batches that made it.
            </p>
          </div>
          <div class="card">
            <h3>The hard facts</h3>
            {stats.loading ? <Loading /> : stats.data?.length ? (
              <dl>
                {stats.data.map((s) => (
                  <div class="figure-row" style="margin-top:0.6rem">
                    <dt class="body-small">{s.value}</dt>
                    <dd class="body-small grotesk" style="margin:0">
                      {s.source}, {s.year}, {s.geography}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : <Empty>No published figures are available right now.</Empty>}
          </div>
        </div>
      </section>

      <section class="container section">
        <Reveal as="h2">The power of green chemistry</Reveal>
        <p class="body-big">
          Dissolution, depolymerisation, purification and repolymerisation, at temperatures
          and pressures a conventional cracker would consider mild.
        </p>
        <p class="body-regular">
          Four stages, each recorded, each measured, and each leaving a trail a customer's
          auditor can walk without our help. Read the <a href="/technology">technology</a> in
          full, including what our capacity figures do and do not claim.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">We're closing the loop</Reveal>
        <p class="body-big">
          A loop is only closed when the same material comes back, and comes back at a
          quality a manufacturer can put on their line without asking a second question.
        </p>
        <p class="body-regular">
          We work with named collectors, we publish the method versions behind our carbon
          figures, and we withdraw a claim from this site the moment its evidence expires
          rather than waiting for a reader to notice. The register of published claims
          carries each one's evidence, method and review date.
        </p>
        <p class="body-regular">
          <a class="btn" href="/news">What we have announced</a>
        </p>
      </section>
    </div>
  );
}

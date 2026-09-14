import { TopBar, Footer } from '../components/Chrome.jsx';

export default function Home() {
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero">
          <h1 class="reveal">Tomorrow's materials. Made from today's waste.</h1>
          <p class="lede">Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.</p>
        </section>
        <section class="cols">
          <article class="card">
            <h2 class="reveal">Nylon that goes on and on and on</h2>
            <p>Nylon 6 depolymerises back to caprolactam and repolymerises into pellet chemically identical to the virgin material. The loop, unlike the plastic, never degrades.</p>
          </article>
          <article class="card">
            <h2 class="reveal">The power of green chemistry</h2>
            <p>Dissolution, depolymerisation, purification and repolymerisation run at low temperature and low pressure, on green reagents, and return mixed polyamide waste to virgin quality.</p>
          </article>
          <article class="card">
            <h2 class="reveal">We're closing the loop</h2>
            <p>Waste arrives from named collectors, is weighed and sampled at intake, and is traced through every process run to the lot it becomes. Every claim a customer files rests on a record, not on a pellet.</p>
            <p>Less than 1 per cent of textiles are recycled into new materials. The rest of the loop is still open, and closing it is the work of this decade.</p>
          </article>
        </section>
      </main>
      <Footer />
    </div>
  );
}

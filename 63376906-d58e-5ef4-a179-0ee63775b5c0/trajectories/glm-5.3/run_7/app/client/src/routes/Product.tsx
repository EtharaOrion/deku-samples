import { Reveal } from '../components/Reveal';
import { Link } from '../router';

const industries = ['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'];

export default function Product() {
  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <Reveal as="p" class="lede">
          We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.
        </Reveal>
      </section>

      <section class="shell section">
        <Reveal as="h2">Two grades</Reveal>
        <div class="grid two">
          <Reveal as="div" class="card">
            <h3>Nylon 6</h3>
            <p><strong>Its real limitation:</strong> recycled Nylon 6 came almost entirely from one source, discarded fishing nets.</p>
            <p>The claim on this grade is mass balance. Recycled content is allocated by arithmetic over a ledger of accepted batches, and the certificate states the percentage together with its type.</p>
            <p><span class="label">Recycled-content claim beside the grade</span><br />
              <span class="figures">allocated by ledger</span> — claim type <em>mass balance</em>, scheme <span class="mono">RCS-2026</span>.
            </p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Nylon 6,6</h3>
            <p><strong>Its real limitation:</strong> Nylon 6,6 had no recycling solution at all.</p>
            <p>The chemistry that returns Nylon 6 to caprolactam does not apply, so 6,6 has been landfilled or burned. Our route brings it back to pellet at virgin quality, and the first lots carry the same record discipline as N6.</p>
            <p><span class="label">Recycled-content claim beside the grade</span><br />
              <span class="figures">allocated by ledger</span> — claim type <em>mass balance</em>, scheme <span class="mono">RCS-2026</span>.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">Six industries</Reveal>
        <ul class="grid three" style="list-style:none;padding:0;margin:0">
          {industries.map((i) => <li key={i} class="card"><h4>{i}</h4></li>)}
        </ul>
      </section>

      <section class="shell section">
        <Reveal as="h2">Three features</Reveal>
        <div class="grid three">
          <Reveal as="div" class="card">
            <h3>Nylon in any form</h3>
            <p>Fishing nets, carpets, airbag offcuts, post-consumer textiles: if it is polyamide, our dissolution step can take it, and the record follows the material rather than the shape it arrived in.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Virgin quality, verified twice</h3>
            <p>Every lot is tested against a published specification by a named method before it is released, and the virgin reference the comparison is made against is on the specification itself.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>A certificate a regulator accepts</h3>
            <p>The buyer receives a document readable without this system, at a permanent address, with a permitted statement and a prohibited one, generated from the claim type.</p>
          </Reveal>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">The specification</Reveal>
        <div class="card measure">
          <p class="label">Grade N6 — specification version 3, issued 2026-02-01</p>
          <div class="table-scroll">
            <table class="sheet">
              <caption class="label" style="text-align:left;padding-bottom:0.5rem">One row per property</caption>
              <thead>
                <tr><th scope="col">Property</th><th scope="col">Method</th><th scope="col">Limit</th><th scope="col">Unit</th><th scope="col">Basis</th></tr>
              </thead>
              <tbody>
                <tr><td>relative_viscosity</td><td>ISO 307</td><td class="num">2.40</td><td>ratio</td><td>guaranteed</td></tr>
                <tr><td>moisture</td><td>ISO 15512</td><td class="num">0.10</td><td>percent</td><td>guaranteed</td></tr>
                <tr><td>yellowness_index</td><td>ASTM E313</td><td class="num">8.0</td><td>index</td><td>typical</td></tr>
                <tr><td>ash_content</td><td>ISO 3451-1</td><td class="num">0.30</td><td>percent</td><td>informational</td></tr>
              </tbody>
            </table>
          </div>
          <p class="label" style="margin-top:1rem">
            Virgin reference: virgin PA6 at relative viscosity 2.42, sourced from EcoBase 2025, dated 2025-11-30.
          </p>
        </div>
        <p style="margin-top:1.5rem"><Link class="button" href="/contact">Request a specification conversation <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
      </section>
    </div>
  );
}

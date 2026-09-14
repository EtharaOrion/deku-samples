import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty, Words, fmtBP } from "../api.jsx";

const industries = [
  "Textiles and apparel", "Automotive", "Electrical and electronics",
  "Consumer goods", "Industrial", "Construction",
];

export default function Product() {
  const specs = useApi("/specifications/N6/versions/3");
  return (
    <div>
      <DocMeta
        title="Product — Same material. Better origin."
        description="We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise."
      />
      <section class="container">
        <p class="eyebrow">Product</p>
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <p class="body-big">
          We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers
          who refuse to compromise.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">Two grades</Reveal>
        <div class="grid-2">
          <div class="card">
            <h3>Nylon 6</h3>
            <p class="body-regular"><Words>limitation first</Words></p>
            <p class="body-regular" style="margin-top:0.4rem">
              Recycled Nylon 6 came almost entirely from one source: discarded fishing nets.
              Everything else — carpet, textile offcuts, mixed waste — had no route at all.
            </p>
            <p class="body-regular">
              Our recycled-content claim beside this grade: <strong>mass balance</strong>{" "}
              under scheme <span class="mono ref">RCS-2026</span>. The material is not
              physically segregated from conventional feed, and a buyer may not state that
              it physically contains recycled content.
            </p>
          </div>
          <div class="card">
            <h3>Nylon 6,6</h3>
            <p class="body-regular"><Words>limitation first</Words></p>
            <p class="body-regular" style="margin-top:0.4rem">
              Nylon 6,6 had no recycling solution at all. Its chemistry does not
              depolymerise on the same route, and the volumes available today are small.
            </p>
            <p class="body-regular">
              We publish no recycled-content claim against this grade until a lot carries a
              certificate that supports one.
            </p>
          </div>
        </div>
      </section>

      <section class="container section">
        <Reveal as="h2">Six industries</Reveal>
        <ul class="body-regular">
          {industries.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </section>

      <section class="container section">
        <Reveal as="h2">Three things the material does</Reveal>
        <div class="grid-3">
          <div class="card">
            <h4>Nylon in any form</h4>
            <p class="body-regular" style="margin-top:0">
              Nets, carpets, offcuts, yarn and fabric: the process takes polyamide in the
              form it arrives, and the grade that leaves is pellet.
            </p>
          </div>
          <div class="card">
            <h4>Virgin quality, tested on every lot</h4>
            <p class="body-regular" style="margin-top:0">
              A guaranteed limit is tested on every lot against a named method, and the
              result sits on the certificate a customer files.
            </p>
          </div>
          <div class="card">
            <h4>Traceable origin</h4>
            <p class="body-regular" style="margin-top:0">
              Every lot carries its genealogy: the batches that reached it, their masses,
              and the flags on anything upstream.
            </p>
          </div>
        </div>
      </section>

      <section class="container section">
        <Reveal as="h2">Specification</Reveal>
        {specs.loading ? <Loading /> : specs.data ? (
          <div>
            <div class="tablewrap">
              <table>
                <thead>
                  <tr><th>Property</th><th>Method</th><th>Limit</th><th>Unit</th><th>Basis</th></tr>
                </thead>
                <tbody>
                  {(specs.data.rows || []).map((r) => (
                    <tr key={r.property}>
                      <td>{r.property}</td>
                      <td class="mono ref">{r.method}</td>
                      <td class="figure mono">{r.limit}</td>
                      <td>{r.unit}</td>
                      <td class="grotesk">{r.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="body-small">
              Virgin-quality comparison: <strong>{specs.data.virgin_reference?.reference}</strong>,
              sourced from {specs.data.virgin_reference?.source}, dated {specs.data.virgin_reference?.dated}.
              Issued {specs.data.issued_on}.
            </p>
          </div>
        ) : <Empty>The specification is not available right now.</Empty>}
      </section>
    </div>
  );
}

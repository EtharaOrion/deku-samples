import { h } from "preact";
import { useApi, Reveal, DocMeta, Loading, Empty, Words } from "../api.jsx";

const stages = [
  { name: "Dissolution", note: "Polyamide is separated from elastane, dyes and foreign matter in a mild solvent system." },
  { name: "Depolymerisation", note: "The polymer chain is returned to caprolactam, the same monomer the incumbent starts from." },
  { name: "Purification", note: "The monomer stream is purified to polymerisation feed quality; byproducts leave with a recorded share." },
  { name: "Repolymerisation", note: "Virgin-quality pellet is polymerised back, against the same specification a customer already qualifies." },
];

// The plant is drawn rather than photographed; the diagram is generated from the
// four run types so it stays correct when a stage changes.
function PlantDiagram() {
  return (
    <svg viewBox="0 0 860 200" role="img" aria-labelledby="plantTitle plantDesc" style="width:100%;height:auto">
      <title id="plantTitle">The four process stages, with mass in and mass out per stage</title>
      <desc id="plantDesc">
        Dissolution takes mixed polyamide waste in and gives a dissolved polymer stream.
        Depolymerisation takes that stream and gives monomer. Purification takes monomer and gives
        purified feed plus a sold byproduct. Repolymerisation takes purified feed and gives pellet.
      </desc>
      <g stroke="currentColor" fill="none" stroke-width="2">
        {stages.map((s, i) => (
          <rect key={s.name} x={20 + i * 210} y={60} width={160} height={80} rx={8} />
        ))}
        {stages.map((s, i) => i < stages.length - 1 && (
          <path key={`a${i}`} d={`M ${180 + i * 210} 100 L ${230 + i * 210} 100`} marker-end="url(#arrow)" />
        ))}
      </g>
      <g fill="currentColor" font-size="14">
        {stages.map((s, i) => (
          <text key={s.name} x={100 + i * 210} y={95} text-anchor="middle">{s.name}</text>
        ))}
        <text x={100} y={45} text-anchor="middle">mixed waste in</text>
        <text x={740} y={45} text-anchor="middle">virgin-quality pellet out</text>
      </g>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

export default function Technology() {
  const sites = useApi("/sites");
  const caps = useApi("/sites/SITE-COMM/capacity");
  const demo = useApi("/sites/SITE-DEMO/capacity");
  const pilot = useApi("/sites/SITE-PILOT/capacity");
  const rows = [pilot.data, demo.data, caps.data].filter(Boolean);
  return (
    <div>
      <DocMeta
        title="Technology — dissolution, depolymerisation, purification, repolymerisation"
        description="Four process stages, mild conditions, and a capacity table that states its unit once with its basis."
      />
      <section class="container">
        <p class="eyebrow">Technology</p>
        <Reveal as="h1">Four stages, recorded end to end</Reveal>
        <p class="body-big">
          The plant runs four timed stages. Nothing on this page controls anything: the
          process control system holds its own record and we read it after the fact.
        </p>
        <div class="card" style="margin-top:1.5rem">
          <PlantDiagram />
        </div>
        <ol class="body-regular">
          {stages.map((s) => <li key={s.name}><strong>{s.name}</strong> — {s.note}</li>)}
        </ol>
      </section>

      <section class="container section">
        <Reveal as="h2">Capacity</Reveal>
        <p class="body-regular">
          The table states its unit once: <strong>tonnes per year</strong>. The year is
          8,000 hours of operation. Every figure carries its confidence, and a planned row
          says <Words>planned</Words> in words.
        </p>
        {rows.length === 0 ? <Loading /> : (
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Plant</th><th class="figure">Capacity (tonnes per year)</th><th>Confidence</th><th class="figure">Uncommitted (tonnes)</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.reference}>
                    <td>
                      {c.reference === "SITE-PILOT" ? "Pilot (2026)"
                        : c.reference === "SITE-DEMO" ? "Demonstration (2027)"
                        : "Commercial Plant (2030+)"}
                    </td>
                    <td class="figure mono">
                      {c.reference === "SITE-COMM" ? ">25,000" : Math.round(c.nameplate_kg / 1000).toLocaleString("en-GB")}
                    </td>
                    <td class="grotesk">
                      {c.confidence === "planned" ? <Words>planned</Words> : c.confidence.replace("_", " ")}
                    </td>
                    <td class="figure mono">{(c.uncommitted_kg / 1000).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="body-small">
          Basis on all three: {rows[0]?.basis || "—"}. The Commercial row reports a negative
          uncommitted figure in public rather than quietly, because it is contracted beyond
          its nameplate while it is still planned.
        </p>
      </section>

      <section class="container section">
        <Reveal as="h2">Five attributes</Reveal>
        <ul class="body-regular">
          <li><strong>Four stages</strong> — dissolution, depolymerisation, purification, repolymerisation.</li>
          <li><strong>Mild conditions</strong> — temperatures and pressures a cracker would consider low.</li>
          <li><strong>Closed solvent loop</strong> — the solvent is recovered and reused rather than consumed.</li>
          <li><strong>Green chemicals & reagents</strong> — supplier-specific emission factors, published with the year they were sourced from.</li>
          <li><strong>Low temperature & pressure</strong> — held by recipe version, with a change notice before either moves outside the published threshold.</li>
          <li><strong>Low carbon impact</strong> — cradle-to-gate, ISO 14067, with the primary share and the uncertainty beside the figure.</li>
        </ul>
        <p class="body-small">
          The three claims carry their evidence: the carbon method version, the emission
          factor datasets and years, and the comparator every figure is stated against.
        </p>
      </section>
    </div>
  );
}

import { h } from "preact";
import { useApi, Loading, Empty, fmtG, dateOnly, Words } from "../../api.jsx";
import { ConsoleFrame } from "../console.jsx";

export default function Reconciliation() {
  const r = useApi("/reconciliation");
  const chain = useApi("/record/check");
  if (r.loading) {
    return <ConsoleFrame title="Reconciliation" description="Six figures, refreshed on a schedule." path="/console/reconciliation"><Loading /></ConsoleFrame>;
  }
  const d = r.data;
  return (
    <ConsoleFrame title="Reconciliation" description="Six figures rather than six verdicts." path="/console/reconciliation">
      <p class="body-big">Mass balance residual: <span class="mono figure">{fmtG(d.mass_balance_residual_g)}</span></p>
      <p class="body-small grotesk">{d.derivation?.mass_balance_residual_g}</p>

      <div class="balance-figures" style="margin-top:1.2rem">
        <div class="figure-row"><span class="grotesk">Credit margin across periods</span><span class="figure mono">{fmtG(d.credit_margin_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Consumptions on open runs</span><span class="figure mono">{d.consumptions_on_open_runs}</span></div>
        <div class="figure-row"><span class="grotesk">Batches with broken custody</span><span class="figure mono">{d.batches_with_broken_custody.length}</span></div>
        <div class="figure-row"><span class="grotesk">Certificates with superseded figures</span><span class="figure mono">{d.certificates_with_superseded_figures.length}</span></div>
      </div>

      {d.batches_with_broken_custody.length > 0 && (
        <section class="section">
          <h3>Batches with broken custody</h3>
          <ul class="body-regular">
            {d.batches_with_broken_custody.map((b) => (
              <li key={b.batch}><span class="mono ref">{b.batch}</span> — missing {b.missing.join(", ")}</li>
            ))}
          </ul>
        </section>
      )}

      <section class="section">
        <h3>Integration ages</h3>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Source</th><th>Latest record</th><th class="figure">Age (hours)</th></tr></thead>
            <tbody>
              {d.integration_ages.map((s) => (
                <tr key={s.source}>
                  <td class="grotesk">{s.source}</td>
                  <td class="mono ref">{s.latest_received_at ? dateOnly(s.latest_received_at) : "never sent"}</td>
                  <td class="figure mono">{s.age_hours === null ? "null" : s.age_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="body-small">
          A source that has never sent reads <span class="mono ref">null</span> rather than
          zero. A source that stops sending is detected by its age rather than by an error.
        </p>
      </section>

      <section class="section">
        <h3>Record chain</h3>
        {chain.loading ? <Loading /> : (
          <p class="body-regular">
            {chain.data.holds ? "The chain holds." : <>The chain is broken at sequence {chain.data.first_failure}.</>}
            {" "}Length <span class="mono figure">{chain.data.length}</span>.
          </p>
        )}
      </section>

      <p class="body-small grotesk">Read at {d.read_at}</p>
    </ConsoleFrame>
  );
}

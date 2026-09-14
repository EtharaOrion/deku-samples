import { h } from "preact";
import { Link } from "../../api.jsx";
import { useApi, api, Loading, Empty, Banner, fmtG, fmtBP, dateOnly, Words } from "../../api.jsx";
import { ConsoleFrame } from "../console.jsx";

function RecordHome() {
  const runs = useApi("/runs");
  const lots = useApi("/lots");
  const deviations = useApi("/record", []);
  return (
    <ConsoleFrame title="Operational record" description="Runs, lots, tests, deviations, overrides and the entries behind them." path="/console/record">
      <section>
        <h2>Runs</h2>
        {runs.loading ? <Loading /> : runs.data?.length ? (
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Run</th><th>Stage</th><th>State</th><th class="figure">Mass in</th><th class="figure">Mass out</th><th class="figure">Losses</th><th>Tolerance</th></tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.reference}>
                    <td><Link class="mono ref" href={`/console/record/runs/${r.reference}`}>{r.reference}</Link></td>
                    <td class="grotesk">{r.run_type}</td>
                    <td class="grotesk">{r.state === "closed" ? "closed" : <Words>open</Words>}</td>
                    <td class="figure mono">{fmtG(r.mass_in_g)}</td>
                    <td class="figure mono">{fmtG(r.mass_out_g)}</td>
                    <td class="figure mono">{r.losses_g === null ? "—" : fmtG(r.losses_g)}</td>
                    <td class="grotesk">{r.within_tolerance ? "within" : <Words>outside tolerance</Words>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>There are no runs yet.</Empty>}
      </section>

      <section class="section">
        <h2>Lots</h2>
        {lots.loading ? <Loading /> : lots.data?.length ? (
          <div class="tablewrap">
            <table>
              <thead>
                <tr><th>Lot</th><th>Site</th><th class="figure">Mass</th><th>Disposition</th><th class="figure">Content</th><th>Claim type</th><th>Flags</th><th></th></tr>
              </thead>
              <tbody>
                {lots.data.map((l) => (
                  <tr key={l.reference}>
                    <td class="mono ref">{l.reference}</td>
                    <td class="mono ref">{l.site}</td>
                    <td class="figure mono">{fmtG(l.mass_g)}</td>
                    <td class="grotesk"><Words>{l.disposition}</Words></td>
                    <td class="figure mono">{fmtBP(l.content_bp)} <span class="grotesk">({l.claim_type})</span></td>
                    <td class="grotesk">{l.claim_type}</td>
                    <td>{(l.flags || []).map((f) => <Words>{f.split(":")[0]}</Words>)}</td>
                    <td><Link href={`/console/lots/${l.reference}/genealogy`}>Genealogy</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>There are no lots yet.</Empty>}
      </section>

      <section class="section">
        <h2>The record</h2>
        <RecordTable />
      </section>
    </ConsoleFrame>
  );
}

function RecordTable() {
  const rec = useApi("/record");
  if (rec.loading) return <Loading />;
  const rows = rec.data || [];
  if (rows.length === 0) return <Empty>The record is empty.</Empty>;
  return (
    <div>
      <div class="tablewrap masked-top" style="max-height:26rem;overflow:auto">
        <table>
          <thead>
            <tr><th class="figure">Seq</th><th>Act</th><th>Person</th><th>Object</th><th>Digest</th><th>Prev</th></tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.seq}>
                <td class="figure mono">{e.seq}</td>
                <td class="grotesk">{e.act}</td>
                <td class="mono ref">{e.person}</td>
                <td class="mono ref">{e.object_reference || "—"}</td>
                <td class="mono ref">{e.digest?.slice(0, 12)}…</td>
                <td class="mono ref">{e.prev_digest?.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="body-small">
        No entry is edited and no entry is removed. A correction is a new entry naming what
        it corrects. <Link href="/console/reconciliation">Check the chain</Link>.
      </p>
    </div>
  );
}

function RunDetail({ reference }) {
  const run = useApi(`/runs/${reference}`, [reference]);
  if (run.loading) return <ConsoleFrame title="Run" description="Run detail." path="/console/record"><Loading /></ConsoleFrame>;
  if (!run.data) return <ConsoleFrame title="Run" description="Run detail." path="/console/record"><Empty>There is no such run.</Empty></ConsoleFrame>;
  const r = run.data;
  return (
    <ConsoleFrame title={r.reference} description="One run and what it consumed and produced." path="/console/record">
      <p class="body-big">
        <Words>{r.state}</Words> · stage {r.run_type} · recipe <span class="mono ref">{r.recipe_version}</span>
        {r.within_tolerance === false && <> · <Words>outside tolerance</Words></>}
      </p>
      <div class="balance-figures">
        <div class="figure-row"><span class="grotesk">Mass in</span><span class="figure mono">{fmtG(r.mass_in_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Mass out</span><span class="figure mono">{fmtG(r.mass_out_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Losses</span><span class="figure mono">{r.losses_g === null ? "—" : fmtG(r.losses_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Derivation</span><span class="figure mono">{r.derivation?.losses_g}</span></div>
      </div>

      <section class="section">
        <h3>Actual set points against the recipe</h3>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Parameter</th><th class="figure">Actual</th><th class="figure">Recipe min</th><th class="figure">Recipe max</th></tr></thead>
            <tbody>
              {Object.entries(r.actual_set_points || {}).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td class="figure mono">{v}</td>
                  <td class="figure mono">{r.recipe?.set_points?.[k]?.min ?? "—"}</td>
                  <td class="figure mono">{r.recipe?.set_points?.[k]?.max ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h3>Consumptions</h3>
        {r.consumptions.length ? (
          <div class="tablewrap">
            <table>
              <thead><tr><th>Input</th><th class="figure">Mass</th><th class="figure">Credit</th><th>Effective on</th></tr></thead>
              <tbody>
                {r.consumptions.map((c) => (
                  <tr key={c.input_reference + c.effective_on}>
                    <td class="mono ref">{c.input_reference}</td>
                    <td class="figure mono">{fmtG(c.mass_g)}</td>
                    <td class="figure mono">{fmtG(c.credit_g)}</td>
                    <td class="mono ref">{c.effective_on}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>This run consumed nothing.</Empty>}
      </section>

      <section class="section">
        <h3>Outputs</h3>
        {r.outputs.length ? (
          <div class="tablewrap">
            <table>
              <thead><tr><th>Reference</th><th>Kind</th><th class="figure">Mass</th><th>Disposition</th></tr></thead>
              <tbody>
                {r.outputs.map((o) => (
                  <tr key={o.reference}>
                    <td class="mono ref">{o.reference}</td>
                    <td class="grotesk">{o.kind}</td>
                    <td class="figure mono">{fmtG(o.mass_g)}</td>
                    <td class="grotesk">{o.disposition || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>This run produced nothing.</Empty>}
      </section>
    </ConsoleFrame>
  );
}

function BatchDetail({ reference }) {
  const b = useApi(`/batches/${reference}`, [reference]);
  if (b.loading) return <ConsoleFrame title="Batch" description="Batch detail." path="/console/record"><Loading /></ConsoleFrame>;
  if (!b.data) return <ConsoleFrame title="Batch" description="Batch detail." path="/console/record"><Empty>There is no such batch.</Empty></ConsoleFrame>;
  const d = b.data;
  return (
    <ConsoleFrame title={d.reference} description="One batch, its custody chain and its claimability." path="/console/record">
      <p class="body-big">
        {d.claimable ? "Claimable input" : <Words>non-claimable</Words>}
        {!d.claimable && d.claimable_reason === "custody_link_missing" && (
          <> This batch cannot be claimed: {(d.missing_custody_kinds || []).join(", ")}.</>
        )}
        {!d.claimable && d.claimable_reason === "collector_approval_lapsed" && (
          <> This collector's approval lapsed on 2026-06-30. Material received after that date is processed but not claimed.</>
        )}
      </p>
      <div class="balance-figures">
        <div class="figure-row"><span class="grotesk">Delivered net</span><span class="figure mono">{fmtG(d.net_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Dry mass</span><span class="figure mono">{fmtG(d.dry_mass_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Accepted</span><span class="figure mono">{fmtG(d.accepted_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Rejected</span><span class="figure mono">{fmtG(d.rejected_g)}{d.rejected_destination ? ` → ${d.rejected_destination}` : ""}</span></div>
      </div>
      <p class="body-small grotesk">
        Dry mass derivation: {d.derivation?.dry_mass_g}. Claimability resolves against the
        approval in force on {d.received_on}.
      </p>
      <section class="section">
        <h3>Custody</h3>
        <ol class="body-regular">
          {(d.custody || []).map((l) => (
            <li key={l.kind}><span class="grotesk">{l.kind}</span> · {l.party} · <span class="mono ref">{l.date}</span></li>
          ))}
        </ol>
        {!d.custody_complete && <Banner refusal>This batch cannot be claimed: {(d.missing_custody_kinds || []).join(", ")}.</Banner>}
      </section>
      <section class="section">
        <h3>Composition and contamination</h3>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Polymer</th><th class="figure">Declared fraction</th><th class="figure">Measured</th><th>Basis</th></tr></thead>
            <tbody>
              {(d.composition || []).map((c) => (
                <tr key={c.polymer}>
                  <td>{c.polymer}</td>
                  <td class="figure mono">{c.fraction_bp} bp</td>
                  <td class="figure mono">{c.measured_fraction_bp ?? "—"} bp</td>
                  <td class="grotesk">{c.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section class="section">
        <h3>What this batch reached</h3>
        <Impact reference={d.reference} />
      </section>
    </ConsoleFrame>
  );
}

function Impact({ reference }) {
  const impact = useApi(`/batches/${reference}/impact`, [reference]);
  if (impact.loading) return <Loading />;
  if (impact.error) return <Banner refusal>The reverse traversal failed: {impact.error.message}</Banner>;
  const t = impact.data;
  return (
    <div class="stack">
      <p class="body-regular">
        Every lot containing any of this batch, every certificate resting on those lots, and
        every recipient — the complete set, never a page.
      </p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Lot</th><th>Site</th><th class="figure">Mass</th><th>Disposition</th></tr></thead>
          <tbody>
            {t.lots.map((l) => (
              <tr key={l.reference}><td class="mono ref">{l.reference}</td><td class="mono ref">{l.site}</td><td class="figure mono">{fmtG(l.mass_g)}</td><td class="grotesk">{l.disposition}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Certificate</th><th>State</th><th>Recipient</th><th>Signed</th></tr></thead>
          <tbody>
            {t.certificates.map((c) => (
              <tr key={c.number}>
                <td><Link class="mono ref" href={`/console/certificates/${c.number}`}>{c.number}</Link></td>
                <td class="grotesk">{c.state === "withdrawn" ? <Words>withdrawn</Words> : "issued"}</td>
                <td>{c.recipient_name}</td>
                <td class="mono ref">{dateOnly(c.signed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="body-small grotesk">Read at {t.read_at}</p>
    </div>
  );
}

function LotDetail({ reference }) {
  const l = useApi(`/lots/${reference}`, [reference]);
  if (l.loading) return <ConsoleFrame title="Lot" description="Lot detail." path="/console/record"><Loading /></ConsoleFrame>;
  if (!l.data) return <ConsoleFrame title="Lot" description="Lot detail." path="/console/record"><Empty>There is no such lot.</Empty></ConsoleFrame>;
  const d = l.data;
  return (
    <ConsoleFrame title={d.reference} description="One lot, its claim, its flags and its genealogy." path="/console/record">
      <p class="body-big">
        <Words>{d.disposition}</Words> · {fmtBP(d.content_bp)} on a {d.claim_type} basis
      </p>
      <div class="balance-figures">
        <div class="figure-row"><span class="grotesk">Mass</span><span class="figure mono">{fmtG(d.mass_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Credit attached</span><span class="figure mono">{fmtG(d.credit_attached_g)}</span></div>
        <div class="figure-row"><span class="grotesk">Content</span><span class="figure mono">{fmtBP(d.content_bp)} ({d.claim_type})</span></div>
        <div class="figure-row"><span class="grotesk">Derivation</span><span class="figure mono">{d.derivation?.content_bp}</span></div>
      </div>
      {(d.flags || []).length > 0 && (
        <Banner refusal>
          Flags carried from upstream: {(d.flags || []).join(", ")}. A flag anywhere in the
          genealogy is visible from the lot.
        </Banner>
      )}
      <section class="section">
        <h3>Genealogy</h3>
        <p class="body-regular"><Link href={`/console/lots/${d.reference}/genealogy`}>Open the genealogy graph and its text equivalent</Link></p>
      </section>
    </ConsoleFrame>
  );
}

export default function RecordSection({ rest }) {
  const parts = (props.rest || "").split("/").filter(Boolean);
  if (parts[0] === "runs" && parts[1]) return <RunDetail reference={parts[1]} />;
  if (parts[0] === "batches" && parts[1]) return <BatchDetail reference={parts[1]} />;
  if (parts[0] === "lots" && parts[1]) return <LotDetail reference={parts[1]} />;
  return <RecordHome />;
}

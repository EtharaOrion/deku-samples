import { h } from "preact";
import { Link } from "../../api.jsx";
import { useState } from "preact/hooks";
import { useApi, api, Loading, Empty, Banner, fmtG, dateOnly, Words } from "../../api.jsx";
import { ConsoleFrame } from "../console.jsx";

export default function Intake() {
  const batches = useApi("/batches");
  const collectors = useApi("/collectors");
  const [form, setForm] = useState({
    collector: "COL-ALDER", site: "SITE-DEMO", grade: "N6", category: "",
    gross_g: "", tare_g: "", net_g: "", moisture_bp: "0", moisture_method: "ISO 15512",
    device: "WB-DEMO-01", received_on: "", custody_complete: true,
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setResult(null); setBusy(true);
    const custody = form.custody_complete
      ? ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"].map((kind) => ({
          kind, date: form.received_on, party: form.collector,
        }))
      : ["collection_site", "collector", "arrival", "weighing", "acceptance"].map((kind) => ({
          kind, date: form.received_on, party: form.collector,
        }));
    try {
      const res = await api("/batches", {
        method: "POST",
        body: { ...form, custody, composition: [], contamination: { non_nylon_bp: 0, elastane_bp: 0, coatings: "none", colour_load: "unknown", foreign_matter: "none" } },
      });
      setResult(res);
      batches.reload?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleFrame title="Feedstock intake" description="Book in a batch: mass, moisture, custody and category, which has no default." path="/console/intake">
      <div class="grid-2">
        <form class="card" onSubmit={submit}>
          <h3 style="margin-top:0">Book in a batch</h3>
          {error && <Banner refusal>
            The batch was refused: {String(error.body?.error || error.message)}.
            {error.body?.rule && <> {error.body.rule}</>}
          </Banner>}
          {result && <Banner>
            Batch <span class="mono ref">{result.reference}</span> booked in. Dry mass{" "}
            {fmtG(result.dry_mass_g)}.{" "}
            {result.claimable
              ? "The batch is claimable input."
              : <>This batch cannot be claimed: {result.claimable_reason}.</>}
            {(result.flags || []).length > 0 && <> Flags: {result.flags.join(", ")}.</>}
          </Banner>}
          <div class="grid-2">
            <div class="field">
              <label for="collector">Collector</label>
              <select id="collector" value={form.collector} onChange={(e) => setForm({ ...form, collector: e.target.value })}>
                {(collectors.data || []).map((c) => <option value={c.reference}>{c.name}</option>)}
              </select>
            </div>
            <div class="field">
              <label for="category">Category — required, no default</label>
              <select id="category" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Choose a category</option>
                <option value="post_consumer">post_consumer</option>
                <option value="pre_consumer">pre_consumer</option>
              </select>
            </div>
          </div>
          <div class="grid-3">
            <div class="field">
              <label for="gross">Gross (g)</label>
              <input id="gross" type="number" step="1" required value={form.gross_g} onInput={(e) => setForm({ ...form, gross_g: e.target.value })} />
            </div>
            <div class="field">
              <label for="tare">Tare (g)</label>
              <input id="tare" type="number" step="1" required value={form.tare_g} onInput={(e) => setForm({ ...form, tare_g: e.target.value })} />
            </div>
            <div class="field">
              <label for="net">Net (g)</label>
              <input id="net" type="number" step="1" required value={form.net_g} onInput={(e) => setForm({ ...form, net_g: e.target.value })} />
            </div>
          </div>
          <div class="grid-3">
            <div class="field">
              <label for="moisture">Moisture (basis points)</label>
              <input id="moisture" type="number" step="1" required value={form.moisture_bp} onInput={(e) => setForm({ ...form, moisture_bp: e.target.value })} />
            </div>
            <div class="field">
              <label for="device">Weighing device</label>
              <select id="device" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })}>
                <option value="WB-DEMO-01">WB-DEMO-01</option>
                <option value="WB-DEMO-02">WB-DEMO-02</option>
              </select>
            </div>
            <div class="field">
              <label for="received">Received on</label>
              <input id="received" type="date" required value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} />
            </div>
          </div>
          <div class="field">
            <label for="custody">Custody</label>
            <select id="custody" value={form.custody_complete ? "complete" : "missing-transport"} onChange={(e) => setForm({ ...form, custody_complete: e.target.value === "complete" })}>
              <option value="complete">complete chain of custody</option>
              <option value="missing-transport">missing the transport link</option>
            </select>
          </div>
          <button class="primary" type="submit" disabled={busy}>{busy ? "Booking…" : "Book in the batch"}</button>
          <p class="body-small">A category cannot be changed after acceptance, by anybody, through any route.</p>
        </form>

        <section>
          <h3>Collector approvals in force</h3>
          {collectors.loading ? <Loading /> : collectors.data?.length ? (
            <div class="stack">
              {collectors.data.map((c) => (
                <div class="card" key={c.reference}>
                  <p class="body-regular" style="margin:0">
                    <span class="mono ref">{c.reference}</span> {c.name}
                  </p>
                  <p class="body-small grotesk" style="margin:0.2rem 0">
                    {(c.approval_periods || []).map((p) => (
                      <span style="display:inline-block;margin-right:0.7rem">
                        <Words>{p.state}</Words> {p.valid_from} → {p.valid_to}
                        {p.expiring && " · expiring"}
                        {p.condition && ` · ${p.condition} (closes ${p.condition_closes_on})`}
                      </span>
                    ))}
                  </p>
                  {(c.findings || []).length > 0 && (
                    <p class="body-small" style="margin:0.2rem 0 0">
                      {(c.findings || []).map((f) => <Words>finding open</Words>)}
                      {" "}Departure of {f.departure_bp} basis points on {dateOnly((c.findings || [])[0].raised_on)}.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : <Empty>No collectors are held.</Empty>}
        </section>
      </div>

      <section class="section">
        <h2>Batches</h2>
        {batches.loading ? <Loading /> : batches.data?.length ? (
          <div class="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Batch</th><th>Collector</th><th>Category</th><th>Received</th>
                  <th class="figure">Net</th><th class="figure">Dry mass</th>
                  <th>Claimable</th><th>Flags</th><th>Custody</th>
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.reference}>
                    <td><Link class="mono ref" href={`/console/record/batches/${b.reference}`}>{b.reference}</Link></td>
                    <td>{b.collector_name}</td>
                    <td class="grotesk">{b.category}</td>
                    <td class="mono ref">{b.received_on}</td>
                    <td class="figure mono">{fmtG(b.net_g)}</td>
                    <td class="figure mono">{fmtG(b.dry_mass_g)}</td>
                    <td class="grotesk">
                      {b.claimable ? "claimable" : <Words>non-claimable</Words>}
                      {!b.claimable && <span class="body-small grotesk"> ({b.claimable_reason})</span>}
                    </td>
                    <td>{(b.flags || []).map((f) => <Words>{f}</Words>)}</td>
                    <td class="grotesk">{b.custody_complete ? "complete" : <Words>missing {(b.missing_custody_kinds || []).join(", ")}</Words>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>There are no batches yet.</Empty>}
      </section>
    </ConsoleFrame>
  );
}

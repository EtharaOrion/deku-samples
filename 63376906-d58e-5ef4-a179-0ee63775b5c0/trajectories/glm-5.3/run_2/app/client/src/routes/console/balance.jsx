import { h } from "preact";
import { Link } from "../../api.jsx";
import { useApi, api, Loading, Empty, Banner, fmtG, fmtBP, dateOnly, Words } from "../../api.jsx";
import { useState } from "preact/hooks";
import { ConsoleFrame } from "../console.jsx";

export default function Balance({ rest }) {
  const periods = useApi("/balance-periods");
  const id = (rest || "").split("/").filter(Boolean)[0];
  const fallback = periods.loading ? null : (periods.data?.find((p) => p.state === "open")?.label || periods.data?.[0]?.label || null);
  const chosen = id || fallback;
  const period = useApi(chosen ? `/balance-periods/${chosen}` : null, [chosen]);
  const [alloc, setAlloc] = useState({ lot: "LOT-N6-0001", category: "post_consumer", mass_g: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (periods.loading) {
    return <ConsoleFrame title="Balance" description="The ledger, per site, grade and period." path="/console/balance"><Loading /></ConsoleFrame>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setResult(null);
    try {
      const res = await api(`/balance-periods/${chosen}/allocations`, {
        method: "POST", body: { ...alloc, mass_g: Number(alloc.mass_g) },
      });
      setResult(res);
      await period.reload?.();
    } catch (err) {
      setError(err);
      // The figures are re-read and the refusal stays on the screen: the
      // figures do not change, and the banner names both masses.
      await period.reload?.();
    }
  };

  return (
    <ConsoleFrame title="Balance" description="Credits in, credits out, credits available, per category." path="/console/balance">
      <p class="body-regular">
        {periods.data?.length ? "Periods:" : ""}
        {periods.data?.map((p) => (
          <span style="margin-right:1rem">
            <Link href={"/console/balance/" + p.label} class="mono ref">{p.label}</Link>{" "}
            <span class="grotesk">{p.state === "closed" ? <Words>closed</Words> : "open"}</span>
          </span>
        ))}
      </p>

      {period.loading ? <Loading /> : !period.data ? <Empty>No such period.</Empty> : (() => {
        const p = period.data;
        return (
          <div>
            <p class="body-big">
              {p.site} · {p.grade} · {p.period_from} to {p.period_to} ·{" "}
              {p.state === "closed" ? <Words>closed</Words> : <Words>open</Words>}
              {p.state === "closed" && ` on ${p.closed_on}, cut-off ${p.cut_off}`}
            </p>
            {p.state === "closed" && (
              <Banner>This period is closed. Corrections require a restatement.</Banner>
            )}

            <section class="section">
              <h2>Credits</h2>
              <div class="tablewrap">
                <table>
                  <thead>
                    <tr><th>Category</th><th class="figure">Credits in</th><th class="figure">Credits out</th><th class="figure">Credits available</th></tr>
                  </thead>
                  <tbody>
                    {["post_consumer", "pre_consumer"].map((cat) => (
                      <tr key={cat}>
                        <td class="grotesk">{cat}</td>
                        <td class="figure mono">{fmtG(p.credits_in_g[cat])}</td>
                        <td class="figure mono">{fmtG(p.credits_out_g[cat])}</td>
                        <td class="figure mono">{fmtG(p.credits_available_g[cat])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="body-small grotesk">Derivation: {p.derivation?.credits_available_g}.</p>
              <p class="body-regular">
                The invariant's margin is a mass: the remaining claimable mass is{" "}
                <span class="mono figure">{fmtG(p.credits_available_g.post_consumer)}</span>{" "}
                post-consumer and{" "}
                <span class="mono figure">{fmtG(p.credits_available_g.pre_consumer)}</span>{" "}
                pre-consumer. The two categories are never netted.
              </p>
            </section>

            <section class="section">
              <h2>Three counts, none a badge</h2>
              <div class="balance-figures">
                <div class="figure-row"><span class="grotesk">Overrides this period</span><span class="figure mono">{p.override_count}</span></div>
                <div class="figure-row"><span class="grotesk">Open restatements</span><span class="figure mono">{p.open_restatement_count}</span></div>
                <div class="figure-row"><span class="grotesk">Audit findings open</span><span class="figure mono">{p.open_finding_count}</span></div>
                <div class="figure-row"><span class="grotesk">Non-claimable input</span><span class="figure mono">{fmtG(p.non_claimable_input_g)}</span></div>
              </div>
            </section>

            {p.inbound_credits?.length > 0 && (
              <section class="section">
                <h2>Inbound credits from other sites</h2>
                <div class="tablewrap">
                  <table>
                    <thead><tr><th>Movement</th><th>Origin site</th><th class="figure">Mass</th><th>Fresh credit</th></tr></thead>
                    <tbody>
                      {p.inbound_credits.map((i) => (
                        <tr key={i.movement}>
                          <td class="mono ref">{i.movement}</td>
                          <td class="mono ref">{i.origin_site}</td>
                          <td class="figure mono">{fmtG(i.mass_g)}</td>
                          <td class="grotesk">{i.fresh_credit ? "yes" : <Words>not a fresh credit</Words>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section class="section">
              <h2>Attach claim to a lot</h2>
              {p.state === "closed" ? (
                <Banner>This period is closed. Corrections require a restatement.</Banner>
              ) : (
                <form class="card" onSubmit={submit}>
                  {error && (
                    <Banner refusal>
                      This allocation is refused. Available:{" "}
                      <span class="mono figure">{fmtG(error.body?.available_g)}</span>. Requested:{" "}
                      <span class="mono figure">{fmtG(error.body?.requested_g)}</span>. No credit
                      has moved.
                    </Banner>
                  )}
                  {result && (
                    <Banner>
                      Attached {fmtG(result.mass_g)} of {result.category} claim to{" "}
                      <span class="mono ref">{result.lot}</span>. The lot now carries{" "}
                      {fmtBP(result.content_bp)} on a {result.claim_type} basis.
                    </Banner>
                  )}
                  <div class="grid-3">
                    <div class="field">
                      <label for="lot">Lot</label>
                      <input id="lot" value={alloc.lot} onInput={(e) => setAlloc({ ...alloc, lot: e.target.value })} />
                    </div>
                    <div class="field">
                      <label for="cat">Category</label>
                      <select id="cat" value={alloc.category} onChange={(e) => setAlloc({ ...alloc, category: e.target.value })}>
                        <option value="post_consumer">post_consumer</option>
                        <option value="pre_consumer">pre_consumer</option>
                      </select>
                    </div>
                    <div class="field">
                      <label for="mass">Mass (g)</label>
                      <input id="mass" type="number" step="1" min="1" value={alloc.mass_g} onInput={(e) => setAlloc({ ...alloc, mass_g: e.target.value })} />
                    </div>
                  </div>
                  <button class="primary" type="submit">Attach claim</button>
                  <p class="body-small">
                    No percentage is accepted here or anywhere: the content figure is computed
                    from the ledger, as credit attached over lot mass, floored.
                  </p>
                </form>
              )}
            </section>

            <section class="section">
              <h2>Movements</h2>
              <div class="tablewrap">
                <table>
                  <thead><tr><th class="figure">Id</th><th>Kind</th><th>Category</th><th class="figure">Mass</th><th>Reference</th><th>Origin</th><th>Effective on</th></tr></thead>
                  <tbody>
                    {p.movements.map((m) => (
                      <tr key={m.id}>
                        <td class="figure mono">{m.id}</td>
                        <td class="grotesk">{m.kind}</td>
                        <td class="grotesk">{m.category}</td>
                        <td class="figure mono">{fmtG(m.mass_g)}</td>
                        <td class="mono ref">{m.reference || "—"}</td>
                        <td class="mono ref">{m.origin_site || "—"}</td>
                        <td class="mono ref">{m.effective_on}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {p.state === "closed" && p.carried_forward && (
              <section class="section">
                <h2>Carry-over settled at close</h2>
                <div class="balance-figures">
                  <div class="figure-row"><span class="grotesk">Carried forward, post-consumer</span><span class="figure mono">{fmtG(p.carried_forward.post_consumer)}</span></div>
                  <div class="figure-row"><span class="grotesk">Expired, post-consumer</span><span class="figure mono">{fmtG(p.expired.post_consumer)}</span></div>
                  <div class="figure-row"><span class="grotesk">Carried forward, pre-consumer</span><span class="figure mono">{fmtG(p.carried_forward.pre_consumer)}</span></div>
                  <div class="figure-row"><span class="grotesk">Expired, pre-consumer</span><span class="figure mono">{fmtG(p.expired.pre_consumer)}</span></div>
                </div>
              </section>
            )}
          </div>
        );
      })()}
    </ConsoleFrame>
  );
}

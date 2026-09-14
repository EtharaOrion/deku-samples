import { h } from "preact";
import { useState } from "preact/hooks";
import { useApi, api, Loading, Empty, Banner, fmtG, dateOnly, Words } from "../api.jsx";
import { ConsoleFrame } from "./console.jsx";

// The graph is a graph and not a tree: a batch reached by several paths is
// drawn once, with the total mass it contributed.
function Graph({ nodes, edges }) {
  const byFrom = new Map();
  for (const e of edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from).push(e);
  }
  const lotNode = nodes.find((n) => n.kind === "lot");
  if (!lotNode) return <Empty>No genealogy is held for this lot.</Empty>;
  const drawn = new Set();
  const draw = (ref, depth) => {
    if (drawn.has(ref) && depth > 4) return null;
    drawn.add(ref);
    const node = nodes.find((n) => n.reference === ref);
    const incoming = edges.filter((e) => e.to === ref);
    return (
      <div class="graph" style="margin-left:0">
        <p class="body-regular" style="margin:0">
          <span class="grotesk">{node?.kind}</span> <span class="mono ref">{ref}</span>{" "}
          {node?.mass_g !== null && node?.mass_g !== undefined && (
            <span class="mono figure">{fmtG(node.mass_g)}</span>
          )}
          {(node?.flags || []).length > 0 && (node.flags || []).map((f) => <Words>{f.split(":")[0]}</Words>)}
        </p>
        {incoming.map((e) => {
          const from = nodes.find((n) => n.reference === e.from);
          return (
            <div class="edge" key={`${e.from}-${ref}-${e.mass_g}`}>
              <span class="grotesk">{from?.kind}</span>
              <span class="mono ref">{e.from}</span>
              <span class="mono figure">{fmtG(e.mass_g)}</span>
              {(from?.flags || []).length > 0 && from.flags.map((f) => <Words>{f.split(":")[0]}</Words>)}
              {drawn.has(e.from) ? null : draw(e.from, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };
  return draw(lotNode.reference, 0);
}

function NestedList({ node }) {
  return (
    <ul class="nested">
      {(node.children || []).map((c) => (
        <li key={c.reference + (c.mass_g ?? "")}>
          <span class="grotesk">{c.kind}</span> <span class="mono ref">{c.reference}</span>{" "}
          <span class="mono figure">edge {fmtG(c.mass_g)}</span>{" "}
          <span class="mono figure">total {c.node_mass_g === null ? "—" : fmtG(c.node_mass_g)}</span>{" "}
          {(c.flags || []).map((f) => <Words>{f.split(":")[0]}</Words>)}
          {c.category_split && Object.keys(c.category_split).length > 0 && (
            <span class="body-small grotesk">
              {" "}({Object.entries(c.category_split).map(([k, v]) => `${k} ${fmtG(v)}`).join(", ")})
            </span>
          )}
          <NestedList node={c} />
        </li>
      ))}
    </ul>
  );
}

export default function Genealogy({ reference }) {
  const g = useApi(`/lots/${reference}/genealogy`, [reference]);
  const [exported, setExported] = useState(null);
  const [exportError, setExportError] = useState(null);

  const doExport = async () => {
    setExportError(null);
    try {
      const res = await api("/exports", { method: "POST", body: { scope: { sites: [], certificates: [], period: null, genealogy_of: reference } } });
      setExported(res);
    } catch (err) {
      setExportError(err);
    }
  };

  if (g.loading) return <ConsoleFrame title="Genealogy" description="Genealogy of a lot." path="/console"><Loading /></ConsoleFrame>;
  if (!g.data) return <ConsoleFrame title="Genealogy" description="Genealogy of a lot." path="/console"><Empty>There is no such lot.</Empty></ConsoleFrame>;
  const d = g.data;
  return (
    <ConsoleFrame title={`Genealogy of ${reference}`} description="The same facts twice: as a graph and as a nested list." path={`/console/lots/${reference}/genealogy`}>
      {d.flagged && (
        <Banner refusal>
          Something in this genealogy carries a flag. It is visible here without expanding
          anything.
        </Banner>
      )}
      <section class="section">
        <h2>The graph</h2>
        <Graph nodes={d.nodes} edges={d.edges} />
      </section>
      <section class="section">
        <h2>The same facts as a nested list</h2>
        <p class="body-regular">
          The lot is <span class="mono ref">{d.text_equivalent.node}</span>.
        </p>
        <NestedList node={d.text_equivalent} />
      </section>
      <section class="section no-print">
        <h2>Export</h2>
        <p class="body-regular">
          The list is what an auditor exports. Every export is itself an entry.
        </p>
        <button onClick={doExport}>Export the genealogy</button>
        {exported && (
          <Banner>
            Export <span class="mono ref">{exported.reference}</span> recorded, returning{" "}
            {exported.returned_rows} rows{exported.returned_nothing ? " (nothing)" : ""}, with
            record anchors and a chain head of <span class="mono ref">{String(exported.chain_head).slice(0, 12)}…</span>.
          </Banner>
        )}
        {exportError && <Banner refusal>The export failed: {String(exportError.body?.error || exportError.message)}.</Banner>}
      </section>
      <p class="body-small grotesk">Read at {d.read_at}</p>
    </ConsoleFrame>
  );
}

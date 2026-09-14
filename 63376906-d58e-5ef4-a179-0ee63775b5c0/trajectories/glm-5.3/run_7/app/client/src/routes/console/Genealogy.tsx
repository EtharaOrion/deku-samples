// The genealogy view: a graph, not a tree, and the same facts as a nested list.
import { useEffect, useState } from 'preact/hooks';
import { api, g } from '../../lib/api';
import { Loading, Empty, StateWord, FlagWords } from '../../components/Figures';
import { usePath } from '../../router';

type Node = { kind: string; reference: string; mass_g: number; category_split: Record<string, number>; flags: string[] };
type Edge = { from: string; to: string; mass_g: number };
type Genealogy = { lot: string; nodes: Node[]; edges: Edge[]; flagged: boolean; text_equivalent: any };

export function GenealogyGraph({ data }: { data: Genealogy }) {
  const nodes = data.nodes;
  const lotNode = nodes.find((n) => n.kind === 'lot');
  const cols = Math.min(4, Math.max(1, Math.ceil(nodes.length / 4)));
  const width = Math.max(640, cols * 190);
  const height = Math.max(260, Math.ceil(nodes.length / cols) * 92 + 90);
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    pos.set(n.reference, { x: 90 + (i % cols) * 190, y: 70 + Math.floor(i / cols) * 92 });
  });

  return (
    <div class="card">
      <p class="label">Graph. A batch reached by several paths is drawn once; edges carry mass rather than a percentage.</p>
      <div class="genealogy-scroll">
        <svg class="genealogy-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Genealogy graph for ${data.lot}`}>
          {data.edges.map((e, i) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--muted)" stroke-width="1" />;
          })}
          {nodes.map((n) => {
            const p = pos.get(n.reference)!;
            const isLot = n.kind === 'lot';
            return (
              <g key={n.reference}>
                <rect x={p.x - 82} y={p.y - 26} width="164" height="52" rx="6"
                  fill={isLot ? 'var(--ink)' : 'var(--paper)'} stroke="var(--ink)" stroke-width={isLot ? 1.5 : 1} stroke-dasharray={n.flags.length ? '4 2' : undefined} />
                <text x={p.x} y={p.y - 8} text-anchor="middle" font-family="Space Mono, monospace" font-size="10.5" fill={isLot ? 'var(--ground)' : 'var(--ink)'}>{n.reference}</text>
                <text x={p.x} y={p.y + 6} text-anchor="middle" font-family="Space Mono, monospace" font-size="10" fill={isLot ? 'var(--ground)' : 'var(--ink)'}>{n.mass_g.toLocaleString('en-GB')} g · {n.kind}</text>
                <text x={p.x} y={p.y + 19} text-anchor="middle" font-family="Archivo, sans-serif" font-size="9" fill={isLot ? 'var(--ground)' : 'var(--muted)'}>
                  {n.flags.length ? n.flags.join(',') : Object.keys(n.category_split).join(' ') || '—'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {data.flagged ? (
        <p style="margin-top:0.75rem"><VectorWarning /> A flag anywhere in this graph is visible from the lot without expanding anything.</p>
      ) : null}
    </div>
  );
}

function VectorWarning() {
  return <span class="label"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-3px"><path d="M12 4 2.5 20h19L12 4Z" fill="none" stroke="currentColor" stroke-width="1.6" /></svg> flagged</span>;
}

export function NestedList({ node }: { node: any }) {
  const split = Object.entries(node.category_split || {});
  return (
    <li>
      <p style="margin:0.15rem 0">
        <span class="mono">{node.reference}</span> · <span class="label">{node.kind}</span> ·{' '}
        <span class="figures">{Number(node.mass_g).toLocaleString('en-GB')} g</span>
        {split.length ? <> · {split.map(([k, v]) => <span class="label" key={k}>{k.replace(/_/g, ' ')} {Number(v).toLocaleString('en-GB')} g</span>)}</> : null}
        {node.flags && node.flags.length ? <> <FlagWords flags={node.flags} /></> : null}
        {node.edge_mass_g !== undefined ? <span class="label"> (edge {Number(node.edge_mass_g).toLocaleString('en-GB')} g)</span> : null}
      </p>
      {node.feeds && node.feeds.length ? <ul class="nested">{node.feeds.map((f: any, i: number) => <NestedList key={f.reference + i} node={f} />)}</ul> : null}
    </li>
  );
}

export default function Genealogy({ kind = 'lot' }: { kind?: 'lot' | 'batch' }) {
  const path = usePath();
  const parts = path.split('/').filter(Boolean);
  const reference = parts[parts.length - 1] === 'genealogy' ? parts[parts.length - 2] : parts[parts.length - 1];
  const [data, setData] = useState<Genealogy | null>(null);
  const [impact, setImpact] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind === 'batch') {
      api<any>('/batches/' + reference + '/impact').then(setImpact).catch((e) => setError(e.message));
    } else {
      api<Genealogy>('/lots/' + reference + '/genealogy').then(setData).catch((e) => setError(e.message));
    }
  }, [reference, kind]);

  if (error) return <div class="console-shell"><div class="banner refused"><span class="label">Refused</span><p>{error}</p></div></div>;

  if (kind === 'batch') {
    if (!impact) return <div class="console-shell"><Loading what="The reverse traversal" /></div>;
    return (
      <div class="console-shell">
        <h1>Reverse traversal from <span class="mono">{reference}</span></h1>
        <p class="measure">Every lot containing any of this batch, every certificate resting on those lots, and every recipient. The complete set, never paginated.</p>
        <section><h2>Lots</h2>
          {impact.lots.length === 0 ? <Empty what="lots containing this batch" /> : (
            <ul class="figure-list">
              {impact.lots.map((l: any) => <li key={l.reference}><span class="mono">{l.reference}</span><span class="figures">{g(l.mass_g)}</span></li>)}
            </ul>
          )}
        </section>
        <section><h2>Certificates</h2>
          {impact.certificates.length === 0 ? <Empty what="certificates resting on those lots" /> : (
            <ul class="figure-list">
              {impact.certificates.map((c: any) => (
                <li key={c.number}>
                  <span class="mono">{c.number} · {c.state}</span>
                  <span class="figures">{c.content_bp} bp · {c.claim_type.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section><h2>Recipients</h2>
          {impact.recipients.length === 0 ? <Empty what="recipients" /> : (
            <ul>{impact.recipients.map((r: any) => <li key={r.reference}><span class="mono">{r.reference}</span> {r.name}</li>)}</ul>
          )}
        </section>
      </div>
    );
  }

  if (!data) return <div class="console-shell"><Loading what="The genealogy" /></div>;

  return (
    <div class="console-shell">
      <h1>Genealogy of <span class="mono">{reference}</span></h1>
      <p class="measure">The same facts twice: as the graph and as the nested list an auditor exports. A traversal over the consumption records rather than a stored summary.</p>
      {data.nodes.length === 0 ? <Empty what="nodes" /> : (
        <>
          <GenealogyGraph data={data} />
          <section>
            <h2>The same facts as a nested list</h2>
            <ul class="nested"><NestedList node={data.text_equivalent} /></ul>
          </section>
        </>
      )}
    </div>
  );
}

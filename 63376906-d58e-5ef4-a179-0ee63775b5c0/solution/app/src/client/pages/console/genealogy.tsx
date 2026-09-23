/**
 * The genealogy of one lot: a graph rather than a tree, and the same facts as a
 * nested list. A batch reached by several paths is drawn once with its total
 * mass, and every edge carries a mass rather than a percentage.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { GENEALOGY_KINDS } from '../../../shared/enums';
import { ArrowMark, FlagMark, Mark } from '../../components/marks';
import { Banner, Empty, Loading } from '../../components/status';
import { grams, words } from '../../format';
import { detailOf, post, useFetch } from './hooks';
import type { ExportView } from './artefacts';
import { categorySplitText, counted, flagWord, flagWords } from './states';
import type { GenealogyNode, GenealogyView, LotView } from './views';

const BOX_W = 215;
const BOX_H = 104;
const GAP_X = 76;
const GAP_Y = 30;
const LANE = 22;

interface Placed {
  node: GenealogyNode;
  x: number;
  y: number;
}

function place(nodes: GenealogyNode[]): Placed[] {
  const rows = new Map<string, number>();
  return nodes.map((node) => {
    const column = Math.max(GENEALOGY_KINDS.indexOf(node.kind), 0);
    const row = rows.get(node.kind) ?? 0;
    rows.set(node.kind, row + 1);
    return { node, x: column * (BOX_W + GAP_X), y: row * (BOX_H + GAP_Y) };
  });
}

function Graph({ graph }: { graph: GenealogyView }): JSX.Element {
  const placed = place(graph.nodes);
  const at = new Map(placed.map((entry) => [entry.node.reference, entry]));
  const width = GENEALOGY_KINDS.length * BOX_W + (GENEALOGY_KINDS.length - 1) * GAP_X;
  const rowsPerKind = GENEALOGY_KINDS.map((kind) => graph.nodes.filter((node) => node.kind === kind).length);
  const height = Math.max(...rowsPerKind) * (BOX_H + GAP_Y);

  return (
    <div class="scroller genealogy-figure">
      <svg
        class="genealogy-graph"
        viewBox={`-4 ${-LANE - 20} ${width + 8} ${height + LANE + 24}`}
        width={width}
        height={height + LANE + 20}
        role="img"
        aria-label={`The genealogy of ${graph.lot} as a graph. The same nodes, masses, category splits and flags are listed beneath it.`}
      >
        {graph.edges.map((edge, index) => {
          const from = at.get(edge.from);
          const to = at.get(edge.to);
          if (!from || !to) return null;
          /* An edge leaves the side it travels towards, so no line crosses a box. */
          const forwards = to.x > from.x;
          const x1 = forwards ? from.x + BOX_W : from.x;
          const x2 = forwards ? to.x : to.x + BOX_W;
          const y1 = from.y + BOX_H / 2;
          const y2 = to.y + BOX_H / 2;
          const skipped = Math.abs(to.x - from.x) > BOX_W + GAP_X;
          if (skipped) {
            /* An edge that skips a column takes the lane above the graph. */
            const lane = -LANE;
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <polyline
                  class="diagram__flow"
                  points={`${x1},${y1} ${x1},${lane} ${x2},${lane} ${x2},${y2}`}
                />
                <text class="genealogy-edge" x={(x1 + x2) / 2} y={lane - 6} text-anchor="middle">
                  {grams(edge.mass_g)}
                </text>
              </g>
            );
          }
          /* The label sits in the gap between two columns, clear of the boxes. */
          const labelX = (x1 + x2) / 2;
          const labelY = y1 + ((y2 - y1) * (labelX - x1)) / (x2 - x1 || 1) + (index % 2 === 0 ? -10 : 20);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line class="diagram__flow" x1={x1} y1={y1} x2={x2} y2={y2} />
              <text class="genealogy-edge" x={labelX} y={labelY} text-anchor="middle">
                {grams(edge.mass_g)}
              </text>
            </g>
          );
        })}
        {placed.map((entry) => (
          <g key={entry.node.reference}>
            <rect class="diagram__box" x={entry.x} y={entry.y} width={BOX_W} height={BOX_H} rx="6" />
            <text class="diagram__stage" x={entry.x + 12} y={entry.y + 24}>
              {words(entry.node.kind)}
            </text>
            <text class="diagram__figure" x={entry.x + 12} y={entry.y + 46}>
              {entry.node.reference}
            </text>
            <text class="diagram__figure" x={entry.x + 12} y={entry.y + 64}>
              {grams(entry.node.mass_g)}
            </text>
            <text class="diagram__figure" x={entry.x + 12} y={entry.y + 82}>
              {categorySplitText(entry.node.category_split)}
            </text>
            <text class="genealogy-flag" x={entry.x + 12} y={entry.y + 98}>
              {flagWords(entry.node.flags)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Entry({
  reference,
  graph,
  seen,
}: {
  reference: string;
  graph: GenealogyView;
  seen: Set<string>;
}): JSX.Element | null {
  if (seen.has(reference)) return null;
  seen.add(reference);
  const node = graph.nodes.find((held) => held.reference === reference);
  if (!node) return null;
  const outgoing = graph.edges.filter((edge) => edge.from === reference);
  const feeding = graph.edges.filter((edge) => edge.to === reference);
  return (
    <li>
      <p>
        <span class="mono">{`${words(node.kind)} ${node.reference}, ${grams(node.mass_g)}, ${categorySplitText(node.category_split)}. `}</span>
        {node.flags.length === 0 ? 'not flagged' : node.flags.map(flagWord).join(', ')}
        {outgoing.length > 0
          ? ` Contributed ${outgoing.map((edge) => `${grams(edge.mass_g)} into ${edge.to}`).join(' and ')}.`
          : ''}
      </p>
      {feeding.length > 0 ? (
        <ul class="list-marked">
          {feeding.map((edge) => (
            <Entry key={edge.from} reference={edge.from} graph={graph} seen={seen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ExportControl({ site, lot }: { site: string; lot: string }): JSX.Element {
  const [taken, setTaken] = useState<ExportView | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function run(): Promise<void> {
    setRefusal(null);
    setWorking(true);
    try {
      setTaken(await post<ExportView>('/exports', { period: null, sites: [site], grades: [], certificates: [] }));
    } catch (error) {
      setRefusal(detailOf(error));
    }
    setWorking(false);
  }

  return (
    <div class="stack">
      {refusal ? <Banner word="Refused">{`This export was not recorded: ${refusal}.`}</Banner> : null}
      {taken ? (
        <Banner word="Exported">
          {`${taken.reference} carries ${counted(taken.digests.length, 'digest', 'digests')} and read at ${taken.read_at}. The scope naming ${site} was recorded before the read of ${lot}.`}
        </Banner>
      ) : null}
      <button type="button" class="button-quiet" onClick={run} disabled={working}>
        <Mark name="arrow" labelFirst label={working ? 'Recording the scope …' : 'Export'} />
      </button>
    </div>
  );
}

export function GenealogyScreen({ reference }: { reference: string }): JSX.Element {
  const genealogy = useFetch<GenealogyView>(`/lots/${reference}/genealogy`);
  const lot = useFetch<LotView>(`/lots/${reference}`);
  const graph = genealogy.data;

  return (
    <section class="section">
      <span class="eyebrow">Genealogy</span>
      <h1 class="console-title mono">{reference}</h1>
      <p>
        A batch reaches this lot across four hops and often by several paths, so this is a graph and
        not a tree. Each batch is drawn once carrying the total mass it contributed, each edge carries
        a mass rather than a percentage, and the nested list beneath the graph is the same
        information in another form rather than a summary of it.
      </p>
      <p>
        <ArrowMark label="Read from the lot backwards to the batches" />
      </p>

      {genealogy.loading ? <Loading what={`the genealogy of ${reference}`} /> : null}
      {genealogy.error ? (
        <Empty sentence={`The genealogy of ${reference} could not be read: ${genealogy.error}.`} />
      ) : null}

      {graph ? (
        <>
          <p>
            {graph.flagged
              ? 'A flag stands somewhere in this graph, and it is visible from the lot without expanding anything.'
              : 'Nothing anywhere in this graph is flagged.'}
          </p>
          {graph.flagged ? (
            <ul class="list-plain flag-list">
              {[...new Set(graph.nodes.flatMap((node) => node.flags))].map((flag) => (
                <li key={flag}>
                  <FlagMark label={flagWord(flag)} />
                </li>
              ))}
            </ul>
          ) : null}

          <Graph graph={graph} />

          <h2 class="console-heading">The same genealogy as a nested list</h2>
          <ul class="list-marked tree">
            <Entry reference={graph.lot} graph={graph} seen={new Set<string>()} />
          </ul>

          <h2 class="console-heading">Export</h2>
          <p>
            An export states its scope before it reads anything, and it is itself an entry in the
            record. This one is scoped to the site that produced the lot.
          </p>
          {lot.data ? <ExportControl site={lot.data.site} lot={reference} /> : <Loading what="the lot" />}
        </>
      ) : null}
    </section>
  );
}

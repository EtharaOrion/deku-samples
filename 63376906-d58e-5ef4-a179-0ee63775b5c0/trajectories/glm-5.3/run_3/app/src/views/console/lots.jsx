import { h } from 'preact';
import { Meta, useData, Loading, Empty, ContentWithClaim } from '../../components/ui.jsx';
import { Link } from '../../lib/router.jsx';
export default function Lots({ lotRef: ref, view: view }) {
  const lots = useData('/lots');
  const lot = useData(`/lots/${ref}`, !!ref);
  const gen = useData(`/lots/${ref}/genealogy`, ref && view === 'genealogy');
  if (!ref) {
    return h('div', { class: 'route shell' },
      h(Meta, { title: 'Lots | Ravel console', description: 'The lot register with its content, claim type and flags.' }),
      h('h1', null, 'Lots'),
      lots.loading ? h(Loading) : (lots.data || []).length === 0 ? h(Empty, null, 'No lots have been produced yet.') :
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Lot'), h('th', null, 'Site'), h('th', { class: 'num' }, 'Mass g'), h('th', null, 'Disposition'), h('th', null, 'Content'), h('th', null, 'Flags'))),
          h('tbody', null, lots.data.map((l) => h('tr', { key: l.reference },
            h('td', null, h(Link, { class: 'mono underline', href: `/console/lots/${l.reference}` }, l.reference)),
            h('td', { class: 'mono' }, l.site),
            h('td', { class: 'num' }, l.mass_g.toLocaleString('en-GB')),
            h('td', null, h('span', { class: 'state' }, l.disposition)),
            h('td', null, h(ContentWithClaim, { content_bp: l.content_bp, claim_type: l.claim_type })),
            h('td', null, (l.flags || []).map((f) => h('span', { class: 'flag', key: f }, f.replace(/_/g, ' '), ' ')).concat([h(Link, { class: 'small underline', href: `/console/lots/${l.reference}/genealogy` }, 'genealogy')]))))))));
  }
  if (view === 'genealogy') {
    return h('div', { class: 'route shell' },
      h(Meta, { title: `Genealogy of ${ref} | Ravel console`, description: 'A graph, not a tree: the same facts as a graph and as a nested list.' }),
      h('div', { class: 'spread' }, h('h1', null, 'Genealogy'), h('p', { class: 'small mono' }, ref)),
      h('p', { class: 'small' }, 'A batch reached by several paths appears once, with the total mass it contributed. ', gen.data?.flagged ? h('span', { class: 'flag' }, 'A flag is present in this graph.') : 'No flag anywhere in this graph.'),
      gen.loading ? h(Loading) : gen.error ? h(Empty, null, 'This lot has no genealogy yet.') :
        h('div', { class: 'grid-2' },
          GraphView(gen.data),
          ListView(gen.data)));
  }
  return h('div', { class: 'route shell' },
    h(Meta, { title: `${ref} | Ravel console`, description: 'The lot record with its claim, its flags and its deviations.' }),
    h('h1', { class: 'mono' }, ref),
    lot.loading ? h(Loading) : !lot.data ? h(Empty, null, 'No lot at this address.') : h('div', { class: 'route' },
      h('div', { class: 'spread' }, h('p', { class: 'body-big' }, h(ContentWithClaim, { content_bp: lot.data.content_bp, claim_type: lot.data.claim_type })),
        h('p', { class: 'small' }, h('span', { class: 'state' }, lot.data.disposition))),
      h('div', { class: 'figrows' },
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Mass'), h('span', { class: 'mono' }, `${lot.data.mass_g.toLocaleString('en-GB')} g`)),
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Site'), h('span', { class: 'mono' }, lot.data.site)),
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Attached claim'), h('span', { class: 'mono' }, `${(lot.data.attached_claim_g || 0).toLocaleString('en-GB')} g`))),
      (lot.data.flags || []).length ? h('div', { class: 'banner' }, h('p', { class: 'label' }, 'Flags on this lot'), lot.data.flags.map((f) => h('p', { class: 'flag', key: f }, f.replace(/_/g, ' ')))) : null,
      (lot.data.overrides || []).length ? h('div', { class: 'banner' }, h('p', { class: 'label' }, 'Overrides'),
        lot.data.overrides.map((o) => h('p', { key: o.reference, class: 'small' }, `${o.reference} · ${o.separation.replace(/_/g, ' ')} · `, o.reviewed ? 'reviewed' : h('span', { class: 'flag' }, 'unreviewed'), ` · Separation overridden by ${o.authorised_by} on ${o.authorised_on}. This cannot be removed.`))) : null,
      (lot.data.deviations || []).length ? h('div', { class: 'banner' }, h('p', { class: 'label' }, 'Deviations'),
        lot.data.deviations.map((d) => h('p', { key: d.reference, class: 'small' }, `${d.reference} · `, h('span', { class: 'state' }, d.state), ` · ${d.description}`))) : null,
      h('p', null, h(Link, { class: 'btn', href: `/console/lots/${ref}/genealogy` }, 'Open the genealogy ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')))));
}
function GraphView(g) {
  const byKey = new Map(g.nodes.map((n) => [`${n.kind}:${n.reference}`, n]));
  const cols = {};
  const depth = (k, d) => { if (!cols[k] || cols[k] < d) cols[k] = d; for (const e of g.edges.filter((x) => x.to === k)) depth(e.from, d + 1); };
  depth(`lot:${g.lot}`, 0);
  return h('section', { 'aria-label': 'Genealogy graph' }, h('h2', { class: 'label' }, 'The graph'),
    h('ul', { style: 'display:grid;gap:.4rem' }, g.nodes.map((n) => {
      const key = `${n.kind}:${n.reference}`;
      return h('li', { class: 'run-card', key: key, style: `margin-left:${Math.min(cols[key] || 0, 4) * 1.25}rem` },
        h('div', { class: 'spread' }, h('span', { class: 'mono' }, n.reference), h('span', { class: 'label' }, n.kind)),
        h('p', { class: 'small mono' }, `mass ${n.mass_g.toLocaleString('en-GB')} g`, Object.keys(n.category_split || {}).length ? ` · ${Object.entries(n.category_split).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v.toLocaleString('en-GB')} g`).join(' · ')}` : ''),
        (n.flags || []).length ? n.flags.map((f) => h('p', { class: 'flag', key: f }, f.replace(/_/g, ' '))) : null);
    })));
}
function ListView(g) {
  return h('section', { 'aria-label': 'Genealogy as a nested list' }, h('h2', { class: 'label' }, 'The same facts as a nested list'),
    h('ul', { class: 'small' }, (g.text_equivalent || []).map((n, i) => Node(n, i))));
}
const Node = (n, i) => h('li', { key: i, style: 'display:grid;gap:.2rem;padding:.5rem 0;border-bottom:1px solid color-mix(in srgb, var(--ink) 12%, transparent)' },
  h('p', null, h('span', { class: 'mono' }, n.reference), ` (${n.kind}) — ${n.mass_g.toLocaleString('en-GB')} g`,
    Object.keys(n.category_split || {}).length ? `, ${Object.entries(n.category_split).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v.toLocaleString('en-GB')} g`).join(', ')}` : ''),
  (n.flags || []).length ? h('p', { class: 'flag' }, 'flagged: ' + n.flags.join(', ').replace(/_/g, ' ')) : null,
  n.to ? h('ul', null, n.to.map((child, j) => Node(child.node, j))) : null);

import { h } from 'preact';
import { Meta, useData, Loading, CapacityWithConfidence } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
const INDUSTRIES = ['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'];
const GRADES = [
  { name: 'Nylon 6', limitation: 'recycled Nylon 6 came almost entirely from one source, discarded fishing nets', claim: 'Recycled content is claimed by mass balance under RCS-2026 and is stated with its type beside its percentage.', basis: 'mass_balance' },
  { name: 'Nylon 6,6', limitation: 'Nylon 6,6 had no recycling solution at all', claim: 'Recycled content is claimed by controlled blending under RCS-2026 and is stated with its type beside its percentage.', basis: 'controlled_blending' },
];
export default function Product() {
  const sites = useData('/sites');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Product — Same material. Better origin. | Ravel', description: 'We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.' }),
    h('section', null,
      h(Reveal, { as: 'h1' }, 'Same material. Better origin.'),
      h('p', { class: 'body-big' }, 'We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.')),
    h('section', null, h(Reveal, { as: 'h2' }, 'Two grades'),
      h('div', { class: 'grid-2' }, GRADES.map((g) => h('div', { class: 'card', key: g.name },
        h('h4', null, g.name),
        h('p', { class: 'label' }, 'Real limitation'),
        h('p', { class: 'small' }, 'Before Ravel, ', g.limitation, '.'),
        h('hr', { class: 'rule' }),
        h('p', { class: 'label' }, 'The claim, beside the grade it applies to'),
        h('p', { class: 'small' }, g.claim),
        h('p', { class: 'small mono' }, 'claim type: ', g.basis.replace(/_/g, ' '), ' · scheme: RCS-2026'))))),
    h('section', null, h(Reveal, { as: 'h2' }, 'Six industries'), h('ul', { class: 'grid-3' }, INDUSTRIES.map((i) => h('li', { class: 'card small', key: i }, i)))),
    h('section', null, h(Reveal, { as: 'h2' }, 'Three features'),
      h('div', { class: 'grid-3' },
        h('div', { class: 'card' }, h('h4', null, 'Nylon in any form'), h('p', { class: 'small' }, 'Nets, carpet, offcuts, textile waste and post-industrial scrap: any form the polymer arrives in, the process returns it to caprolactam and rebuilds it.')),
        h('div', { class: 'card' }, h('h4', null, 'A ledger you can walk'), h('p', { class: 'small' }, 'Every claim is allocated from a ledger of movements. Losses reduce the claim. No percentage is ever accepted from a person.')),
        h('div', { class: 'card' }, h('h4', null, 'A certificate your regulator accepts'), h('p', { class: 'small' }, 'Eight conditions are checked on the server at the moment of signing, none waivable, and the document is verifiable without an account.')))),
    h('section', null, h(Reveal, { as: 'h2' }, 'Specifications'),
      sites.loading ? h(Loading) : h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Site'), h('th', { class: 'num' }, 'Nameplate'), h('th', { class: 'num' }, 'Contracted'), h('th', { class: 'num' }, 'Uncommitted'))),
        h('tbody', null, (sites.data || []).map((s) => h(SiteCapacityRow, { site: s, key: s.reference }))))),
      h('p', { class: 'small' }, 'Capacity figures are published with the confidence the company holds in them. A capacity figure is never returned without it.')));
}
function SiteCapacityRow({ site }) {
  const cap = useData(`/sites/${site.reference}/capacity`);
  if (cap.loading) return h('tr', null, h('td', { colSpan: 4 }, h(Loading, { label: `Capacity for ${site.name}` })));
  const d = cap.data || {};
  return h('tr', null,
    h('td', null, h('span', { class: 'mono' }, site.reference), ' ', site.name),
    h('td', { class: 'num' }, d.nameplate_kg != null ? h(CapacityWithConfidence, { kg: d.nameplate_kg, confidence: d.confidence }) : '—'),
    h('td', { class: 'num' }, (d.contracted_kg ?? 0).toLocaleString('en-GB'), ' kg/yr'),
    h('td', { class: 'num' }, (d.uncommitted_kg ?? 0).toLocaleString('en-GB'), ' kg/yr', d.uncommitted_kg < 0 ? ' ' : ''));
}

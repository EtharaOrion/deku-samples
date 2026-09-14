import { h } from 'preact';
import { Meta } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
const STAGES = [
  ['Dissolution', 'Mixed waste is dissolved and the polymer is separated from contamination.', 'In: 450000 g', 'Out: 480000 g'],
  ['Depolymerisation', 'The polymer is returned to its monomer.', 'In: 850000 g', 'Out: 800000 g'],
  ['Purification', 'The monomer is purified to polymerisation grade.', 'In: 800000 g', 'Out: 760000 g'],
  ['Repolymerisation', 'The monomer is rebuilt into virgin-quality pellet.', 'In: 720000 g', 'Out: 700000 g'],
];
const ATTRS = [
  ['Green chemicals & reagents', 'Solvent and reagent selections are made against supplier EPDs published with their sources and years.', true],
  ['Low temperature & pressure', 'Process runs below the thresholds published in our recipe versions; temperature and pressure are stated on any published claim that uses them.', true],
  ['Low carbon impact', 'Every carbon figure carries its boundary, its method version and its uncertainty, and is compared against a named virgin comparator by name.', true],
  ['Plant-scale output', 'The demonstration plant runs today; the commercial plant is consented and planned.', false],
  ['Traceable origin', 'Every batch names its collector, its custody chain and its claimability on its receipt date.', false],
];
export default function Technology() {
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Technology — four stages, low temperature and pressure | Ravel', description: 'Dissolution, depolymerisation, purification, repolymerisation: the four stages that return mixed polyamide waste to virgin-quality pellet.' }),
    h('section', null, h(Reveal, { as: 'h1' }, 'Four stages, drawn as they run'),
      h('p', { class: 'body-big' }, 'The plant is drawn rather than photographed, and the diagram is generated from the four run types, so it stays correct when a stage changes.')),
    h('section', { 'aria-label': 'Process diagram' }, ProcessDiagram(), TextEquivalent()),
    h('section', null, h(Reveal, { as: 'h2' }, 'Capacity'),
      h('p', { class: 'label' }, 'Unit stated once: kilograms of pellet per year. Basis: 8000 hours per year, 0.90 availability, 0.80 yield.'),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Plant'), h('th', { class: 'num' }, 'Capacity'), h('th', null, 'Confidence'))),
        h('tbody', null,
          h('tr', null, h('td', null, 'Commercial Plant (2030+)'), h('td', { class: 'num' }, '>25,000 tonnes per year'), h('td', null, h('span', { class: 'state' }, 'planned'))),
          h('tr', null, h('td', null, 'Demonstration Plant (2026)'), h('td', { class: 'num' }, '400 tonnes per year'), h('td', null, h('span', { class: 'state' }, 'commissioned'))),
          h('tr', null, h('td', null, 'Pilot (2026)'), h('td', { class: 'num' }, '40 tonnes per year'), h('td', null, h('span', { class: 'state' }, 'commissioned'))))))),
    h('section', null, h(Reveal, { as: 'h2' }, 'Five attributes'),
      h('ul', { class: 'grid-2' }, ATTRS.map(([t, d, isClaim]) => h('li', { class: 'card', key: t },
        h('h4', null, t),
        h('p', { class: 'small' }, d),
        isClaim ? h('p', { class: 'label' }, 'A claim: evidence carried beside it') : null)))));
}
const ProcessDiagram = () => h('div', { role: 'img', 'aria-label': 'Diagram of the four process stages with mass in and mass out per stage', style: 'display:grid;gap:0' },
  STAGES.map(([name, desc, inn, out], i) => h('div', { key: name, style: 'display:grid;grid-template-columns:minmax(7rem,1fr) 2fr;gap:1rem;padding:1rem 0;border-bottom:1px solid color-mix(in srgb, var(--ink) 18%, transparent);align-items:center' },
    h('svg', { width: '48', height: '48', viewBox: '0 0 48 48', 'aria-hidden': 'true' },
      h('circle', { cx: 24, cy: 24, r: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
      h('text', { x: 24, y: 29, 'text-anchor': 'middle', 'font-family': 'monospace', 'font-size': 14, fill: 'currentColor' }, String(i + 1))),
    h('div', null, h('h4', null, name), h('p', { class: 'small' }, desc),
      h('p', { class: 'small mono' }, inn, ' → ', out)))));
const TextEquivalent = () => h('details', null, h('summary', { class: 'label' }, 'Text equivalent of the diagram'),
  h('ul', { class: 'small' }, STAGES.map(([name, , inn, out]) => h('li', { key: name }, `${name}: mass in ${inn.replace('In: ', '')}, mass out ${out.replace('Out: ', '')}.`))));

import { h } from 'preact';
import { Meta, useData, Loading, Empty } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
export default function About() {
  const stats = useData('/statistics');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'About — the hard facts | Ravel', description: 'Three statistics with their sources, years and geographies, and the company behind them.' }),
    h('section', null, h(Reveal, { as: 'h1' }, 'A chemical recycler, built on a record'),
      h('p', { class: 'body-big' }, 'Ravel operates a chemical recycling plant that returns mixed polyamide waste to virgin-quality pellet. The register is considered, print-like and unhurried, and the reader is an auditor rather than a shopper.')),
    h('section', null, h(Reveal, { as: 'h2' }, 'The hard facts'),
      stats.loading ? h(Loading) : (stats.data || []).length === 0 ? h(Empty, null, 'No published figures.') :
        h('ul', { class: 'grid-3' }, stats.data.map((s) => h('li', { class: 'card', key: s.key },
          h('p', { class: 'body-big' }, h('span', { class: 'mark' }, s.value)),
          h('p', { class: 'label' }, `${s.source} · ${s.year} · ${s.geography}`))))),
    h('p', { class: 'small' }, 'The emissions figure is stated as a mass: 1.8 gigatonnes of carbon dioxide equivalent a year from plastics production.'));
}
